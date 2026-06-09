import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { ArrowLeft, Loader2, ExternalLink, Search, FolderInput, Database, Palette, EyeOff, RefreshCw, Palette as PaletteIcon, Key, Cloud, Brain, Cog, FolderDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { getApiKey, setApiKey, getModel, setModel, getAutoRenameUseFileContent, setAutoRenameUseFileContent, getReasoningEffort, setReasoningEffort, getReasoningMaxTokens, setReasoningMaxTokens, getReasoningExclude, setReasoningExclude, getNotionCalendarSettings, setNotionCalendarSettings } from "@/lib/settings"
import type { ThemeId } from "@/lib/themes"
import type { NotionCalendarSettings, ReasoningEffort } from "@/lib/settings"
import type { Subject } from "@/lib/types"

type NotionPropertyField = "titleProperty" | "dateProperty" | "typeProperty" | "completedProperty" | "subjectProperty"

type SettingsSection = "appearance" | "subjects" | "api" | "notion" | "ai" | "auto-rename" | "reasoning" | "data"

interface OpenRouterModel {
  id: string
  name: string
  context_length: number
  pricing: { prompt: string; completion: string }
  created: number
  architecture?: { input_modalities?: string[] }
  supported_parameters?: string[]
}

interface OpenRouterCredits {
  total_credits: number
  total_usage: number
}

interface OpenRouterErrorPayload {
  code: string
  message: string
}

interface OpenRouterCreditsWrapper {
  data?: OpenRouterCredits
  error?: OpenRouterErrorPayload
}

interface EndpointPercentiles {
  p50: number
  p75: number
  p90: number
  p99: number
}

interface ModelEndpoint {
  latency_last_30m: EndpointPercentiles | null
  throughput_last_30m: EndpointPercentiles | null
}

interface EndpointsResponse {
  data: {
    endpoints: ModelEndpoint[]
  }
}

interface PerfData {
  latency: number | null
  throughput: number | null
}

interface SettingsViewProps {
  onBack: () => void
  theme: ThemeId
  mode: "light" | "dark" | "system"
  resolvedDark: boolean
  setTheme: (theme: ThemeId) => void
  setMode: (mode: "light" | "dark" | "system") => void
  subjects: Subject[]
  hiddenSubjectIds: string[]
  onToggleSubjectVisibility: (subjectId: string) => void
  onShowAllSubjects: () => void
  onOpenExport?: () => void
  onOpenSubjects?: () => void
  onSyncNotionCalendar?: (onProgress: (msg: string) => void) => Promise<{ created: unknown[]; updated: unknown[]; createdSessions?: unknown[]; updatedSessions?: unknown[]; skipped: number; skippedReasons?: string[]; pushedCreated?: number; pushedUpdated?: number; deleted?: number; pushErrors?: string[] } | null>
  lastSyncTime?: number
}

const SETTINGS_SECTION_CLASS = "rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur"
const SETTINGS_OPTION_BASE_CLASS = "rounded-lg border bg-background/30 text-sm transition-colors outline-none hover:border-muted-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
const SETTINGS_SELECTED_OPTION_CLASS = "border-primary bg-primary/10 text-primary"
const SETTINGS_CHECKBOX_CLASS = "h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const SETTINGS_LINK_CLASS = "inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"

function getSettingsOptionClassName(selected: boolean, className?: string) {
  return cn(
    SETTINGS_OPTION_BASE_CLASS,
    selected ? SETTINGS_SELECTED_OPTION_CLASS : "border-border",
    className,
  )
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 10) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function supportsStructuredOutput(model: OpenRouterModel): boolean {
  const params = model.supported_parameters ?? []
  return params.includes("structured_outputs")
}

function supportsFileUploads(model: OpenRouterModel): boolean {
  const modalities = model.architecture?.input_modalities ?? []
  return modalities.includes("file")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isCredits(value: unknown): value is OpenRouterCredits {
  return (
    isRecord(value) &&
    typeof value.total_credits === "number" &&
    typeof value.total_usage === "number"
  )
}

function isErrorPayload(value: unknown): value is OpenRouterErrorPayload {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  )
}

function isCreditsWrapper(value: unknown): value is OpenRouterCreditsWrapper {
  return (
    isRecord(value) &&
    (value.data === undefined || isCredits(value.data)) &&
    (value.error === undefined || isErrorPayload(value.error))
  )
}

interface OpenRouterFetchError extends Error {
  code?: string
}

function createOpenRouterError(message: string, code?: string): OpenRouterFetchError {
  const error: OpenRouterFetchError = new Error(message)
  error.code = code
  return error
}

function getErrorDetails(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined
    return { code, message: error.message }
  }
  return { message: String(error) }
}

