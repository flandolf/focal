/**
 * Ollama provider.
 *
 * Uses the OpenAI-compatible endpoint at `<baseUrl>/v1/chat/completions`
 * (default `http://localhost:11434/v1`). The OpenAI compat layer accepts
 * `response_format: { type: "json_object" }` but does NOT enforce OpenRouter-style
 * `json_schema` — so we drop strict schema enforcement and rely on the existing
 * parser validators in `copilot.ts` / `autoRename.ts` to reject malformed JSON.
 * Reasoning tokens are silently ignored (Ollama has no equivalent endpoint knob),
 * so we omit the block entirely.
 */
import { getOllamaBaseUrl, getOllamaModel } from "@/lib/settings"
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ModelInfo,
  Provider,
  ProviderHealthcheck,
} from "@/lib/providers/types"

const DEFAULT_BASE_URL = "http://localhost:11434/v1"

interface OllamaModelResponse {
  id: string
  created?: number
  owned_by?: string
}

interface OllamaModelsEnvelope {
  data?: OllamaModelResponse[]
}

interface OllamaChatChoice {
  message?: { content?: unknown }
}

interface OllamaChatResponse {
  choices?: OllamaChatChoice[]
}

function isOllamaModel(value: unknown): value is OllamaModelResponse {
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string"
}

/** Normalise a base URL to always end at the OpenAI-compatible `/v1` mount. */
function resolveBaseUrl(): string {
  const raw = getOllamaBaseUrl()
  const base = (raw ?? "").trim() || DEFAULT_BASE_URL
  // Strip every trailing slash so a path like `http://host/proxy/v1/` doesn't
  // get mistakenly turned into `/v1/v1` by the endsWith check below.
  const trimmed = base.replace(/\/+$/, "")
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`
}

async function fetchOllamaModels(base: string): Promise<ModelInfo[]> {
  const res = await fetch(`${base}/models`)
  if (!res.ok) throw new Error(`Ollama /v1/models failed (${res.status})`)
  const parsed: unknown = await res.json()
  const envelope = (parsed as OllamaModelsEnvelope)?.data
  if (!Array.isArray(envelope)) throw new Error("Unexpected Ollama /v1/models response shape")
  return envelope.filter(isOllamaModel).map((model) => ({
    id: model.id,
    name: model.id,
    supportsStructuredOutput: false,
  }))
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

  isConfigured(): boolean {
    return Boolean(resolveBaseUrl()) && Boolean(getOllamaModel())
  },

  async listModels(): Promise<ModelInfo[]> {
    return fetchOllamaModels(resolveBaseUrl())
  },

  async healthcheck(): Promise<ProviderHealthcheck> {
    const base = resolveBaseUrl()
    try {
      const res = await fetch(`${base}/models`)
      if (!res.ok) return { ok: false, error: `Ollama responded ${res.status}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const base = resolveBaseUrl()
    if (!req.model) throw new Error("Ollama model not configured")

    // ponytail: looser than OpenRouter since Ollama's /v1 compat layer doesn't enforce
    // json_schema. json_object nudges capable models toward JSON; the post-parse validators
    // in copilot.ts and autoRename.ts reject malformed payloads regardless.
    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    }
    if (req.jsonSchema) {
      body.response_format = { type: "json_object" }
    }

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama API error (${res.status}): ${text}`)
    }
    const data = (await res.json()) as OllamaChatResponse
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== "string") {
      throw new Error("No content in Ollama response")
    }
    return { content }
  },
}
