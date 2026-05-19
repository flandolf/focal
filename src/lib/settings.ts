const KEYS = {
  apiKey: "focal-openrouter-key",
  model: "focal-openrouter-model",
  dark: "focal-dark",
  autoRenameUseFileContent: "focal-auto-rename-use-file-content",
} as const

const DEFAULT_MODEL = "openai/gpt-4o-mini"

export function getApiKey(): string | null {
  return localStorage.getItem(KEYS.apiKey)
}

export function setApiKey(key: string) {
  localStorage.setItem(KEYS.apiKey, key)
}

export function getModel(): string {
  return localStorage.getItem(KEYS.model) ?? DEFAULT_MODEL
}

export function setModel(model: string) {
  localStorage.setItem(KEYS.model, model)
}

export function getAutoRenameUseFileContent(): boolean {
  return localStorage.getItem(KEYS.autoRenameUseFileContent) === "true"
}

export function setAutoRenameUseFileContent(enabled: boolean) {
  localStorage.setItem(KEYS.autoRenameUseFileContent, String(enabled))
}

export function getDark(): boolean {
  if (typeof window === "undefined") return false
  const stored = localStorage.getItem(KEYS.dark)
  if (stored !== null) return stored === "true"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function setDark(dark: boolean) {
  localStorage.setItem(KEYS.dark, String(dark))
  document.documentElement.classList.toggle("dark", dark)
}
