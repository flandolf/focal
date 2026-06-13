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
  syncNotionToken: "focal-sync-notion-token",
  syncOpenrouterKey: "focal-sync-openrouter-key",
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

/** Whether to sync the Notion token to the cloud account. Local-only flag, never synced. */
export function getSyncNotionToken(): boolean {
  return localStorage.getItem(KEYS.syncNotionToken) === "true"
}

export function setSyncNotionToken(enabled: boolean) {
  localStorage.setItem(KEYS.syncNotionToken, String(enabled))
}

/** Whether to sync the OpenRouter API key to the cloud account. Local-only flag, never synced. */
export function getSyncOpenrouterKey(): boolean {
  return localStorage.getItem(KEYS.syncOpenrouterKey) === "true"
}

export function setSyncOpenrouterKey(enabled: boolean) {
  localStorage.setItem(KEYS.syncOpenrouterKey, String(enabled))
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

import type { TimetableConfig, TimetableDayLabel } from "@/lib/types"
export type { TimetableConfig } from "@/lib/types"

import type { TimetableViewSettings } from "@/lib/types"

export const DEFAULT_VIEW_SETTINGS: TimetableViewSettings = {
  showAllDays: false,
  showLocations: true,
  showBreaks: true,
  use24Hour: false,
  manualBlock: null,
  hiddenDays: [],
}

export const DEFAULT_TIMETABLE_CONFIG: TimetableConfig = {
  enabled: false,
  day1Starts: "",
  holidays: [],
  entries: [],
  viewSettings: { ...DEFAULT_VIEW_SETTINGS },
}

function isValidDayLabel(value: unknown): value is TimetableDayLabel {
  return typeof value === "number" && value >= 1 && value <= 10 && Number.isInteger(value)
}

export function getTimetableConfig(): TimetableConfig {
  try {
    const raw = localStorage.getItem("focal-timetable-config")
    if (!raw) return DEFAULT_TIMETABLE_CONFIG
    const parsed = JSON.parse(raw) as Partial<Record<keyof TimetableConfig, unknown>>
    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : []
    const entries = rawEntries
      .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
      .filter((e) => isValidDayLabel(e.dayLabel))
      .map((e) => ({
        dayLabel: e.dayLabel as TimetableDayLabel,
        periods: Array.isArray(e.periods) ? e.periods : [],
      }))
    const rawViewSettings = parsed.viewSettings as Partial<TimetableViewSettings> | undefined
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
      day1Starts: typeof parsed.day1Starts === "string" ? parsed.day1Starts : "",
      holidays: Array.isArray(parsed.holidays) ? (parsed.holidays as TimetableConfig["holidays"]) : [],
      entries,
      currentDayOverride: isValidDayLabel(parsed.currentDayOverride) ? parsed.currentDayOverride : null,
      viewSettings: rawViewSettings
        ? {
            showAllDays: typeof rawViewSettings.showAllDays === "boolean" ? rawViewSettings.showAllDays : DEFAULT_VIEW_SETTINGS.showAllDays,
            showLocations: typeof rawViewSettings.showLocations === "boolean" ? rawViewSettings.showLocations : DEFAULT_VIEW_SETTINGS.showLocations,
            showBreaks: typeof rawViewSettings.showBreaks === "boolean" ? rawViewSettings.showBreaks : DEFAULT_VIEW_SETTINGS.showBreaks,
            use24Hour: typeof rawViewSettings.use24Hour === "boolean" ? rawViewSettings.use24Hour : DEFAULT_VIEW_SETTINGS.use24Hour,
            manualBlock: rawViewSettings.manualBlock === 1 || rawViewSettings.manualBlock === 2 ? rawViewSettings.manualBlock : DEFAULT_VIEW_SETTINGS.manualBlock,
            hiddenDays: Array.isArray(rawViewSettings.hiddenDays) ? rawViewSettings.hiddenDays : DEFAULT_VIEW_SETTINGS.hiddenDays,
          }
        : { ...DEFAULT_VIEW_SETTINGS },
    }
  } catch {
    return DEFAULT_TIMETABLE_CONFIG
  }
}

export function setTimetableConfig(config: TimetableConfig): void {
  localStorage.setItem("focal-timetable-config", JSON.stringify(config))
}

/** Set or clear the manual current-day override. Pass null to clear. */
export function setTimetableCurrentDayOverride(override: TimetableDayLabel | null): void {
  const config = getTimetableConfig()
  setTimetableConfig({ ...config, currentDayOverride: override })
}
