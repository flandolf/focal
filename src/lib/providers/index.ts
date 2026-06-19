/**
 * Provider registry + active-provider helpers.
 *
 * The single source of truth for which AI provider is currently selected.
 * Callers (copilot.ts, autoRename.ts, AIModelSection.tsx, TextEventPlanner.tsx)
 * talk to `getActiveProvider()` instead of hardcoding OpenRouter.
 */
import {
  getModel,
  getOllamaBaseUrl,
  getOllamaModel,
  getProvider,
  setModel,
  setOllamaBaseUrl,
  setOllamaModel,
  setProvider,
} from "@/lib/settings"
import { openrouterProvider } from "@/lib/providers/openrouter"
import { ollamaProvider } from "@/lib/providers/ollama"
import type { Provider } from "@/lib/providers/types"

export const DEFAULT_PROVIDER_ID = "openrouter"

const PROVIDERS: Record<string, Provider> = {
  [openrouterProvider.id]: openrouterProvider,
  [ollamaProvider.id]: ollamaProvider,
}

export { openrouterProvider, ollamaProvider }

const FALLBACK_PROVIDER: Provider = openrouterProvider

/** Stable list of all providers for the settings UI. */
export function listProviders(): Provider[] {
  return Object.values(PROVIDERS)
}

/** Returns the provider by id, falling back to the default if the id is unknown. */
export function getProviderById(id: string): Provider {
  return PROVIDERS[id] ?? FALLBACK_PROVIDER
}

/** The provider currently selected in user settings. */
export function getActiveProvider(): Provider {
  return getProviderById(getProvider())
}

/**
 * Switch the active provider. Resets the model field on the way in, but keeps
 * any prior OpenRouter pick intact so toggling back doesn't wipe it.
 */
export function setActiveProvider(id: string): void {
  const next = getProviderById(id)
  setProvider(next.id)
  if (next.id === ollamaProvider.id) {
    // ponytail: nudge a fresh Ollama install toward the documented base URL.
    if (!getOllamaBaseUrl()) setOllamaBaseUrl("http://localhost:11434/v1")
    setOllamaModel("")
    setModel("")
  }
}

/** Model string the active provider should use. */
export function getEffectiveModel(): string {
  const active = getActiveProvider()
  if (active.id === ollamaProvider.id) return getOllamaModel()
  return getModel()
}

/** Persist a model id for the currently active provider. */
export function setEffectiveModel(value: string): void {
  const active = getActiveProvider()
  const trimmed = value.trim()
  if (active.id === ollamaProvider.id) {
    setOllamaModel(trimmed)
  } else {
    setModel(trimmed)
  }
}

export type {
  Provider,
  ModelInfo,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResult,
  ReasoningConfig,
  JsonSchemaSpec,
} from "@/lib/providers/types"
