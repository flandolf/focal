import { invoke, isTauri } from "@tauri-apps/api/core"
import type { TimetableConfig, TimetableDayLabel, TimetableEntry, TimetableViewSettings } from "@/lib/types"
import { hydratePreferences, persistPreference, removePreference } from "@/lib/storage/preferences"
export type { TimetableConfig } from "@/lib/types"

const KEYS = {
  apiKey: "focal-openrouter-key",
  model: "focal-openrouter-model",
  // ponytail: provider plumbing — see src/lib/providers/* + PROVIDERS.md.
  provider: "focal-ai-provider",
  ollamaBaseUrl: "focal-ollama-base-url",
  ollamaModel: "focal-ollama-model",
  autoRenameUseFileContent: "focal-auto-rename-use-file-content",
  reasoningEffort: "focal-reasoning-effort",
  reasoningMaxTokens: "focal-reasoning-max-tokens",
  reasoningExclude: "focal-reasoning-exclude",
  assistantPersonality: "focal-assistant-personality",
  assistantCustomInstructions: "focal-assistant-custom-instructions",
  notionToken: "focal-notion-token",
  notionDataSourceId: "focal-notion-data-source-id",
  notionTitleProperty: "focal-notion-title-property",
  notionDateProperty: "focal-notion-date-property",
  notionTypeProperty: "focal-notion-type-property",
  notionCompletedProperty: "focal-notion-completed-property",
  notionSubjectProperty: "focal-notion-subject-property",
  projectsRootPath: "focal-projects-root-path",
} as const

const DEFAULT_MODEL = "openai/gpt-4o-mini"
const DEFAULT_PROVIDER_ID = "openrouter"
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
// ponytail: an empty default lets AIModelSection show the picker for Ollama without
// committing to a model the user hasn't installed.
const DEFAULT_OLLAMA_MODEL = ""
const SECRET_KEYS = {
  apiKey: "openrouter_api_key",
  notionToken: "notion_token",
} as const
const NON_SYNCABLE_PREFERENCE_KEYS = new Set<string>([
  KEYS.projectsRootPath,
  KEYS.ollamaBaseUrl,
  "focal-app-scale",
  "focal-project-templates",
  "focal-pomodoro-settings",
])
const SETTINGS_PREFERENCE_KEYS = [
  ...Object.values(KEYS).filter((key) => key !== KEYS.apiKey && key !== KEYS.notionToken),
  "focal-timetable-config",
  "focal-app-scale",
  "focal-custom-subjects",
  "focal-hidden-subjects",
  "focal-quick-links",
  "focal-project-templates",
  "focal-theme",
  "focal-pomodoro-settings",
]
const LEGACY_KEY_BY_SECRET = {
  [SECRET_KEYS.apiKey]: KEYS.apiKey,
  [SECRET_KEYS.notionToken]: KEYS.notionToken,
} as const
let secretCache = { apiKey: "", notionToken: "" }
let secretWriteLock: Promise<unknown> = Promise.resolve()
export type ReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none"
export type AssistantPersonality = "focused" | "encouraging" | "direct" | "socratic"

export const ASSISTANT_PERSONALITIES: readonly {
  id: AssistantPersonality
  label: string
  description: string
  instruction: string
}[] = [
  {
    id: "focused",
    label: "Focused",
    description: "Concise, practical, and calm.",
    instruction: "Be a focused study coach: concise, practical, calm, and biased toward one clear next action.",
  },
  {
    id: "encouraging",
    label: "Encouraging",
    description: "Warm support without empty praise.",
    instruction: "Be a warm, encouraging study coach. Acknowledge effort specifically, avoid empty praise, and keep advice actionable.",
  },
  {
    id: "direct",
    label: "Direct",
    description: "Blunt priorities, minimal padding.",
    instruction: "Be a direct study coach: lead with the priority, cut padding, and say plainly when a plan is unrealistic.",
  },
  {
    id: "socratic",
    label: "Socratic",
    description: "Guide thinking with selective questions.",
    instruction: "Use a Socratic coaching style when it helps learning: ask one targeted question before explaining, but answer directly when the user needs a fact or action.",
  },
] as const

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

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function getString(key: string): string | null
function getString(key: string, fallback: string): string
function getString(key: string, fallback?: string): string | null {
  return localStorage.getItem(key) ?? fallback ?? null
}

function setString(key: string, value: string): void {
  localStorage.setItem(key, value)
  persistPreference(key, value, !NON_SYNCABLE_PREFERENCE_KEYS.has(key))
}

