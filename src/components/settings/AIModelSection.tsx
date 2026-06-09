import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, ExternalLink, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { getApiKey, setApiKey, getModel, setModel, getReasoningEffort, setReasoningEffort, getReasoningMaxTokens, setReasoningMaxTokens, getReasoningExclude, setReasoningExclude } from "@/lib/settings"
import type { ReasoningEffort } from "@/lib/settings"
import { SETTINGS_SECTION_CLASS, SETTINGS_CHECKBOX_CLASS, SETTINGS_LINK_CLASS, getSettingsOptionClassName } from "./constants"

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

export function AIModelSection() {
  const [key, setKeyState] = useState(() => getApiKey())
  const [model, setModelState] = useState(() => getModel())
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
  const [, setPerfCacheTick] = useState(0)
  const perfQueueRef = useRef<string[]>([])
  const perfInflightRef = useRef(0)

  useEffect(() => {
    if (!key) {
      queueMicrotask(() => {
        setCredits(null)
        setCreditsLoading(false)
      })
      return
    }
    queueMicrotask(() => {
      setCreditsLoading(true)
      setCreditsError(null)
    })
    let cancelled = false
    fetchCreditsWithBackend(key)
      .then((c) => { if (!cancelled) { setCredits(c); setCreditsError(null) } })
      .catch((e) => { if (!cancelled) { setCredits(null); setCreditsError(getErrorDetails(e).message) } })
      .finally(() => { if (!cancelled) setCreditsLoading(false) })
    return () => { cancelled = true }
  }, [key])

  useEffect(() => {
    queueMicrotask(() => {
      setModelsLoading(true)
      setModelsError(null)
    })
    let cancelled = false
    fetchModels()
      .then((data) => { if (!cancelled) { setModels(data); setModelsLoading(false) } })
      .catch((e) => { if (!cancelled) { setModelsError(e instanceof Error ? e.message : String(e)); setModelsLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const filteredModels = useMemo(() => {
    const q = modelSearch.toLowerCase()
    if (!q) return models
    return models.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
  }, [models, modelSearch])

  // perfCacheRef is a mutable Map whose mutations trigger re-renders via setPerfCacheTick
  const perfCacheValue = perfCacheRef.current

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
        if (perfQueueRef.current.length > 0) void run()
      }
    }
    void run()
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

  // eslint-disable-next-line react-hooks/refs
  const modelRows = useMemo(() => filteredModels.map((m) => (
    <ModelRow
      key={m.id}
      model={m}
      isSelected={model === m.id}
      onSelect={() => handleModelChange(m.id)}
      apiKey={key ?? ""}
      perfCache={perfCacheValue}
      enqueuePerfFetch={enqueuePerfFetch}
    />
  )), [filteredModels, model, key, perfCacheValue, enqueuePerfFetch, handleModelChange])

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

  return (
    <>
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
                  modelRows
                )}
              </div>
            </ScrollArea>
          </>
        )}
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
    </>
  )
}
