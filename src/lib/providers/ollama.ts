/**
 * Ollama provider.
 *
 * Uses Ollama's native API (`/api/chat`) instead of the OpenAI-compatible
 * `/v1/chat/completions` layer. For structured output, native Ollama supports
 * `format: <json schema>`, which constrains the model more reliably than JSON
 * mode, XML prompting, or tool-calling tricks on small local models.
 *
 * Tool calling is exposed for agent-style flows such as the chat assistant.
 * Structured-output callers still use `format: <json schema>` because that
 * remains the shortest path for one valid JSON payload.
 */
import { getOllamaBaseUrl, getOllamaModel } from "@/lib/settings"
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatMessage,
  JsonSchemaSpec,
  ModelInfo,
  Provider,
  ProviderHealthcheck,
  ToolCall,
} from "@/lib/providers/types"
import {
  logLlmExchange,
  normalizeStructuredJson,
} from "@/lib/providers/shared"

const DEFAULT_BASE_URL = "http://localhost:11434"
const KEEP_ALIVE = "30m"

interface OllamaTagModel {
  name: string
  model?: string
  modified_at?: string
}

interface OllamaTagsEnvelope {
  models?: OllamaTagModel[]
}

interface OllamaChatResponse {
  message?: { content?: unknown; tool_calls?: unknown }
  done_reason?: string
}

function isOllamaTagModel(value: unknown): value is OllamaTagModel {
  return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string"
}

/** Normalise a base URL to the native Ollama root, accepting older `/v1` settings. */
function resolveBaseUrl(): string {
  const raw = getOllamaBaseUrl()
  const base = (raw ?? "").trim() || DEFAULT_BASE_URL
  const trimmed = base.replace(/\/+$/, "")
  return trimmed.endsWith("/v1") ? trimmed.slice(0, -3) : trimmed
}

async function fetchOllamaModels(base: string): Promise<ModelInfo[]> {
  const res = await fetch(`${base}/api/tags`)
  if (!res.ok) throw new Error(`Ollama /api/tags failed (${res.status})`)
  const parsed: unknown = await res.json()
  const envelope = (parsed as OllamaTagsEnvelope)?.models
  if (!Array.isArray(envelope)) throw new Error("Unexpected Ollama /api/tags response shape")
  return envelope.filter(isOllamaTagModel).map((model) => ({
    id: model.name,
    name: model.name,
    supportsStructuredOutput: true,
  }))
}