function persistSecret(secretKey: keyof typeof LEGACY_KEY_BY_SECRET, value: string): void {
  const legacyKey = LEGACY_KEY_BY_SECRET[secretKey]
  if (!isTauri()) {
    localStorage.setItem(legacyKey, value)
    return
  }
  const result = secretWriteLock.then(async () => {
    await invoke("set_secret", { key: secretKey, value })
    localStorage.removeItem(legacyKey)
  })
  secretWriteLock = result.catch((error: unknown) => {
    console.error(`Failed to persist ${secretKey}:`, error)
  })
}

async function hydrateSecret(
  secretKey: keyof typeof LEGACY_KEY_BY_SECRET,
): Promise<string> {
  const legacyKey = LEGACY_KEY_BY_SECRET[secretKey]
  const legacyValue = localStorage.getItem(legacyKey) ?? ""
  if (!isTauri()) return legacyValue
  try {
    let value = await invoke<string | null>("get_secret", { key: secretKey }) ?? ""
    if (!value && legacyValue) {
      await invoke("set_secret", { key: secretKey, value: legacyValue })
      value = legacyValue
    }
    localStorage.removeItem(legacyKey)
    return value
  } catch (error) {
    // Keep a pre-migration credential usable for this run if the OS credential
    // service is temporarily unavailable. New credentials are never written back.
    console.error(`Failed to hydrate ${secretKey}:`, error)
    return legacyValue
  }
}

export async function initializeSettingsStorage(): Promise<void> {
  const hydrated = await hydratePreferences(
    SETTINGS_PREFERENCE_KEYS.map((key) => ({
      key,
      legacyValue: localStorage.getItem(key),
      syncable: !NON_SYNCABLE_PREFERENCE_KEYS.has(key),
    })),
  )
  for (const [key, value] of hydrated) localStorage.setItem(key, value)

  const [apiKey, notionToken] = await Promise.all([
    hydrateSecret(SECRET_KEYS.apiKey),
    hydrateSecret(SECRET_KEYS.notionToken),
  ])
  secretCache = { apiKey, notionToken }
}

function getBool(key: string, defaultValue: boolean): boolean {
  const val = localStorage.getItem(key)
  return val === null ? defaultValue : val === "true"
}

function setBool(key: string, value: boolean): void {
  setString(key, String(value))
}

// ---------------------------------------------------------------------------
// API / model settings
// ---------------------------------------------------------------------------

export function getApiKey(): string | null {
  return secretCache.apiKey || null
}

export function setApiKey(key: string): void {
  secretCache.apiKey = key
  persistSecret(SECRET_KEYS.apiKey, key)
}

export function getModel(): string {
  return getString(KEYS.model, DEFAULT_MODEL)
}

export function setModel(model: string): void {
  setString(KEYS.model, model)
}

/** Active AI provider id (e.g. 'openrouter', 'ollama'). Defaults to OpenRouter. */
export function getProvider(): string {
  return getString(KEYS.provider) ?? DEFAULT_PROVIDER_ID
}

export function setProvider(id: string): void {
  setString(KEYS.provider, id)
}

export function getOllamaBaseUrl(): string {
  return getString(KEYS.ollamaBaseUrl) ?? DEFAULT_OLLAMA_BASE_URL
}

export function setOllamaBaseUrl(url: string): void {
  setString(KEYS.ollamaBaseUrl, url)
}

export function getOllamaModel(): string {
  return getString(KEYS.ollamaModel) ?? DEFAULT_OLLAMA_MODEL
}

export function setOllamaModel(model: string): void {
  setString(KEYS.ollamaModel, model)
}

export function getAutoRenameUseFileContent(): boolean {
  return getBool(KEYS.autoRenameUseFileContent, false)
}

export function setAutoRenameUseFileContent(enabled: boolean): void {
  setBool(KEYS.autoRenameUseFileContent, enabled)
}

export function getReasoningEffort(): ReasoningEffort {
  return (getString(KEYS.reasoningEffort) as ReasoningEffort | null) ?? "medium"
}

export function setReasoningEffort(effort: ReasoningEffort): void {
  setString(KEYS.reasoningEffort, effort)
}

export function getReasoningMaxTokens(): number {
  const val = getString(KEYS.reasoningMaxTokens)
  return val ? parseInt(val, 10) : 8000
}

export function setReasoningMaxTokens(tokens: number): void {
  setString(KEYS.reasoningMaxTokens, String(tokens))
}

export function getReasoningExclude(): boolean {
  return getBool(KEYS.reasoningExclude, false)
}