async function fetchModels(): Promise<OpenRouterModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models")
  if (!res.ok) throw new Error("Failed to fetch models")
  const data: unknown = await res.json()
  const models = (data as { data?: OpenRouterModel[] }).data ?? []
  return models
    .filter((m) => supportsStructuredOutput(m) && supportsFileUploads(m))
    .sort((a, b) => b.created - a.created)
}

async function fetchCredits(apiKey: string): Promise<OpenRouterCredits> {
  const res = await fetch("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error("A Management key is required to view credits")
    throw new Error("Failed to fetch credits")
  }
  const data: unknown = await res.json()
  const credits = (data as { data?: OpenRouterCredits }).data
  if (!credits) throw new Error("Invalid response")
  return credits
}

async function fetchCreditsWithBackend(apiKey: string): Promise<OpenRouterCredits> {
  try {
    const res = await invoke<unknown>("get_credits", { api_key: apiKey })
    if (isCredits(res)) {
      return res
    }
    if (isCreditsWrapper(res)) {
      if (res.data) return res.data
      if (res.error) {
        throw createOpenRouterError(res.error.message, res.error.code)
      }
    }
  } catch {
    // ignore and fallback to direct fetch in non-Tauri environments
  }
  return fetchCredits(apiKey)
}

async function fetchModelEndpoints(
  modelId: string,
  apiKey: string,
): Promise<PerfData> {
  const res = await fetch(
    `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  )
  if (!res.ok) return { latency: null, throughput: null }
  const data: unknown = await res.json()
  const endpoints = (data as EndpointsResponse).data?.endpoints ?? []
  let bestLatency = Infinity
  let bestThroughput = 0
  for (const ep of endpoints) {
    const lat = ep.latency_last_30m?.p50
    const tp = ep.throughput_last_30m?.p50
    if (lat != null && lat < bestLatency) bestLatency = lat
    if (tp != null && tp > bestThroughput) bestThroughput = tp
  }
  return {
    latency: bestLatency === Infinity ? null : bestLatency,
    throughput: bestThroughput === 0 ? null : bestThroughput,
  }
}

function ModelRow({
  model,
  isSelected,
  onSelect,
  apiKey,
  perfCache,
  enqueuePerfFetch,
}: {
  model: OpenRouterModel
  isSelected: boolean
  onSelect: () => void
  apiKey: string
  perfCache: Map<string, PerfData>
  enqueuePerfFetch: (id: string) => void
}) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const perf = perfCache.get(model.id) ?? null

  useEffect(() => {
    if (perf || !apiKey) return
    const el = rowRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect()
          enqueuePerfFetch(model.id)
        }
      },
      { rootMargin: "200px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [model.id, apiKey, perf, enqueuePerfFetch])

  return (
    <button
      type="button"
      ref={rowRef}
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
        isSelected
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-accent"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{model.name}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {perf?.latency != null && (
            <span className="text-micro text-muted-foreground tabular-nums">
              {perf.latency < 1000
                ? `${perf.latency.toFixed(0)}ms`
                : `${(perf.latency / 1000).toFixed(1)}s`}
            </span>
          )}
          {perf?.throughput != null && (
            <span className="text-micro text-muted-foreground tabular-nums">
              {perf.throughput >= 100
                ? `${perf.throughput.toFixed(0)}t/s`
                : `${perf.throughput.toFixed(1)}t/s`}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

const SECTION_ITEMS: { id: SettingsSection; label: string; icon: typeof PaletteIcon }[] = [
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "subjects", label: "Subjects", icon: EyeOff },
  { id: "api", label: "API Key", icon: Key },
  { id: "notion", label: "Notion Sync", icon: Cloud },
  { id: "ai", label: "AI Model", icon: Brain },
  { id: "auto-rename", label: "Auto Rename", icon: Cog },
  { id: "reasoning", label: "Reasoning", icon: Brain },
  { id: "data", label: "Data", icon: FolderDown },
]

export function SettingsView({
  onBack,
  theme,
  mode,
  setTheme,
  setMode,
  subjects,
  hiddenSubjectIds,
  onToggleSubjectVisibility,
  onShowAllSubjects,
  onOpenExport,
  onOpenSubjects,
  onSyncNotionCalendar,
  lastSyncTime,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance")
  const [key, setKeyState] = useState(() => getApiKey())
  const [model, setModelState] = useState(() => getModel())
  const [autoRenameUseFileContent, setAutoRenameUseFileContentState] = useState(() => getAutoRenameUseFileContent())
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(() => getReasoningEffort())
  const [reasoningMaxTokens, setReasoningMaxTokensState] = useState(() => getReasoningMaxTokens())
  const [reasoningExclude, setReasoningExcludeState] = useState(() => getReasoningExclude())

  const [saved, setSaved] = useState(false)
  const [credits, setCredits] = useState<OpenRouterCredits | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [creditsError, setCreditsError] = useState<string | null>(null)

  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [modelSearch, setModelSearch] = useState("")
  const perfCacheRef = useRef(new Map<string, PerfData>())
  const [perfCacheTick, setPerfCacheTick] = useState(0)
  const perfQueueRef = useRef<string[]>([])
  const perfInflightRef = useRef(0)

  const [notionSettings, setNotionSettings] = useState<NotionCalendarSettings>(() => getNotionCalendarSettings())
  const [notionSaved, setNotionSaved] = useState(false)
  const [notionSyncing, setNotionSyncing] = useState(false)
  const [notionSyncResult, setNotionSyncResult] = useState<string | null>(null)
  const [notionSyncPhase, setNotionSyncPhase] = useState<string | null>(null)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ name: string; error?: string } | null>(null)

  const hiddenSubjectCount = hiddenSubjectIds.length

  useEffect(() => {
    if (!key) { setCredits(null); return }
    setCreditsLoading(true)
    setCreditsError(null)
    fetchCreditsWithBackend(key)
      .then((c) => { setCredits(c); setCreditsError(null) })
      .catch((e) => { setCredits(null); setCreditsError(getErrorDetails(e).message) })
      .finally(() => setCreditsLoading(false))
  }, [key])

  useEffect(() => {
    setModelsLoading(true)
    setModelsError(null)
    fetchModels()
      .then(setModels)
      .catch((e) => setModelsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setModelsLoading(false))
  }, [])

  const filteredModels = useMemo(() => {
    const q = modelSearch.toLowerCase()
    if (!q) return models
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
  }, [models, modelSearch])

  const enqueuePerfFetch = useCallback((id: string) => {
    if (perfCacheRef.current.has(id)) return
    perfQueueRef.current.push(id)
    const run = async () => {
      if (!key || perfInflightRef.current >= 4) return
      const next = perfQueueRef.current.shift()
      if (!next) return
      perfInflightRef.current++
      try {
        const data = await fetchModelEndpoints(next, key)
        perfCacheRef.current.set(next, data)
        setPerfCacheTick((t) => t + 1)
      } finally {
        perfInflightRef.current--
        if (perfQueueRef.current.length > 0) run()
      }
    }
    run()
  }, [key])

  const handleKeyChange = useCallback((value: string) => {
    setKeyState(value)
    setApiKey(value)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const handleModelChange = useCallback((value: string) => {
    setModelState(value)
    setModel(value)
  }, [])

  const handleAutoRenameUseFileContentChange = useCallback((checked: boolean) => {
    setAutoRenameUseFileContentState(checked)
    setAutoRenameUseFileContent(checked)
  }, [])

  const handleReasoningEffortChange = useCallback((value: ReasoningEffort) => {
    setReasoningEffortState(value)
    setReasoningEffort(value)
  }, [])

  const handleReasoningMaxTokensChange = useCallback((value: number) => {
    setReasoningMaxTokensState(value)
    setReasoningMaxTokens(value)
  }, [])

  const handleReasoningExcludeChange = useCallback((checked: boolean) => {
    setReasoningExcludeState(checked)
    setReasoningExclude(checked)
  }, [])

  const handleNotionSettingChange = useCallback((field: keyof NotionCalendarSettings, value: string) => {
    setNotionSettings((current) => {
      const next = { ...current, [field]: value }
      setNotionCalendarSettings(next)
      return next
    })
    setNotionSaved(true)
    setNotionSyncResult(null)
    setTimeout(() => setNotionSaved(false), 2000)
  }, [])

  const handleSyncNotionCalendar = useCallback(() => {
    if (!onSyncNotionCalendar) return
    setNotionSyncing(true)
    setNotionSyncResult(null)
    setNotionSyncPhase("Connecting to Notion...")
    onSyncNotionCalendar((msg) => setNotionSyncPhase(msg))
      .then((result) => {
        if (!result) { setNotionSyncResult("Sync skipped"); return }
        const parts: string[] = []
        if (result.created.length > 0) parts.push(`${result.created.length} created`)
        if (result.updated.length > 0) parts.push(`${result.updated.length} updated`)
        if (result.createdSessions?.length) parts.push(`${result.createdSessions.length} sessions created`)
        if (result.updatedSessions?.length) parts.push(`${result.updatedSessions.length} sessions updated`)
        if (result.pushedCreated && result.pushedCreated > 0) parts.push(`${result.pushedCreated} pushed`)
        if (result.pushedUpdated && result.pushedUpdated > 0) parts.push(`${result.pushedUpdated} pushed updates`)
        if (result.deleted && result.deleted > 0) parts.push(`${result.deleted} deleted`)
        const errors = result.pushErrors?.length ? ` (${result.pushErrors.length} push errors)` : ""
        const reasons = result.skippedReasons?.length ? ` (${result.skippedReasons[0]})` : ""
        const summary = parts.length > 0 ? parts.join(", ") : "Already up to date"
        setNotionSyncResult(`${summary}${result.skipped > 0 ? `, ${result.skipped} skipped${reasons}` : ""}${errors}`)
      })
      .catch((e) => setNotionSyncResult(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        setNotionSyncing(false)
        setNotionSyncPhase(null)
      })
  }, [onSyncNotionCalendar])

  const handleImportFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    setImporting(true)
    setImportResult(null)
    try {
      const name = await invoke<string>("import_folder_to_projects", { folderPath: selected })
      setImportResult({ name })
    } catch (e) {
      setImportResult({ name: selected.split("/").pop() ?? "Folder", error: String(e) })
    } finally {
      setImporting(false)
    }
  }, [])

  const notionPropertyInputs: {
    field: NotionPropertyField
    label: string
    value: string
  }[] = useMemo(() => [
    { field: "titleProperty", label: "Title property", value: notionSettings.titleProperty },
    { field: "dateProperty", label: "Date property", value: notionSettings.dateProperty },
    { field: "typeProperty", label: "Type property", value: notionSettings.typeProperty },
    { field: "completedProperty", label: "Complete property", value: String(notionSettings.completedProperty) },
    { field: "subjectProperty", label: "Subject property", value: notionSettings.subjectProperty },
  ], [notionSettings])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3 min-[1200px]:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-heading text-lg font-semibold">Settings</h1>
          <p className="text-caption text-muted-foreground">Local preferences and AI renaming.</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 border-r border-border/70 py-3 min-[1200px]:w-52">
          <div className="space-y-0.5 px-2">
            {SECTION_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring/35",
                    activeSection === item.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </nav>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto max-w-2xl px-6 py-6">
            {activeSection === "appearance" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <h2 className="text-sm font-medium">Theme</h2>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {([
                    { id: "focal" as ThemeId, name: "Focal", lightBg: "bg-slate-100", accent: "bg-blue-500" },
                    { id: "codex" as ThemeId, name: "Codex", lightBg: "bg-violet-50", accent: "bg-violet-500" },
                    { id: "claude" as ThemeId, name: "Claude", lightBg: "bg-amber-50", accent: "bg-orange-400" },
                    { id: "github" as ThemeId, name: "GitHub", lightBg: "bg-gray-100", accent: "bg-blue-600" },
                    { id: "linear" as ThemeId, name: "Linear", lightBg: "bg-purple-50", accent: "bg-indigo-500" },
                    { id: "notion" as ThemeId, name: "Notion", lightBg: "bg-stone-100", accent: "bg-stone-700" },
                  ]).map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      aria-pressed={theme === t.id}
                      className={getSettingsOptionClassName(theme === t.id, "flex flex-col items-center gap-1.5 p-3 text-foreground")}
                    >
                      <div className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-background/60">
                        <div className={cn("h-3 w-3 rounded-sm", t.lightBg)} />
                        <div className={cn("h-3 w-3 rounded-sm", t.accent)} />
                      </div>
                      <span className="text-caption font-medium">{t.name}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("light")}
                    aria-pressed={mode === "light"}
                    className={getSettingsOptionClassName(mode === "light", "flex-1 px-3 py-2")}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("dark")}
                    aria-pressed={mode === "dark"}
                    className={getSettingsOptionClassName(mode === "dark", "flex-1 px-3 py-2")}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("system")}
                    aria-pressed={mode === "system"}
                    className={getSettingsOptionClassName(mode === "system", "flex-1 px-3 py-2")}
                  >
                    System
                  </button>
                </div>
              </section>
            )}

            {activeSection === "subjects" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium">Visible Subjects</h2>
                    <p className="mt-1 text-caption text-muted-foreground/70">
                      Hide subjects you are not taking from assessment, event, and study-session pickers.
                    </p>
                  </div>
                  {hiddenSubjectCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onShowAllSubjects}
                      className="h-7 shrink-0 px-2 text-xs"
                    >
                      Show all
                    </Button>
                  )}
                </div>
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {subjects.map((subject) => {
                    const hidden = hiddenSubjectIds.includes(subject.id)
                    return (
                      <label
                        key={subject.id}
                        className={cn(
                          "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                          hidden
                            ? "border-border/60 bg-background/20 text-muted-foreground"
                            : "border-border/70 bg-background/35 text-foreground"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={() => onToggleSubjectVisibility(subject.id)}
                          className={SETTINGS_CHECKBOX_CLASS}
                        />
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: subject.color }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {subject.icon} {subject.name}
                        </span>
                        {hidden && <EyeOff className="h-3.5 w-3.5 shrink-0" />}
                      </label>
                    )
                  })}
                </div>
              </section>
            )}

            {activeSection === "api" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <label className="text-sm font-medium" htmlFor="openrouter-api-key">OpenRouter API Key</label>
                <Input
                  id="openrouter-api-key"
                  type="password"
                  value={key ?? ""}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder="sk-or-..."
                  className="mt-2 font-mono text-xs"
                />
                <div className="mt-1.5 flex items-start justify-between gap-2">
                  <p className="min-w-0 text-caption text-muted-foreground/60">
                    Stored locally. Used for AI file renaming.
                    {saved && (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">Saved</span>
                    )}
                  </p>
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={SETTINGS_LINK_CLASS}
                  >
                    Get a key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                {key && (
                  <div className="mt-3 rounded-xl border border-border/70 bg-background/30 p-3">
                    {creditsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading credits...
                      </div>
                    ) : creditsError ? (
                      <div>
                        <p className="text-xs text-destructive">{creditsError}</p>
                        {creditsError.includes("Management key") && (
                          <a
                            href="https://openrouter.ai/settings/keys"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(SETTINGS_LINK_CLASS, "mt-1")}
                          >
                            Create a Management key
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ) : credits ? (
                      <div className="flex items-center justify-between">
                        <span className="text-caption text-muted-foreground/70">Remaining</span>
                        <span className="text-sm font-medium tabular-nums">
                          ${(credits.total_credits - credits.total_usage).toFixed(2)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            )}

            {activeSection === "notion" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium">Notion Calendar Sync</h2>
                    <p className="mt-1 text-caption text-muted-foreground/70">
                      Pull pages from a Notion database into Focal calendar items and study sessions.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSyncNotionCalendar}
                    disabled={notionSyncing || !notionSettings.token.trim() || !notionSettings.dataSourceId.trim()}
                    className="shrink-0 gap-1.5"
                  >
                    {notionSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Sync
                  </Button>
                </div>
                <div className="mt-3 grid gap-2">
                  <label className="text-caption text-muted-foreground/70" htmlFor="notion-token">Integration token</label>
                  <Input
                    id="notion-token"
                    type="password"
                    value={notionSettings.token}
                    onChange={(event) => handleNotionSettingChange("token", event.target.value)}
                    placeholder="secret_..."
                    className="font-mono text-xs"
                  />
                  <label className="text-caption text-muted-foreground/70" htmlFor="notion-data-source-id">Data source or database id</label>
                  <Input
                    id="notion-data-source-id"
                    value={notionSettings.dataSourceId}
                    onChange={(event) => handleNotionSettingChange("dataSourceId", event.target.value)}
                    placeholder="Notion calendar id"
                    className="font-mono text-xs"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {notionPropertyInputs.map(({ field, label, value }) => (
                      <label key={field} className="min-w-0">
                        <span className="text-caption text-muted-foreground/70">{label}</span>
                        <Input
                          value={value}
                          onChange={(event) => handleNotionSettingChange(field, event.target.value)}
                          className="mt-1 text-xs"
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {notionSyncing && notionSyncPhase ? (
                      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/30 px-3 py-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                        <p className="text-caption text-muted-foreground truncate">{notionSyncPhase}</p>
                      </div>
                    ) : notionSyncResult ? (
                      <p className={cn(
                        "text-caption rounded-lg border px-3 py-2",
                        notionSyncResult.includes("error") || notionSyncResult.includes("failed")
                          ? "border-destructive/30 bg-destructive/5 text-destructive"
                          : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
                      )}>
                        {notionSyncResult}
                      </p>
                    ) : lastSyncTime && lastSyncTime > 0 ? (
                      <p className="text-caption text-muted-foreground/60">
                        Last synced {formatTimeAgo(lastSyncTime)}
                      </p>
                    ) : (
                      <p className="text-caption text-muted-foreground/50">Never synced</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {notionSaved && <span className="text-caption text-emerald-600 dark:text-emerald-400">Saved</span>}
                    <a
                      href="https://developers.notion.com/docs/getting-started"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={SETTINGS_LINK_CLASS}
                    >
                      Setup
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </section>
            )}

            {activeSection === "ai" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <h2 className="text-sm font-medium">AI Model</h2>
                <p className="mt-1 text-caption text-muted-foreground/70">
                  Showing only models that support structured output and file uploads. Latency and throughput shown when API key is set.
                </p>
                {modelsLoading ? (
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading models...
                  </div>
                ) : modelsError ? (
                  <div className="mt-2">
                    <p className="text-xs text-destructive">{modelsError}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setModelsError(null)
                        setModelsLoading(true)
                        fetchModels()
                          .then(setModels)
                          .catch((e) => setModelsError(e instanceof Error ? e.message : String(e)))
                          .finally(() => setModelsLoading(false))
                      }}
                      className="mt-1 h-7 text-xs"
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative mt-2">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
                      <Input
                        placeholder="Search models..."
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <ScrollArea className="mt-2 h-56 rounded-lg border border-border/70">
                      <div className="p-1">
                        {filteredModels.length === 0 ? (
                          <p className="py-8 text-center text-xs text-muted-foreground">
                            No models match your search.
                          </p>
                        ) : (
                          filteredModels.map((m) => (
                            <ModelRow
                              key={m.id}
                              model={m}
                              isSelected={model === m.id}
                              onSelect={() => handleModelChange(m.id)}
                              apiKey={key ?? ""}
                              perfCache={perfCacheRef.current}
                              enqueuePerfFetch={enqueuePerfFetch}
                            />
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </section>
            )}

            {activeSection === "auto-rename" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <h2 className="text-sm font-medium">Auto Rename Context</h2>
                <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-background/30 p-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:border-muted-foreground/30">
                  <input
                    type="checkbox"
                    checked={autoRenameUseFileContent}
                    onChange={(e) => handleAutoRenameUseFileContentChange(e.target.checked)}
                    className={cn(SETTINGS_CHECKBOX_CLASS, "mt-0.5")}
                  />
                  <div className="min-w-0">
                    <p className="text-sm">Read file content for rename suggestions</p>
                    <p className="mt-0.5 text-caption text-muted-foreground/70">
                      Uses a short text preview to generate more accurate filenames.
                    </p>
                  </div>
                </label>
              </section>
            )}

            {activeSection === "reasoning" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <h2 className="text-sm font-medium">Reasoning Tokens</h2>
                <p className="mt-1 text-caption text-muted-foreground/70">
                  Enable step-by-step reasoning for supported models (OpenAI o-series, Anthropic Claude, Gemini, DeepSeek R1).
                </p>

                <p className="mt-3 block text-caption text-muted-foreground/70">Effort Level</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(["xhigh", "high", "medium", "low", "minimal", "none"] as const).map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => handleReasoningEffortChange(level)}
                      aria-pressed={reasoningEffort === level}
                      className={getSettingsOptionClassName(reasoningEffort === level, "px-2.5 py-1 text-xs")}
                    >
                      {level === "xhigh" ? "Max" : level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>

                {reasoningEffort !== "none" && (
                  <>
                    <label className="mt-3 block text-caption text-muted-foreground/70" htmlFor="reasoning-max-tokens">Max Tokens (Anthropic models)</label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <input
                        id="reasoning-max-tokens"
                        type="range"
                        min={1024}
                        max={32000}
                        step={1024}
                        value={reasoningMaxTokens}
                        onChange={(e) => handleReasoningMaxTokensChange(Number(e.target.value))}
                        className="flex-1 accent-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{reasoningMaxTokens >= 1000 ? `${(reasoningMaxTokens / 1000).toFixed(1)}k` : reasoningMaxTokens}</span>
                    </div>

                    <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-background/30 p-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:border-muted-foreground/30">
                      <input
                        type="checkbox"
                        checked={reasoningExclude}
                        onChange={(e) => handleReasoningExcludeChange(e.target.checked)}
                        className={cn(SETTINGS_CHECKBOX_CLASS, "mt-0.5")}
                      />
                      <div className="min-w-0">
                        <p className="text-sm">Exclude reasoning from response</p>
                        <p className="mt-0.5 text-caption text-muted-foreground/70">
                          Model still uses reasoning internally but will not include it in output.
                        </p>
                      </div>
                    </label>
                  </>
                )}
              </section>
            )}

            {activeSection === "data" && (
              <section className={SETTINGS_SECTION_CLASS}>
                <h2 className="text-sm font-medium">Import Folder</h2>
                <p className="mt-1 text-caption text-muted-foreground/70">
                  Copy an existing folder from your filesystem into the projects directory.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImportFolder}
                  disabled={importing}
                  className="mt-2 gap-1.5"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FolderInput className="h-4 w-4" />
                  )}
                  {importing ? "Importing..." : "Choose Folder"}
                </Button>
                {importResult && (
                  <p className={cn(
                    "mt-2 text-caption",
                    importResult.error ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {importResult.error
                      ? `Import failed: ${importResult.error}`
                      : `Imported "${importResult.name}" successfully`}
                  </p>
                )}

                {(onOpenExport != null || onOpenSubjects != null) && (
                  <div className="mt-5 border-t border-border/70 pt-5">
                    <h2 className="text-sm font-medium">Data Management</h2>
                    <p className="mt-1 text-caption text-muted-foreground/70">
                      Manage your project data and custom subjects.
                    </p>
                    <div className="mt-3 flex gap-2">
                      {onOpenExport && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onOpenExport}
                          className="gap-1.5"
                        >
                          <Database className="h-4 w-4" />
                          Export
                        </Button>
                      )}
                      {onOpenSubjects && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onOpenSubjects}
                          className="gap-1.5"
                        >
                          <Palette className="h-4 w-4" />
                          Subjects
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
