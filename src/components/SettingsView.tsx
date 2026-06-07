import { useState, useEffect, useRef, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { ArrowLeft, Loader2, ExternalLink, Search, FolderInput, Database, Palette, EyeOff, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { getApiKey, setApiKey, getModel, setModel, getAutoRenameUseFileContent, setAutoRenameUseFileContent, getReasoningEffort, setReasoningEffort, getReasoningMaxTokens, setReasoningMaxTokens, getReasoningExclude, setReasoningExclude, getNotionCalendarSettings, setNotionCalendarSettings } from "@/lib/settings"
import type { ThemeId } from "@/lib/themes"
import type { NotionCalendarSettings, ReasoningEffort } from "@/lib/settings"
import type { Subject } from "@/lib/types"

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
  // New theme API: mode can be light | dark | system
  mode: "light" | "dark" | "system"
  // Resolved dark value according to mode and OS preference
  resolvedDark: boolean
  setTheme: (theme: ThemeId) => void
  setMode: (mode: "light" | "dark" | "system") => void
  subjects: Subject[]
  hiddenSubjectIds: string[]
  onToggleSubjectVisibility: (subjectId: string) => void
  onShowAllSubjects: () => void
  onOpenExport?: () => void
  onOpenSubjects?: () => void
  onSyncNotionCalendar?: () => Promise<{ created: unknown[]; updated: unknown[]; skipped: number; skippedReasons?: string[]; pushedCreated?: number; pushedUpdated?: number }>
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

// Attempt to call a backend Tauri command if available; fall back to direct fetch
async function fetchCreditsWithBackend(apiKey: string): Promise<OpenRouterCredits> {
  try {
    // Prefer calling the Tauri backend command if available. The backend returns a wrapper
    // { data?: { total_credits, total_usage }, error?: { code, message } }. We handle both
    // the wrapper shape and the raw success shape for compatibility.
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
          <span className="text-micro text-muted-foreground tabular-nums">
            {model.context_length >= 1000
              ? `${(model.context_length / 1000).toFixed(0)}k`
              : model.context_length}
          </span>
        </div>
      </div>
      <p className="text-caption text-muted-foreground/60 mt-0.5 truncate">
        {model.id}
      </p>
    </button>
  )
}

export function SettingsView({
  onBack,
  theme,
  mode,
  resolvedDark: _resolvedDark,
  setTheme,
  setMode,
  subjects,
  hiddenSubjectIds,
  onToggleSubjectVisibility,
  onShowAllSubjects,
  onOpenExport,
  onOpenSubjects,
  onSyncNotionCalendar,
}: SettingsViewProps) {
  const [key, setKey] = useState(() => getApiKey() ?? "")
  const [model, setModelState] = useState(() => getModel())
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [modelSearch, setModelSearch] = useState("")
  const [autoRenameUseFileContent, setAutoRenameUseFileContentState] = useState(() => getAutoRenameUseFileContent())
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(() => getReasoningEffort())
  const [reasoningMaxTokens, setReasoningMaxTokensState] = useState(() => getReasoningMaxTokens())
  const [reasoningExclude, setReasoningExcludeState] = useState(() => getReasoningExclude())
  const [notionSettings, setNotionSettings] = useState<NotionCalendarSettings>(() => getNotionCalendarSettings())
  const [notionSaved, setNotionSaved] = useState(false)
  const [notionSyncing, setNotionSyncing] = useState(false)
  const [notionSyncResult, setNotionSyncResult] = useState<string | null>(null)
  const didFetchRef = useRef(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ name: string; error?: string } | null>(null)
  const [credits, setCredits] = useState<OpenRouterCredits | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [creditsError, setCreditsError] = useState<string | null>(null)
  const hiddenSubjectCount = subjects.filter((subject) => hiddenSubjectIds.includes(subject.id)).length
  // Centralised perf cache (Map modelId -> PerfData) stored in state so updates re-render ModelRow children
  const [perfCache, setPerfCache] = useState<Map<string, PerfData>>(() => new Map())

  // Queue + concurrency limiter for endpoint fetches
  const pendingRef = useRef<string[]>([])
  const activeCountRef = useRef(0)
  const keyRef = useRef(key)
  const startQueueRef = useRef<() => void>(() => undefined)
  const MAX_CONCURRENT_FETCHES = 4

  useEffect(() => {
    keyRef.current = key
  }, [key])

  const startQueue = useCallback(() => {
    startQueueRef.current()
  }, [])

  useEffect(() => {
    startQueueRef.current = () => {
      // Start as many queued requests as allowed
      while (activeCountRef.current < MAX_CONCURRENT_FETCHES && pendingRef.current.length > 0) {
        const id = pendingRef.current.shift()
        const apiKey = keyRef.current
        if (!id || !apiKey) continue
        activeCountRef.current += 1
        void (async (modelId: string) => {
          try {
            const data = await fetchModelEndpoints(modelId, apiKey)
            setPerfCache((prev) => {
              const next = new Map(prev)
              next.set(modelId, data)
              return next
            })
          } catch {
            // On error, store null values so we don't keep retrying endlessly
            setPerfCache((prev) => {
              const next = new Map(prev)
              next.set(modelId, { latency: null, throughput: null })
              return next
            })
          } finally {
            activeCountRef.current -= 1
            // schedule next batch
            setTimeout(startQueue, 0)
          }
        })(id)
      }
    }
  }, [startQueue])

  const enqueuePerfFetch = useCallback((modelId: string) => {
    if (!key) return
    if (perfCache.has(modelId)) return
    if (pendingRef.current.includes(modelId)) return
    pendingRef.current.push(modelId)
    startQueue()
  }, [key, perfCache, startQueue])

  // Prefetch top N models when models list or API key becomes available
  useEffect(() => {
    const PREFETCH_COUNT = 3
    if (!key || models.length === 0) return
    const top = models.slice(0, PREFETCH_COUNT)
    for (const m of top) enqueuePerfFetch(m.id)
  }, [models, key, enqueuePerfFetch])

  useEffect(() => {
    if (didFetchRef.current) return
    didFetchRef.current = true
    setModelsLoading(true)
    fetchModels()
      .then(setModels)
      .catch((e) => setModelsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setModelsLoading(false))
  }, [])

  const fetchCreditsFor = useCallback((apiKey: string) => {
    setCreditsLoading(true)
    setCreditsError(null)
    fetchCreditsWithBackend(apiKey)
      .then(setCredits)
      .catch((e) => {
        // Provide friendly messages based on structured error codes from the backend
        const { code, message } = getErrorDetails(e)
        if (code === "OPENROUTER_UNAUTHORIZED") {
          setCreditsError("A Management key is required to view credits")
        } else if (code === "VALIDATION_ERROR") {
          setCreditsError(message || "Invalid API key")
        } else if (code === "NETWORK_ERROR") {
          setCreditsError("Network error while fetching credits")
        } else if (code === "OPENROUTER_ERROR") {
          setCreditsError(message || "OpenRouter returned an error")
        } else {
          setCreditsError(message)
        }
      })
      .finally(() => setCreditsLoading(false))
  }, [])

  const didFetchCreditsRef = useRef(false)
  useEffect(() => {
    if (!key) return
    if (didFetchCreditsRef.current) return
    didFetchCreditsRef.current = true
    fetchCreditsFor(key)
  }, [key, fetchCreditsFor])

  const handleKeyChange = useCallback((value: string) => {
    setKey(value)
    setApiKey(value)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    if (!value) {
      setCredits(null)
      setCreditsError(null)
      setCreditsLoading(false)
      didFetchCreditsRef.current = false
    } else {
      didFetchCreditsRef.current = true
      fetchCreditsFor(value)
    }
  }, [fetchCreditsFor])

  const handleModelChange = useCallback((value: string) => {
    setModelState(value)
    setModel(value)
  }, [])

  const handleAutoRenameUseFileContentChange = useCallback((value: boolean) => {
    setAutoRenameUseFileContentState(value)
    setAutoRenameUseFileContent(value)
  }, [])

  const handleReasoningEffortChange = useCallback((value: ReasoningEffort) => {
    setReasoningEffortState(value)
    setReasoningEffort(value)
  }, [])

  const handleReasoningMaxTokensChange = useCallback((value: number) => {
    setReasoningMaxTokensState(value)
    setReasoningMaxTokens(value)
  }, [])

  const handleReasoningExcludeChange = useCallback((value: boolean) => {
    setReasoningExcludeState(value)
    setReasoningExclude(value)
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
    onSyncNotionCalendar()
      .then((result) => {
        const pulled = result.created.length + result.updated.length
        const pushed = (result.pushedCreated ?? 0) + (result.pushedUpdated ?? 0)
        const reasons = result.skippedReasons?.length ? `: ${result.skippedReasons.join("; ")}` : ""
        setNotionSyncResult(`${pulled} pulled, ${pushed} pushed${result.skipped > 0 ? `, ${result.skipped} skipped${reasons}` : ""}`)
      })
      .catch((e) => setNotionSyncResult(e instanceof Error ? e.message : String(e)))
      .finally(() => setNotionSyncing(false))
  }, [onSyncNotionCalendar])

  const handleImportFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    })

    if (!selected) return

    setImporting(true)
    setImportResult(null)
    try {
      const folderName = await invoke<string>("import_folder_to_project", {
        sourcePath: selected,
      })
      setImportResult({ name: folderName })
    } catch (e) {
      setImportResult({ name: "", error: e instanceof Error ? e.message : String(e) })
    } finally {
      setImporting(false)
    }
  }, [])

  const filteredModels = (modelSearch
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : models
  ).sort((a, b) => {
    if (a.id === model) return -1
    if (b.id === model) return 1
    return 0
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70 px-6 py-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 rounded-xl"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-heading text-lg font-semibold">Settings</h1>
          <p className="text-caption text-muted-foreground">Local preferences and AI renaming.</p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
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

          <section className={SETTINGS_SECTION_CLASS}>
            <label className="text-sm font-medium" htmlFor="openrouter-api-key">OpenRouter API Key</label>
            <Input
              id="openrouter-api-key"
              type="password"
              value={key}
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

          <section className={SETTINGS_SECTION_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-medium">Notion Calendar Sync</h2>
                <p className="mt-1 text-caption text-muted-foreground/70">
                  Pull pages from a Notion calendar data source into the Focal calendar.
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
                {([
                  ["titleProperty", "Title property"],
                  ["dateProperty", "Date property"],
                  ["typeProperty", "Type property"],
                  ["subjectProperty", "Subject property"],
                  ["locationProperty", "Location property"],
                  ["descriptionProperty", "Description property"],
                ] as const).map(([field, label]) => (
                  <label key={field} className="min-w-0">
                    <span className="text-caption text-muted-foreground/70">{label}</span>
                    <Input
                      value={notionSettings[field]}
                      onChange={(event) => handleNotionSettingChange(field, event.target.value)}
                      className="mt-1 text-xs"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-caption text-muted-foreground/60">
                Share the Notion database with your integration before syncing.
                {notionSaved && <span className="ml-1 text-emerald-600 dark:text-emerald-400">Saved</span>}
              </p>
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
            {notionSyncResult && (
              <p className="mt-2 text-caption text-muted-foreground">{notionSyncResult}</p>
            )}
          </section>

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
                          apiKey={key}
                          perfCache={perfCache}
                          enqueuePerfFetch={enqueuePerfFetch}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </section>

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
          </section>

          {(onOpenExport != null || onOpenSubjects != null) && (
            <section className={SETTINGS_SECTION_CLASS}>
              <h2 className="text-sm font-medium">Data</h2>
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
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