export function setReasoningExclude(exclude: boolean): void {
  setBool(KEYS.reasoningExclude, exclude)
}

export function getAssistantPersonality(): AssistantPersonality {
  const value = getString(KEYS.assistantPersonality)
  return ASSISTANT_PERSONALITIES.some((option) => option.id === value)
    ? value as AssistantPersonality
    : "focused"
}

export function setAssistantPersonality(personality: AssistantPersonality): void {
  setString(KEYS.assistantPersonality, personality)
}

export function getAssistantCustomInstructions(): string {
  return getString(KEYS.assistantCustomInstructions, "").slice(0, 500)
}

export function setAssistantCustomInstructions(instructions: string): void {
  setString(KEYS.assistantCustomInstructions, instructions.slice(0, 500))
}

export function getAssistantPersonalityInstruction(): string {
  const personality = getAssistantPersonality()
  const preset = ASSISTANT_PERSONALITIES.find((option) => option.id === personality)
  const custom = getAssistantCustomInstructions().trim()
  return [
    preset?.instruction ?? ASSISTANT_PERSONALITIES[0].instruction,
    custom ? `User's additional style preference: ${custom}` : "",
    "Style preferences never override factual accuracy, safety, or Focal tool rules.",
  ].filter(Boolean).join("\n")
}

// ---------------------------------------------------------------------------
// Notion calendar
// ---------------------------------------------------------------------------

export function getNotionCalendarSettings(): NotionCalendarSettings {
  return {
    token: secretCache.notionToken,
    dataSourceId: getString(KEYS.notionDataSourceId, ""),
    titleProperty: getString(KEYS.notionTitleProperty, DEFAULT_NOTION_CALENDAR_SETTINGS.titleProperty),
    dateProperty: getString(KEYS.notionDateProperty, DEFAULT_NOTION_CALENDAR_SETTINGS.dateProperty),
    typeProperty: getString(KEYS.notionTypeProperty, DEFAULT_NOTION_CALENDAR_SETTINGS.typeProperty),
    completedProperty: getString(KEYS.notionCompletedProperty, DEFAULT_NOTION_CALENDAR_SETTINGS.completedProperty),
    subjectProperty: getString(KEYS.notionSubjectProperty, DEFAULT_NOTION_CALENDAR_SETTINGS.subjectProperty),
  }
}

export function setNotionCalendarSettings(settings: NotionCalendarSettings): void {
  secretCache.notionToken = settings.token.trim()
  persistSecret(SECRET_KEYS.notionToken, secretCache.notionToken)
  setString(KEYS.notionDataSourceId, settings.dataSourceId.trim())
  setString(KEYS.notionTitleProperty, settings.titleProperty.trim() || DEFAULT_NOTION_CALENDAR_SETTINGS.titleProperty)
  setString(KEYS.notionDateProperty, settings.dateProperty.trim() || DEFAULT_NOTION_CALENDAR_SETTINGS.dateProperty)
  setString(KEYS.notionTypeProperty, settings.typeProperty.trim())
  setString(KEYS.notionCompletedProperty, settings.completedProperty.trim())
  setString(KEYS.notionSubjectProperty, settings.subjectProperty.trim())
}

export function getProjectsRootPath(): string | null {
  return getString(KEYS.projectsRootPath)
}

export function setProjectsRootPath(path: string | null): void {
  if (path) setString(KEYS.projectsRootPath, path)
  else {
    localStorage.removeItem(KEYS.projectsRootPath)
    removePreference(KEYS.projectsRootPath)
  }
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

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

export const DEFAULT_VIEW_SETTINGS: TimetableViewSettings = {
  showAllDays: false,
  showLocations: true,
  showBreaks: true,
  use24Hour: false,
  manualBlock: null,
  hiddenDays: [],
}

export const DEFAULT_CYCLE_LENGTH = 10

export const DEFAULT_WEEKEND_TIMETABLES = false

/** Default Mon–Fri weekday pattern for a 10-day cycle (week 1 + week 2). */
export const DEFAULT_DAY_TO_WEEKDAY_10: number[] = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]

/**
 * Build a default dayToWeekday mapping by cycling Mon–Fri (1,2,3,4,5) up to
 * `cycleLength`. When `weekendTimetables` is true, Sat (6) and Sun (0) are
 * included in the cycle so weekend day-labels are populated. Ponytail: this
 * is the default only — users can override per-day in the settings popover.
 * Upgrade path: per-school custom mappings stored in the cloud table.
 */
