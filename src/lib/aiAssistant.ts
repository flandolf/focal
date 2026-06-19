/**
 * Central helpers shared by every AI feature (Copilot, AutoRename,
 * TextEventPlanner, the chat assistant, session reflection, briefings).
 *
 * Keeps the union of small but cross-cutting ergonomics in one place:
 *   - Wrapping `provider.chatCompletion` with structured-output coercion,
 *     cancellation, and a typed return.
 *   - Translating thrown provider errors into UI-friendly diagnostics
 *     that include a one-line recovery hint.
 *   - Cheap cost estimates from a model's pricing block so the UI can show
 *     "approx $0.002" before the user commits. ponytail: pricing is
 *     `string` from OpenRouter; we connect it to `maxTokens` which is the
 *     only knob callers routinely set. Real token accounting happens on
 *     the host.
 *   - The VCE-flavored handful-of-subjects primer used by every prompt
 *     builder so features stay consistent.
 *
 * Kept dependency-light on purpose — there's no React, no UI imports, and
 * nothing app-globally mutable.
 */

import { getReasoningConfig } from "@/lib/settings"
import {
  getActiveProvider,
  getEffectiveModel,
  type ChatCompletionRequest,
  type ChatMessage,
  type JsonSchemaSpec,
  type ModelInfo,
  type Provider,
} from "@/lib/providers"
import { isUserAbort } from "@/lib/providers/shared"
import type { Project, StudySession, Subject } from "@/lib/types"
import { getLocalDateValue } from "@/lib/utils"

// --- Errors --------------------------------------------------------------

export class AiCancelledError extends Error {
  constructor(message = "Request was cancelled") {
    super(message)
    this.name = "AiCancelledError"
  }
}

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiConfigurationError"
  }
}

/**
 * Translate a thrown value from `provider.chatCompletion` into a string the
 * UI can render directly, including a short hint that names the most likely
 * remedy (configure provider, switch model, retry). Caller-supplied errors
 * from JSON parsing are presented as-is so the dev-console sender is visible.
 */
export interface AiErrorHint {
  message: string
  hint: string | null
  cancelled: boolean
}

export function describeAiError(e: unknown): AiErrorHint {
  if (isUserAbort(e)) {
    return { message: "Request cancelled", hint: null, cancelled: true }
  }
  const raw = e instanceof Error ? e.message : String(e)

  if (e instanceof AiConfigurationError) {
    return {
      message: raw,
      hint: "Open Settings → AI to choose and configure a provider.",
      cancelled: false,
    }
  }

  const provider = getActiveProvider()
  const lower = raw.toLowerCase()
  // ponytail: pattern-match on the most common shapes. The match order matters —
  // we want "structured" to win over the generic "API error" wording.
  if (lower.includes("structured_outputs") || lower.includes("structured output")) {
    return {
      message: raw,
      hint: `Switch to a model that supports structured output (the model picker filters these).`,
      cancelled: false,
    }
  }
  if (lower.includes("404") && provider.id === "ollama") {
    return {
      message: raw,
      hint: "Check the Ollama server URL under Settings → AI.",
      cancelled: false,
    }
  }
  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("api key")) {
    return {
      message: raw,
      hint: provider.requiresApiKey
        ? "Your API key is missing or invalid. Update it under Settings → AI."
        : "Authentication failed — check provider credentials.",
      cancelled: false,
    }
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) {
    return {
      message: raw,
      hint: "Provider is rate-limiting. Wait a moment and retry, or switch providers.",
      cancelled: false,
    }
  }
  if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("econnrefused")) {
    return {
      message: raw,
      hint: "Can't reach the AI server. Check your network and the server URL.",
      cancelled: false,
    }
  }
  if (lower.includes("missing") && lower.includes("project")) {
    return { message: raw, hint: "Pick a valid assessment from the list.", cancelled: false }
  }
  if (lower.includes("missing") && lower.includes("subject")) {
    return { message: raw, hint: "Tag at least one subject to give the model context.", cancelled: false }
  }
  if (lower.includes("did not return") || lower.includes("missing events array") || lower.includes("missing sessions array")) {
    return {
      message: raw,
      hint: "The model returned an unexpected shape. Try again with a smaller, clearer prompt.",
      cancelled: false,
    }
  }
  return { message: raw, hint: null, cancelled: false }
}

