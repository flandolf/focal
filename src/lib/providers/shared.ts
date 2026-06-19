/**
 * Provider-side helpers shared between Ollama and OpenRouter implementations.
 *
 * Kept thin and dependency-free so both providers can import without pulling in
 * app-wide utilities (`src/lib/utils.ts`). Anything that needs `cn`, date
 * helpers, etc. stays in app scope.
 */

import type { ChatMessage } from "@/lib/providers/types"

// --- LLM exchange logging (dev-only) -------------------------------------

/**
 * Shape of the debug dump emitted by `logLlmExchange`. Keep it minimal —
 * the goal is "what did the host send back?", not a full transcript. The
 * raw response is kept intact so a developer can `JSON.parse` it from the
 * DevTools console.
 */
export interface LlmExchangeLog {
  provider: string
  model: string | undefined
  requestAttempt: number
  /** Raw body the host returned. May be a parsed JSON object or an error text. */
  rawResponse: unknown
  /** Content string after Ollama's `extractJsonPayload` post-processing (or raw content). */
  resolvedContent: string
  /** Number of tool calls the provider extracted; kept at 0 while tools are unsupported. */
  toolCallCount: number
  /** Finish reason reported by the host, when present. */
  finishReason?: string
  /** Optional free-form note (e.g. "retry triggered after JSON parse failure"). */
  note?: string
}

/**
 * Emit a debug-style console log of a chat-completion exchange. Gated on
 * `import.meta.env.DEV` so production builds are silent. Lives in shared so
 * both Ollama and OpenRouter stick to the same format.
 *
 * The log uses plain `console.log` calls (not `console.groupCollapsed` /
 * `console.debug`) so each line is visible at default log level and the model
 * output is scannable in devtools without expanding anything.
 */
export function logLlmExchange(log: LlmExchangeLog): void {
  if (!import.meta.env.DEV) return
  const label = `[llm ${log.provider}] ${log.model ?? "?"} · attempt ${log.requestAttempt}`
  // eslint-disable-next-line no-console
  console.log(label)
  if (log.note) {
    // eslint-disable-next-line no-console
    console.log("  note:", log.note)
  }
  // eslint-disable-next-line no-console
  console.log("  finishReason:", log.finishReason ?? "(none)")
  // eslint-disable-next-line no-console
  console.log("  toolCallCount:", log.toolCallCount)
  // ponytail: print the resolved content on its own indented block so it's
  // visually easy to spot in devtools even when it's multi-line or fenced.
  // eslint-disable-next-line no-console
  console.log("  resolvedContent:")
  // eslint-disable-next-line no-console
  console.log(log.resolvedContent)
  // eslint-disable-next-line no-console
  console.log("  rawResponse:")
  // eslint-disable-next-line no-console
  console.log(log.rawResponse)
}

// --- JSON extraction ------------------------------------------------------

/**
 * Extract the first balanced JSON object or array from a free-form text
 * response. Most local models wrap their JSON output in prose ("Here is the
 * plan:") or markdown fences (`` ```json ``) even when `response_format` is
 * set. This helper pulls the JSON substring out so callers can `JSON.parse`
 * the result without hand-rolled regexes.
 *
 * Returns the trimmed original text when no balanced JSON value can be found,
 * letting the caller's existing parser surface a useful "not JSON" error.
 */
export function extractJsonPayload(text: string): string {
  if (typeof text !== "string") return ""
  const stripped = stripCodeFence(text).trim()
  if (!stripped) return ""
  const sliceFrom = findJsonStart(stripped)
  if (sliceFrom < 0) return stripped
  const sliceTo = findMatchingEnd(stripped, sliceFrom)
  if (sliceTo <= sliceFrom) return stripped
  return stripped.slice(sliceFrom, sliceTo + 1).trim()
}

