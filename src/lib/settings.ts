const KEYS = {
  apiKey: "focal-openrouter-key",
  model: "focal-openrouter-model",
  autoRenameUseFileContent: "focal-auto-rename-use-file-content",
  aiPlannerUseFileContent: "focal-ai-planner-use-file-content",
  reasoningEffort: "focal-reasoning-effort",
  reasoningMaxTokens: "focal-reasoning-max-tokens",
  reasoningExclude: "focal-reasoning-exclude",
  notionToken: "focal-notion-token",
  notionDataSourceId: "focal-notion-data-source-id",
  notionTitleProperty: "focal-notion-title-property",
  notionDateProperty: "focal-notion-date-property",
  notionTypeProperty: "focal-notion-type-property",
  notionCompletedProperty: "focal-notion-completed-property",
  notionSubjectProperty: "focal-notion-subject-property",
} as const

const DEFAULT_MODEL = "openai/gpt-4o-mini"
export type ReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none"

export interface NotionCalendarSettings {
  token: string
  dataSourceId: string
  titleProperty: string
  dateProperty: string
  typeProperty: string
  completedProperty: string
  subjectProperty: string
}

export const DEFAULT_NOTION_CALENDAR_SETTINGS: NotionCalendarSettings = {
  token: "",
  dataSourceId: "",
  titleProperty: "Name",
  dateProperty: "Date",
  typeProperty: "Type",
  completedProperty: "Complete",
  subjectProperty: "Subject",
}
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

export function getNotionCalendarSettings(): NotionCalendarSettings {
  return {
    token: localStorage.getItem(KEYS.notionToken) ?? DEFAULT_NOTION_CALENDAR_SETTINGS.token,
    dataSourceId: localStorage.getItem(KEYS.notionDataSourceId) ?? DEFAULT_NOTION_CALENDAR_SETTINGS.dataSourceId,
    titleProperty: localStorage.getItem(KEYS.notionTitleProperty) ?? DEFAULT_NOTION_CALENDAR_SETTINGS.titleProperty,
    dateProperty: localStorage.getItem(KEYS.notionDateProperty) ?? DEFAULT_NOTION_CALENDAR_SETTINGS.dateProperty,
    typeProperty: localStorage.getItem(KEYS.notionTypeProperty) ?? DEFAULT_NOTION_CALENDAR_SETTINGS.typeProperty,
    completedProperty: localStorage.getItem(KEYS.notionCompletedProperty) ?? DEFAULT_NOTION_CALENDAR_SETTINGS.completedProperty,
    subjectProperty: localStorage.getItem(KEYS.notionSubjectProperty) ?? DEFAULT_NOTION_CALENDAR_SETTINGS.subjectProperty,
  }
}

export function setNotionCalendarSettings(settings: NotionCalendarSettings) {
  localStorage.setItem(KEYS.notionToken, settings.token.trim())
  localStorage.setItem(KEYS.notionDataSourceId, settings.dataSourceId.trim())
  localStorage.setItem(KEYS.notionTitleProperty, settings.titleProperty.trim() || DEFAULT_NOTION_CALENDAR_SETTINGS.titleProperty)
  localStorage.setItem(KEYS.notionDateProperty, settings.dateProperty.trim() || DEFAULT_NOTION_CALENDAR_SETTINGS.dateProperty)
  localStorage.setItem(KEYS.notionTypeProperty, settings.typeProperty.trim())
  localStorage.setItem(KEYS.notionCompletedProperty, settings.completedProperty.trim())
  localStorage.setItem(KEYS.notionSubjectProperty, settings.subjectProperty.trim())
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

// --- Timetable ---

export interface TimetableConfig {
  enabled: boolean
  day1Starts: string
  holidays: { name: string; startDate: string; endDate: string }[]
  entries: {
    dayLabel: number
    periods: { period: string; subject: string; location?: string; startTime: string; endTime: string }[]
  }[]
}

export const DEFAULT_TIMETABLE_CONFIG: TimetableConfig = {
  enabled: false,
  day1Starts: "",
  holidays: [],
  entries: [],
}

export function getTimetableConfig(): TimetableConfig {
  try {
    const raw = localStorage.getItem("focal-timetable-config")
    if (!raw) return DEFAULT_TIMETABLE_CONFIG
    const parsed = JSON.parse(raw) as Partial<Record<keyof TimetableConfig, unknown>>
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
      day1Starts: typeof parsed.day1Starts === "string" ? parsed.day1Starts : "",
      holidays: Array.isArray(parsed.holidays) ? (parsed.holidays as TimetableConfig["holidays"]) : [],
      entries: Array.isArray(parsed.entries) ? (parsed.entries as TimetableConfig["entries"]) : [],
    }
  } catch {
    return DEFAULT_TIMETABLE_CONFIG
  }
}

export function setTimetableConfig(config: TimetableConfig): void {
  localStorage.setItem("focal-timetable-config", JSON.stringify(config))
}
