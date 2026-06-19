/**
 * Provider abstraction for AI features (assessment copilot, file auto-rename, ...).
 *
 * A `Provider` is one concrete way to talk to an LLM — e.g. OpenRouter, Ollama, or a
 * future LM Studio / vLLM / OpenAI-direct backend. Each implementation owns its
 * own HTTP details (URL headers, request shape translation, structured-output
 * strategy) so callers only deal in `ChatMessage`/`ReasoningConfig`/JSON schema
 * terms.
 *
 * Adding a new provider means creating a sibling file under `src/lib/providers/`,
 * exporting a `Provider` constant, and registering it in `index.ts`. See
 * `PROVIDERS.md` for the step-by-step.
 */
import type { ReasoningEffort } from "@/lib/settings"

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ReasoningConfig {
  /** Effort level from the user setting. Providers may translate or ignore. */
  effort?: ReasoningEffort | null
  /** Token budget for reasoning (used by Anthropic via OpenRouter). */
  maxTokens?: number | null
  /** If true, providers that support it will hide reasoning from the visible output. */
  exclude?: boolean | null
}

export interface JsonSchemaSpec {
  name: string
  schema: Record<string, unknown>
  strict?: boolean
}

export interface ChatCompletionRequest {
  model: string
  messages: ChatMessage[]
  /** Optional structured-output schema. Providers translate to their host's mechanism. */
  jsonSchema?: JsonSchemaSpec
  temperature?: number
  maxTokens?: number
  reasoning?: ReasoningConfig
}

export interface ChatCompletionResult {
  /** The model's text output. Callers apply their own validation. */
  content: string
  /**
   * Provider-reported finish reason (e.g. "stop", "length").
   * Useful when callers want to diagnose truncation or host-side stops.
   */
  finishReason?: string
}

export interface ModelInfo {
  /** Canonical id used in chat completion requests. */
  id: string
  /** Human-friendly display name. Providers always populate this. */
  name: string
  contextLength?: number
  /** Whether the host will enforce a structured-output schema on the response. */
  supportsStructuredOutput?: boolean
  /** Per-token pricing in USD; populated when the host publishes it. */
  pricing?: { prompt: string; completion: string }
}

/** A single user-editable config field rendered in the AI settings section. */
export interface ProviderConfigField {
  /** Stable storage key: one of `'apiKey' | 'baseUrl' | 'model'`. */
  key: "apiKey" | "baseUrl" | "model"
  label: string
  kind: "secret" | "text"
  required: boolean
  placeholder?: string
  helpUrl?: string
}

export interface ProviderHealthcheck {
  ok: boolean
  error?: string
}

export interface Provider {
  /** Stable identifier stored in `provider` setting. Must be unique. */
  id: string
  displayName: string
  /** Short blurb shown under the provider name in the settings UI. */
  summary: string
  requiresApiKey: boolean
  /** List of fields the settings UI should render, in render order. */
  configFields: ProviderConfigField[]
  /** Whether the host supports the per-request `reasoning` block from `ChatCompletionRequest`. */
  supportsReasoning: boolean

  /** True when every `required` config field is populated. */
  isConfigured(): boolean
  /** Discover available models from the host. Throws on transport errors. */
  listModels(): Promise<ModelInfo[]>
  /** Lightweight reachability check used by the "Test connection" button. */
  healthcheck(): Promise<ProviderHealthcheck>
  /** Issue one chat completion; returns the model's text content. */
  chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult>
}