export function defaultDayToWeekday(
  cycleLength: number,
  weekendTimetables: boolean = DEFAULT_WEEKEND_TIMETABLES,
): number[] {
  if (!Number.isInteger(cycleLength) || cycleLength < 1) return []
  const pattern = weekendTimetables ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5]
  const out: number[] = []
  for (let i = 0; i < cycleLength; i++) out.push(pattern[i % pattern.length])
  return out
}

export const DEFAULT_TIMETABLE_CONFIG: TimetableConfig = {
  enabled: false,
  day1Starts: "",
  holidays: [],
  entries: [],
  cycleLength: DEFAULT_CYCLE_LENGTH,
  dayToWeekday: [...DEFAULT_DAY_TO_WEEKDAY_10],
  weekendTimetables: DEFAULT_WEEKEND_TIMETABLES,
  viewSettings: { ...DEFAULT_VIEW_SETTINGS },
}

/**
 * Resolve the effective cycle length for a config. Falls back to the default
 * (10) when the stored value is missing or invalid.
 */
export function getCycleLength(config: Pick<TimetableConfig, "cycleLength">): number {
  const n = config.cycleLength
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 60) return DEFAULT_CYCLE_LENGTH
  return n
}

/**
 * Resolve the effective dayToWeekday mapping for a config. If the stored array
 * is the wrong length or contains invalid weekdays, rebuild it from the
 * default pattern at the right length.
 */
export function getDayToWeekday(
  config: Pick<TimetableConfig, "cycleLength" | "dayToWeekday" | "weekendTimetables">,
): number[] {
  const cycleLength = getCycleLength(config)
  const stored = config.dayToWeekday
  if (Array.isArray(stored) && stored.length === cycleLength && stored.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return stored
  }
  return defaultDayToWeekday(cycleLength, config.weekendTimetables ?? DEFAULT_WEEKEND_TIMETABLES)
}

/** Resolve the effective weekendTimetables setting. */
export function getWeekendTimetables(
  config: Pick<TimetableConfig, "weekendTimetables">,
): boolean {
  return config.weekendTimetables === true
}

function isValidDayLabel(value: unknown, cycleLength: number): value is TimetableDayLabel {
  return typeof value === "number" && value >= 1 && value <= cycleLength && Number.isInteger(value)
}

export function getTimetableConfig(): TimetableConfig {
  try {
    const raw = localStorage.getItem("focal-timetable-config")
    if (!raw) return DEFAULT_TIMETABLE_CONFIG
    const parsed = JSON.parse(raw) as Partial<Record<keyof TimetableConfig, unknown>>
    const cycleLength = getCycleLength({ cycleLength: typeof parsed.cycleLength === "number" ? parsed.cycleLength : undefined })
    const weekendTimetables = parsed.weekendTimetables === true
    const dayToWeekday = (() => {
      if (!Array.isArray(parsed.dayToWeekday)) return defaultDayToWeekday(cycleLength, weekendTimetables)
      const stored = parsed.dayToWeekday.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) as number[]
      if (stored.length === cycleLength) return stored
      return defaultDayToWeekday(cycleLength, weekendTimetables)
    })()
    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : []
    const entries: TimetableEntry[] = rawEntries
      .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
      .filter((e) => isValidDayLabel(e.dayLabel, cycleLength))
      .map((e) => ({
        dayLabel: e.dayLabel as TimetableDayLabel,
        periods: Array.isArray(e.periods) ? (e.periods as TimetableEntry["periods"]) : [],
      }))
    const rawViewSettings = parsed.viewSettings as Partial<TimetableViewSettings> | undefined
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : false,
      day1Starts: typeof parsed.day1Starts === "string" ? parsed.day1Starts : "",
      holidays: Array.isArray(parsed.holidays)
        ? parsed.holidays.filter((h): h is TimetableConfig["holidays"][number] => {
            if (typeof h !== "object" || h === null) return false
            const record = h as Record<string, unknown>
            return typeof record.name === "string" && typeof record.startDate === "string" && typeof record.endDate === "string"
          })
        : [],
      entries,
      cycleLength,
      dayToWeekday,
      weekendTimetables,
      currentDayOverride: isValidDayLabel(parsed.currentDayOverride, cycleLength) ? parsed.currentDayOverride : null,
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
  setString("focal-timetable-config", JSON.stringify(config))
}

/** Set or clear the manual current-day override. Pass null to clear. */
export function setTimetableCurrentDayOverride(override: TimetableDayLabel | null): void {
  const config = getTimetableConfig()
  setTimetableConfig({ ...config, currentDayOverride: override })
}