/** Strip a leading ``` or ```json/-lang markdown code fence and its closer. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenceOpen = /^```(?:json|json5|javascript|js|typescript|ts)?\s*\n?/i.exec(trimmed)
  if (!fenceOpen) return trimmed
  const afterOpen = trimmed.slice(fenceOpen[0].length)
  const fenceClose = /\n?```\s*$/.exec(afterOpen)
  return fenceClose ? afterOpen.slice(0, afterOpen.length - fenceClose[0].length) : afterOpen
}

/**
 * Locate the index of the first character that opens a JSON value: `{` or `[`.
 * Tolerates surrounding prose and strings. Returns -1 when neither is found.
 */
function findJsonStart(text: string): number {
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (ch === "\\") { escape = true; continue }
      if (ch === "\"") inString = false
      continue
    }
    if (ch === "\"") { inString = true; continue }
    if (ch === "{" || ch === "[") return i
  }
  return -1
}

/**
 * Given the index of an opening `{` or `[`, walk forward respecting strings
 * and escapes and return the index of its matching closer. Falls back to the
 * end of the string when the value is unterminated — that lets `JSON.parse`
 * fail with its own "unexpected end of input" message instead of masking it
 * here.
 */
function findMatchingEnd(text: string, openIndex: number): number {
  const openChar = text[openIndex]
  const closeChar = openChar === "{" ? "}" : "]"
  let depth = 0
  let inString = false
  let escape = false
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (ch === "\\") { escape = true; continue }
      if (ch === "\"") inString = false
      continue
    }
    if (ch === "\"") { inString = true; continue }
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return i
    }
  }
  return text.length - 1
}

// --- Chat-message translation -------------------------------------------

/** Pull the finish reason out of an OpenAI-shape response choice. */
export function extractFinishReason(choice: unknown): string | undefined {
  if (typeof choice !== "object" || choice === null) return undefined
  const reason = (choice as { finish_reason?: unknown }).finish_reason
  return typeof reason === "string" ? reason : undefined
}

/** Translate a `ChatMessage` into the OpenAI wire shape. */
export function toOpenAIChatMessage(message: ChatMessage): Record<string, unknown> {
  return { role: message.role, content: message.content }
}

// --- JSON-shape validation ----------------------------------------------

/**
 * Map a parsed JSON payload against the top-level shape required by a
 * `JsonSchemaSpec`. Returns `{ matches, missingRootKeys, presentRootKeys }`
 * so callers can build targeted retry hints. Used to catch the failure mode
 * where Ollama / local models return *valid* JSON but with the wrong root
 * structure (e.g. wrong key name) — `JSON.parse` is happy but the caller's
 * parser explodes with a confusing "missing X array" message.
 */
export interface JsonShapeCheck {
  matches: boolean
  missingRootKeys: string[]
  presentRootKeys: string[]
}

export function validateJsonRootShape(
  parsed: unknown,
  schema: Record<string, unknown> | undefined,
): JsonShapeCheck {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { matches: false, missingRootKeys: [], presentRootKeys: [] }
  }
  const record = parsed as Record<string, unknown>
  const presentRootKeys = Object.keys(record)
  const required = Array.isArray(schema?.required)
    ? (schema?.required as unknown[]).filter((key): key is string => typeof key === "string")
    : []
  if (required.length === 0) return { matches: true, missingRootKeys: [], presentRootKeys }
  const missingRootKeys = required.filter((key) => !Object.prototype.hasOwnProperty.call(record, key))
  return { matches: missingRootKeys.length === 0, missingRootKeys, presentRootKeys }
}

export interface ModelDriftRecovery {
  /** The (possibly rewrapped) value the caller should use for shape validation. */
  value: unknown
  /** True when `value` differs from the input. */
  recovered: boolean
  /** Dev-console-friendly description of what happened (empty when not recovered). */
  note: string
}