// --- Cost estimation -----------------------------------------------------

/**
 * Return an approximate USD cost string for a request, derived from the
 * pricing block (`$/1M tokens`) on the selected model, scaled by `maxTokens`.
 * Returns `null` when pricing isn't published (e.g. Ollama local models).
 *
 * ponytail: this is a ceiling estimate — the model may use far fewer tokens
 * than `maxTokens`. Showing "$≤ 0.002" is honest; showing "$0.002" would
 * over-promise. If we ever wire real token usage from the provider, swap
 * this for the actual figure.
 */
export function estimateRequestCost(
  model: ModelInfo | undefined,
  maxTokens: number,
): { display: string; approximate: boolean } | null {
  if (!model?.pricing) return null
  const out = Number.parseFloat(model.pricing.completion)
  if (!Number.isFinite(out) || out <= 0) return null
  // Pricing returns $/1M tokens.
  const dollars = (out * maxTokens) / 1_000_000
  return {
    display: dollars < 0.001 ? "<$0.001" : `~$${dollars.toFixed(3)}`,
    approximate: true,
  }
}

// --- Conversation primitives --------------------------------------------

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string }

/**
 * Single chokepoint for talking to the active provider. Centralising means
 * new features (AI Assistant Panel, reflections, briefings) automatically
 * inherit reasoning + abort + provider-not-configured handling without
 * re-implementing the wrapper.
 *
 * Throws `AiCancelledError` when `signal` was aborted. Throws
 * `AiConfigurationError` when the provider is missing required fields so the
 * UI can render the "go to Settings" hint without parsing error strings.
 */
