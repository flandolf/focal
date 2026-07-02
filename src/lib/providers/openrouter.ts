/**
 * OpenRouter provider.
 *
 * Uses the OpenAI-compatible `https://openrouter.ai/api/v1/chat/completions`
 * endpoint with strict `response_format: { type: "json_schema", ... }` so the
 * schema in `ChatCompletionRequest.jsonSchema` is enforced server-side. This is
 * the only provider in the registry that can guarantee schema-validated output,
 * which is why `autoRename.ts` and `TextEventPlanner.tsx` rely on it.
 *
 * Reasoning tokens are configurable via the `reasoning` block, which
 * OpenRouter translates per host; only Anthropic-style `max_tokens` is set
 * when a reasoning effort + cap are both requested.
 */
import { getApiKey, getModel } from "@/lib/settings"
import type {
  ChatCompletionRequest,
  ChatCompletionResult,
  ModelInfo,
  Provider,
  ProviderHealthcheck,
} from "@/lib/providers/types"
import {
  extractFinishReason,
  logLlmExchange,
  toOpenAIChatMessage,
} from "@/lib/providers/shared"

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
const OPENROUTER_MODELS_URL = `${OPENROUTER_BASE_URL}/models`
const OPENROUTER_CHAT_URL = `${OPENROUTER_BASE_URL}/chat/completions`

interface OpenRouterModelResponse {
  id: string
  name?: string
  context_length?: number
  supported_parameters?: string[]
  architecture?: { input_modalities?: string[] }
  pricing?: { prompt: string; completion: string }
}

interface OpenRouterModelsEnvelope {
  data?: OpenRouterModelResponse[]
}

interface OpenRouterChatChoice {
  message?: { content?: unknown }
  finish_reason?: string
}

interface OpenRouterChatResponse {
  choices?: OpenRouterChatChoice[]
}

function supportsStructuredOutput(model: OpenRouterModelResponse): boolean {
  return (model.supported_parameters ?? []).includes("structured_outputs")
}

function isModel(value: unknown): value is OpenRouterModelResponse {
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string"
}

function isModelsEnvelope(value: unknown): value is OpenRouterModelsEnvelope {
  return typeof value === "object" && value !== null
}

async function fetchOpenRouterModels(apiKey: string): Promise<ModelInfo[]> {
  const res = await fetch(OPENROUTER_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenRouter models request failed (${res.status})`)
  const parsed: unknown = await res.json()
  if (!isModelsEnvelope(parsed)) throw new Error("OpenRouter models response was not an object")
  return (parsed.data ?? [])
    .filter(isModel)
    .filter(supportsStructuredOutput)
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      contextLength: model.context_length,
      supportsStructuredOutput: true,
      pricing: model.pricing,
    }))
}

export const openrouterProvider: Provider = {
  id: "openrouter",
  displayName: "OpenRouter",
  summary: "Hosted models from OpenAI, Anthropic, Google, Meta, and more (paid, requires API key).",
  requiresApiKey: true,
  configFields: [
    {
      key: "apiKey",
      label: "API Key",
      kind: "secret",
      required: true,
      placeholder: "sk-or-...",
      helpUrl: "https://openrouter.ai/keys",
    },
    { key: "model", label: "Model", kind: "text", required: true },
  ],
  supportsReasoning: true,

  isConfigured(): boolean {
    return Boolean(getApiKey()) && Boolean(getModel())
  },

  async listModels(): Promise<ModelInfo[]> {
    const apiKey = getApiKey()
    if (!apiKey) throw new Error("OpenRouter API key not configured")
    return fetchOpenRouterModels(apiKey)
  },

  async healthcheck(): Promise<ProviderHealthcheck> {
    const apiKey = getApiKey()
    if (!apiKey) return { ok: false, error: "API key not configured" }
    try {
      const res = await fetch(OPENROUTER_MODELS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return { ok: false, error: `OpenRouter responded ${res.status}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const apiKey = getApiKey()
    if (!apiKey) throw new Error("OpenRouter API key not configured")
    if (!req.model) throw new Error("OpenRouter model not configured")

    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages.map(toOpenAIChatMessage),
      provider: { require_parameters: true },
      ...(typeof req.temperature === "number" ? { temperature: req.temperature } : {}),
      ...(typeof req.maxTokens === "number" ? { max_tokens: req.maxTokens } : {}),
    }
    if (req.jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: req.jsonSchema.name,
          strict: req.jsonSchema.strict ?? true,
          schema: req.jsonSchema.schema,
        },
      }
    }
    if (req.reasoning?.effort && req.reasoning.effort !== "none") {
      body.reasoning = {
        effort: req.reasoning.effort,
        ...(typeof req.reasoning.maxTokens === "number" ? { max_tokens: req.reasoning.maxTokens } : {}),
        ...(req.reasoning.exclude ? { exclude: true } : {}),
      }
    }
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      ...(req.signal ? { signal: req.signal } : {}),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`OpenRouter API error (${res.status}): ${text}`)
    }
    const data: unknown = await res.json()
    const choice = (data as OpenRouterChatResponse)?.choices?.[0]
    if (!choice) throw new Error("OpenRouter response missing choices[0]")
    const message = choice.message
    if (typeof message !== "object" || message === null) {
      throw new Error("No structured content in OpenRouter response")
    }
    const content = typeof message.content === "string" ? message.content : ""
    const finishReason = extractFinishReason(choice) ?? choice.finish_reason
    logLlmExchange({
      provider: "openrouter",
      model: req.model,
      requestAttempt: 1,
      rawResponse: data,
      resolvedContent: content,
      toolCallCount: 0,
      ...(finishReason ? { finishReason } : {}),
    })
    return {
      content,
      ...(finishReason ? { finishReason } : {}),
    } satisfies ChatCompletionResult
  },
}