/**
 * Recover from common small-model JSON drift after schema-constrained output:
 *   - The model returned a top-level array and skipped the schema's one array
 *     key. Rewrap as `{ [requiredKey]: [array] }`.
 *   - The model returned a single object for an array property. Wrap it.
 *   - Falls back to "schema has exactly one array property" when the schema
 *     didn't declare `required` but the lone array is clearly the intended
 *     destination.
 *
 * Returns the value untouched (with `recovered: false`) when no rule applies.
 * Free-form `note` describes what we did for the dev console only.
 */
export function recoverFromModelDrift(
  value: unknown,
  schema: Record<string, unknown> | undefined,
): ModelDriftRecovery {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { value, recovered: false, note: "" }
  }
  const propertiesRaw = schema.properties
  const properties: Record<string, unknown> = (propertiesRaw && typeof propertiesRaw === "object" && !Array.isArray(propertiesRaw))
    ? propertiesRaw as Record<string, unknown>
    : {}
  if (Object.keys(properties).length === 0) {
    return { value, recovered: false, note: "" }
  }
  const requiredRaw = Array.isArray(schema.required) ? schema.required as unknown[] : []
  const requiredKeys = requiredRaw.filter((k): k is string => typeof k === "string")
  if (requiredKeys.length === 1) {
    const requiredKey = requiredKeys[0]
    const property = properties[requiredKey] as Record<string, unknown> | undefined
    if (property?.type === "array" && Array.isArray(value) && value.length > 0) {
      return {
        value: { [requiredKey]: value },
        recovered: true,
        note: `array at root rewrapped under schema's required array key "${requiredKey}"`,
      }
    }
    const shallow = recoverSingleArrayProperty(value, requiredKey, property)
    if (shallow.recovered) return shallow
  }
  if (requiredKeys.length === 0) {
    const arrayKeys = Object.entries(properties)
      .filter(([, p]) => {
        const propRecord = p as Record<string, unknown> | undefined
        return propRecord?.type === "array"
      })
      .map(([k]) => k)
    if (arrayKeys.length === 1) {
      const arrayKey = arrayKeys[0]
      if (Array.isArray(value) && value.length > 0) {
        return {
          value: { [arrayKey]: value },
          recovered: true,
          note: `array at root rewrapped under schema's lone array property "${arrayKey}"`,
        }
      }
      const property = properties[arrayKey] as Record<string, unknown> | undefined
      const shallow = recoverSingleArrayProperty(value, arrayKey, property)
      if (shallow.recovered) return shallow
    }
  }
  return { value, recovered: false, note: "" }
}

function recoverSingleArrayProperty(
  value: unknown,
  arrayKey: string,
  property: Record<string, unknown> | undefined,
): ModelDriftRecovery {
  if (property?.type !== "array" || typeof value !== "object" || value === null || Array.isArray(value)) {
    return { value, recovered: false, note: "" }
  }
  const record = value as Record<string, unknown>
  if (Array.isArray(record[arrayKey])) return { value, recovered: false, note: "" }
  if (record[arrayKey] !== undefined) {
    return {
      value: { ...record, [arrayKey]: unwrapSingleArrayWrapper(record[arrayKey]) },
      recovered: true,
      note: `schema array key "${arrayKey}" was emitted as an object and wrapped into an array`,
    }
  }
  const keys = Object.keys(record)
  if (keys.length !== 1) return { value, recovered: false, note: "" }
  // ponytail: for one-array schemas, a lone wrong key is usually the array
  // item wrapper (e.g. { event: {...} }); deeper schema validation can replace
  // this if more structured-output features need it.
  return {
    value: { [arrayKey]: unwrapSingleArrayWrapper(record[keys[0]]) },
    recovered: true,
    note: `single wrong root key "${keys[0]}" rewrapped under schema array key "${arrayKey}"`,
  }
}

function unwrapSingleArrayWrapper(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length === 1) {
      const inner = record[keys[0]]
      return Array.isArray(inner) ? inner : [inner]
    }
  }
  return [value]
}