export async function aiChatCompletion(opts: {
  messages: ChatTurn[]
  model?: string
  jsonSchema?: JsonSchemaSpec
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}): Promise<string> {
  const provider = getActiveProvider()
  if (!provider.isConfigured()) {
    throw new AiConfigurationError(
      `${provider.displayName} is not configured. Set it up in Settings.`,
    )
  }
  const request: ChatCompletionRequest = {
    model: opts.model ?? getEffectiveModel(),
    messages: opts.messages as ChatMessage[],
    ...(opts.jsonSchema ? { jsonSchema: opts.jsonSchema } : {}),
    ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
    ...(typeof opts.maxTokens === "number" ? { maxTokens: opts.maxTokens } : {}),
    ...(provider.supportsReasoning ? getReasoningConfig().reasoning ?? {} : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  }
  const result = await provider.chatCompletion(request)
  return result.content
}

/**
 * Same as `aiChatCompletion` but parses the response through
 * `normalizeStructuredJson` and rethrows a tidy "did not return" error when
 * the JSON shape doesn't match the schema. Returns the parsed JSON value.
 */
export async function aiStructuredCompletion<T = unknown>(opts: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}): Promise<T> {
  const content = await aiChatCompletion({
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    jsonSchema: { name: opts.schemaName, strict: true, schema: opts.schema },
    ...(typeof opts.temperature === "number" ? { temperature: opts.temperature } : {}),
    ...(typeof opts.maxTokens === "number" ? { maxTokens: opts.maxTokens } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
  try {
    const parsed = JSON.parse(content) as T
    return parsed
  } catch {
    throw new Error("The AI response was not valid JSON. Try again with a clearer prompt.")
  }
}

/** Optional helper that wraps an async fn with an AbortController. */
export function withAbortController<T>(fn: (signal: AbortSignal) => Promise<T>): {
  promise: Promise<T>
  abort: () => void
} {
  const controller = new AbortController()
  return {
    promise: fn(controller.signal),
    abort: () => controller.abort(),
  }
}

// --- VCE-flavored system prompts ----------------------------------------

/**
 * Tiny shared preamble installed at the start of every system message.
 * Reminder: this is a study app, the user is a VCE student, keep replies
 * concise. Existing features already mention VCE explicitly; this is the
 * shared baseline for new ones so we don't drift.
 */
export const VCE_SYSTEM_PREAMBLE =
  "You are a concise AI assistant inside Focal, a VCE (Victorian Certificate of Education) study planner. " +
  "Keep replies brief, specific, and actionable. Do not invent specific page numbers, marks, or rubric items. " +
  "When you do not know something, say so plainly rather than guessing."

/**
 * Shared trailing guard for structured-output prompts. Append to the end of
 * any system message that asks the model to fill a JSON schema. ponytail:
 * the schema-buttressed parsers already recover, but emitting conforming
 * JSON on the first try skips an Ollama 7-13B retry that costs latency.
 */
export const VCE_JSON_FORMAT_GUARD =
  "Respond with strict JSON matching the provided schema only. " +
  "Unknown strings use \"\"; empty arrays use []; never null. " +
  "No markdown fences, no prose outside the JSON, no extra keys."

/** Get the active provider with a typed narrowed return for callers. */
export function activeProvider(): Provider {
  return getActiveProvider()
}

// --- Auto-derived user context -----------------------------------------

/**
 * Build a concise, well-bounded snapshot of the user's actual situation so
 * every prompt starts with a few lines of grounded truth instead of nothing.
 *
 * ponytail: this is intentionally compact — top-3 overdue, top-5 upcoming,
 * top-3 under-prepared subjects, top-3 recent low-confidence sessions. The
 * bounds keep output under ~250 tokens for power users. Richer detail (full
 * subject list, full session list) still flows through the caller-supplied
 * user message; this only injects the signal the model otherwise has to
 * invent. Returns "" when there's nothing to surface so callers can drop the
 * section entirely for new users.
 */
export interface UserBriefingInput {
  projects: Project[]
  sessions: StudySession[]
  subjects: Subject[]
  /** Today as YYYY-MM-DD. Defaults to the user's local date. */
  today?: string
}

const BRIEFING_RECENT_HORIZON_MS = 30 * 24 * 60 * 60 * 1000
const BRIEFING_PLANNING_HORIZON_MS = 60 * 24 * 60 * 60 * 1000
const BRIEFING_TARGET_MINUTES_PER_ASSESSMENT = 90

export function buildUserBriefing({
  projects,
  sessions,
  subjects,
  today = getLocalDateValue(new Date()),
}: UserBriefingInput): string {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]))
  const shortCode = (id?: string) => subjectById.get(id ?? "")?.shortCode ?? id ?? "—"

  // Active = neither archived nor finished. Deadline math uses the YYYY-MM-DD
  // portion so a deadline later today isn't mis-flagged as overdue.
  const active = projects.filter((project) => !project.isArchived && !project.isFinished)
  const overdueProjects = active
    .filter((project) => {
      const deadlineDate = project.deadline?.slice(0, 10)
      return deadlineDate !== undefined && deadlineDate < today
    })
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
    .slice(0, 3)
  const upcomingProjects = active
    .filter((project) => {
      const deadlineDate = project.deadline?.slice(0, 10)
      return deadlineDate !== undefined && deadlineDate >= today
    })
    .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
    .slice(0, 5)

  // Per-subject planning minutes from planned + recent completed sessions.
  const now = Date.now()
  const plannedBySubject = new Map<string, number>()
  const assessmentCountBySubject = new Map<string, number>()
  const sessionSubjectIds = (session: StudySession): string[] => {
    if (session.subjectIds.length > 0) return session.subjectIds
    const project = session.projectId ? active.find((p) => p.id === session.projectId) : undefined
    return project?.subjectId ? [project.subjectId] : []
  }
  for (const session of sessions) {
    if (session.status !== "planned" && session.status !== "completed") continue
    const startMs = new Date(session.startTime).getTime()
    const endMs = new Date(session.endTime).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
    if (session.status === "completed" && startMs < now - BRIEFING_PLANNING_HORIZON_MS) continue
    const minutes = Math.round((endMs - startMs) / 60000)
    const ids = sessionSubjectIds(session)
    if (ids.length === 0) continue
    const perMin = minutes / ids.length
    for (const id of ids) plannedBySubject.set(id, (plannedBySubject.get(id) ?? 0) + perMin)
  }
  for (const project of active) {
    if (!project.subjectId || !project.deadline) continue
    const deadlineDate = project.deadline.slice(0, 10)
    if (deadlineDate < today) continue
    assessmentCountBySubject.set(
      project.subjectId,
      (assessmentCountBySubject.get(project.subjectId) ?? 0) + 1,
    )
  }
  const underprepared = Array.from(assessmentCountBySubject.entries())
    .map(([subjectId, assessmentCount]) => {
      const planned = Math.round(plannedBySubject.get(subjectId) ?? 0)
      const target = assessmentCount * BRIEFING_TARGET_MINUTES_PER_ASSESSMENT
      const gap = Math.max(0, target - planned)
      return { subjectId, assessmentCount, planned, gap }
    })
    .filter((row) => row.gap > 0)
    .sort((a, b) => b.gap - a.gap || b.assessmentCount - a.assessmentCount)
    .slice(0, 3)

  // Recent low-confidence completed sessions — the model uses these to
  // weight topic recommendations toward weak areas.
  const lowConfidence = sessions
    .filter(
      (session) =>
        session.status === "completed"
        && session.confidence !== undefined
        && session.confidence <= 2
        && new Date(session.startTime).getTime() >= now - BRIEFING_RECENT_HORIZON_MS,
    )
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 3)

  const lines: string[] = []
  if (overdueProjects.length > 0) {
    lines.push(
      `- Overdue (${overdueProjects.length}): ${overdueProjects
        .map((project) => `${shortCode(project.subjectId)} ${project.deadlineType ?? "task"} "${project.name}" (due ${project.deadline})`)
        .join("; ")}`,
    )
  }
  if (upcomingProjects.length > 0) {
    lines.push(
      `- Upcoming next 14d (${upcomingProjects.length}): ${upcomingProjects
        .map((project) => {
          const days = Math.max(
            0,
            Math.round(
              (new Date(`${(project.deadline ?? today).slice(0, 10)}T00:00:00`).getTime()
                - new Date(`${today}T00:00:00`).getTime())
              / (24 * 60 * 60 * 1000),
            ),
          )
          return `${shortCode(project.subjectId)} "${project.name}" ${days}d`
        })
        .join("; ")}`,
    )
  }
  if (underprepared.length > 0) {
    lines.push(
      `- Under-prepared: ${underprepared
        .map((row) => `${shortCode(row.subjectId)} ${row.assessmentCount} upcoming / ${row.planned}m planned / ${row.gap}m gap`)
        .join("; ")}`,
    )
  }
  if (lowConfidence.length > 0) {
    lines.push(
      `- Recent low-confidence sessions (≤2/5): ${lowConfidence
        .map((session) => {
          const codes = session.subjectIds.map((id) => shortCode(id)).join("/") || shortCode(undefined)
          const blockers = session.blockers ? `, blockers: ${session.blockers}` : ""
          return `"${session.title}" ${codes} ${session.confidence}/5${blockers}`
        })
        .join("; ")}`,
    )
  }
  if (lines.length === 0) return ""
  return `User state snapshot (auto-derived; treat as background only, never as ground truth for inventable specifics):\n${lines.join("\n")}`
}