async function postChat(base: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama API error (${res.status}): ${text}`)
  }
  return res.json()
}

function toOllamaMessage(message: ChatMessage): Record<string, unknown> {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolName ? { tool_name: message.toolName } : {}),
    ...(message.toolCalls ? {
      tool_calls: message.toolCalls.map((call, index) => ({
        type: "function",
        function: {
          index,
          name: call.name,
          arguments: call.arguments,
        },
      })),
    } : {}),
  }
}

function buildJsonOutputInstruction(spec: JsonSchemaSpec): string {
  const required = Array.isArray(spec.schema.required)
    ? (spec.schema.required as unknown[]).filter((key): key is string => typeof key === "string")
    : []
  const requiredClause = required.length > 0
    ? ` Top-level keys: ${required.map((key) => `"${key}"`).join(", ")}.`
    : ""
  return `\n\nReturn only JSON matching the supplied schema.${requiredClause} Exact keys, arrays stay arrays, no null, no markdown, no prose.`
}

function withJsonOutputInstructions(messages: ChatMessage[], spec: JsonSchemaSpec): ChatMessage[] {
  const instruction = buildJsonOutputInstruction(spec)
  if (messages.length > 0 && messages[0]?.role === "system") {
    const head = messages[0]
    return [
      { role: "system", content: `${head.content}${instruction}` },
      ...messages.slice(1),
    ]
  }
  return [{ role: "system", content: instruction.trim() }, ...messages]
}

function buildRequestBody(req: ChatCompletionRequest, messages: ChatMessage[]): Record<string, unknown> {
  const options: Record<string, unknown> = {}
  if (typeof req.temperature === "number") options.temperature = req.temperature
  if (typeof req.maxTokens === "number") options.num_predict = req.maxTokens

  return {
    model: req.model,
    messages: messages.map(toOllamaMessage),
    stream: false,
    keep_alive: KEEP_ALIVE,
    ...(req.jsonSchema ? { format: req.jsonSchema.schema } : {}),
    ...(req.tools ? { tools: req.tools } : {}),
    ...(Object.keys(options).length > 0 ? { options } : {}),
  }
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value)
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

function parseOllamaToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ToolCall[] => {
    if (typeof item !== "object" || item === null) return []
    const record = item as Record<string, unknown>
    const fn = record.function
    if (typeof fn !== "object" || fn === null) return []
    const fnRecord = fn as Record<string, unknown>
    if (typeof fnRecord.name !== "string" || !fnRecord.name.trim()) return []
    const id = typeof record.id === "string" ? record.id : undefined
    return [{
      ...(id ? { id } : {}),
      name: fnRecord.name,
      arguments: parseToolArguments(fnRecord.arguments),
    }]
  })
}

function parseOllamaContent(data: unknown): { content: string; finishReason: string | undefined; toolCalls: ToolCall[] } {
  const message = (data as OllamaChatResponse)?.message
  if (typeof message !== "object" || message === null) {
    throw new Error("No message in Ollama response")
  }
  const content = typeof message.content === "string" ? message.content : ""
  const toolCalls = parseOllamaToolCalls(message.tool_calls)
  const finishReason = typeof (data as OllamaChatResponse).done_reason === "string"
    ? (data as OllamaChatResponse).done_reason
    : undefined
  return { content, finishReason, toolCalls }
}

function buildJsonRetryHint(schema: Record<string, unknown>, presentRootKeys: string[]): string {
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((key): key is string => typeof key === "string")
    : []
  const requiredClause = required.length > 0
    ? ` Include these exact top-level keys: ${required.map((key) => `"${key}"`).join(", ")}.`
    : ""
  const presentClause = presentRootKeys.length > 0
    ? ` Your previous top-level keys were: ${presentRootKeys.map((key) => `"${key}"`).join(", ")}.`
    : ""
  return `Your previous answer did not match the required JSON schema.${requiredClause}${presentClause} Reply again with only the corrected JSON object. No markdown, no prose, no extra wrapper key.`
}

export const ollamaProvider: Provider = {
  id: "ollama",
  displayName: "Ollama",
  summary: "Local models via Ollama (free, runs on this device, no API key required).",
  requiresApiKey: false,
  configFields: [
    {
      key: "baseUrl",
      label: "Server URL",
      kind: "text",
      required: true,
      placeholder: DEFAULT_BASE_URL,
      helpUrl: "https://ollama.com",
    },
    { key: "model", label: "Model", kind: "text", required: true },
  ],
  supportsReasoning: false,
  supportsToolCalling: true,

  isConfigured(): boolean {
    return Boolean(resolveBaseUrl()) && Boolean(getOllamaModel())
  },

  async listModels(): Promise<ModelInfo[]> {
    return fetchOllamaModels(resolveBaseUrl())
  },

  async healthcheck(): Promise<ProviderHealthcheck> {
    const base = resolveBaseUrl()
    try {
      const res = await fetch(`${base}/api/tags`)
      if (!res.ok) return { ok: false, error: `Ollama responded ${res.status}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const base = resolveBaseUrl()
    if (!req.model) throw new Error("Ollama model not configured")

  const messages = req.jsonSchema ? withJsonOutputInstructions(req.messages, req.jsonSchema) : req.messages
  let data = await postChat(base, buildRequestBody(req, messages), req.signal)
  let parsed = parseOllamaContent(data)
    let normalized = req.jsonSchema ? normalizeStructuredJson(parsed.content, req.jsonSchema.schema) : undefined
    let content = normalized?.content ?? parsed.content

    if (req.jsonSchema) {
      if (!normalized?.matches) {
        logLlmExchange({
          provider: "ollama",
          model: req.model,
          requestAttempt: 1,
          rawResponse: data,
          resolvedContent: content,
          toolCallCount: parsed.toolCalls.length,
          ...(parsed.finishReason ? { finishReason: parsed.finishReason } : {}),
          note: `native JSON-schema response did not match root shape (missing: ${normalized && normalized.missingRootKeys.length > 0 ? normalized.missingRootKeys.join(", ") : "unknown"})`,
        })
        data = await postChat(base, buildRequestBody(req, [
          ...messages,
          { role: "assistant", content: parsed.content },
          { role: "user", content: buildJsonRetryHint(req.jsonSchema.schema, normalized?.presentRootKeys ?? []) },
        ]), req.signal)
        parsed = parseOllamaContent(data)
        normalized = normalizeStructuredJson(parsed.content, req.jsonSchema.schema)
        content = normalized.content
        logLlmExchange({
          provider: "ollama",
          model: req.model,
          requestAttempt: 2,
          rawResponse: data,
          resolvedContent: content,
          toolCallCount: parsed.toolCalls.length,
          ...(parsed.finishReason ? { finishReason: parsed.finishReason } : {}),
          note: normalized.note || "retry after native JSON-schema shape mismatch",
        })
      } else {
        logLlmExchange({
          provider: "ollama",
          model: req.model,
          requestAttempt: 1,
          rawResponse: data,
          resolvedContent: content,
          toolCallCount: parsed.toolCalls.length,
          ...(parsed.finishReason ? { finishReason: parsed.finishReason } : {}),
          note: normalized.note || "native JSON-schema response matched root shape",
        })
      }
    } else {
      logLlmExchange({
        provider: "ollama",
        model: req.model,
        requestAttempt: 1,
        rawResponse: data,
        resolvedContent: content,
        toolCallCount: parsed.toolCalls.length,
        ...(parsed.finishReason ? { finishReason: parsed.finishReason } : {}),
      })
    }

    return {
      content,
      ...(parsed.toolCalls.length > 0 ? { toolCalls: parsed.toolCalls } : {}),
      ...(parsed.finishReason ? { finishReason: parsed.finishReason } : {}),
    } satisfies ChatCompletionResult
  },
}
