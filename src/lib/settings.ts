const KEYS = {
  apiKey: "focal-openrouter-key",
  model: "focal-openrouter-model",
  autoRenameUseFileContent: "focal-auto-rename-use-file-content",
  aiPlannerUseFileContent: "focal-ai-planner-use-file-content",
  reasoningEffort: "focal-reasoning-effort",
  reasoningMaxTokens: "focal-reasoning-max-tokens",
  reasoningExclude: "focal-reasoning-exclude",
} as const

const DEFAULT_MODEL = "openai/gpt-4o-mini"
export type ReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none"

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

export function getAiPlannerUseFileContent(): boolean {
  return localStorage.getItem(KEYS.aiPlannerUseFileContent) !== "false"
}

export function setAiPlannerUseFileContent(enabled: boolean) {
  localStorage.setItem(KEYS.aiPlannerUseFileContent, String(enabled))
}

export function getReasoningEffort(): ReasoningEffort {
  return (localStorage.getItem(KEYS.reasoningEffort) as ReasoningEffort) ?? "medium"
}

export function setReasoningEffort(effort: ReasoningEffort) {
  localStorage.setItem(KEYS.reasoningEffort, effort)
}

export function getReasoningMaxTokens(): number {
  const val = localStorage.getItem(KEYS.reasoningMaxTokens)
  return val ? parseInt(val, 10) : 8000
}

export function setReasoningMaxTokens(tokens: number) {
  localStorage.setItem(KEYS.reasoningMaxTokens, String(tokens))
}

export function getReasoningExclude(): boolean {
  return localStorage.getItem(KEYS.reasoningExclude) === "true"
}

export function setReasoningExclude(exclude: boolean) {
  localStorage.setItem(KEYS.reasoningExclude, String(exclude))
}

export function getReasoningConfig(): { reasoning?: { effort?: ReasoningEffort; max_tokens?: number; exclude?: boolean } } {
  const effort = getReasoningEffort()
  if (effort === "none") return {}
  return {
    reasoning: {
      effort,
      max_tokens: getReasoningMaxTokens(),
      exclude: getReasoningExclude() || undefined,
    },
  }
}
