import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { motion, useReducedMotion, AnimatePresence } from "framer-motion"
import { invoke } from "@tauri-apps/api/core"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, ExternalLink, Search, Sparkles, Check, FileText, Brain, HelpCircle } from "lucide-react"
import { cn, isRecord } from "@/lib/utils"
import { getApiKey, setApiKey, getModel, setModel, getReasoningEffort, setReasoningEffort, getReasoningMaxTokens, setReasoningMaxTokens, getReasoningExclude, setReasoningExclude } from "@/lib/settings"
import { notifyUserSettingsChanged } from "@/lib/sync/engine"
import type { ReasoningEffort } from "@/lib/settings"

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

const REASONING_BLURB: Record<ReasoningEffort, string> = {
  xhigh: "Maximum thinking, slowest. Best for hard problems.",
  high: "Deep reasoning, slower. For multi-step tasks.",
  medium: "Balanced. Most tasks.",
  low: "Light thinking, fast.",
  minimal: "Quick checks, no real planning.",
  none: "No reasoning. Cheapest and fastest.",
}

function supportsStructuredOutput(model: OpenRouterModel): boolean {
  const params = model.supported_parameters ?? []
  return params.includes("structured_outputs")
}

function supportsFileUploads(model: OpenRouterModel): boolean {
  const modalities = model.architecture?.input_modalities ?? []
  return modalities.includes("file")
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

function formatContextLength(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function LatencyBar({ latency }: { latency: number | null }) {
  if (latency == null) {
    return <span className="text-micro text-muted-foreground/35">—</span>
  }
  // Map latency to a 0..1 quality score (lower is better). 200ms = full, 5000ms = empty.
  const score = Math.max(0, Math.min(1, 1 - (latency - 200) / 4800))
  const color = score > 0.7 ? "bg-emerald-500" : score > 0.4 ? "bg-amber-500" : "bg-destructive"
  return (
    <div className="flex items-center gap-1.5" title={`p50 ${latency.toFixed(0)}ms`}>
      <div className="relative h-1 w-8 overflow-hidden rounded-full bg-foreground/8">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full", color)}
          style={{ width: `${score * 100}%` }}
        />
      </div>
      <span className="text-micro tabular-nums text-muted-foreground/80">
        {latency < 1000 ? `${latency.toFixed(0)}ms` : `${(latency / 1000).toFixed(1)}s`}
      </span>
    </div>
  )
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
  const reduceMotion = useReducedMotion()

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
    <motion.button
      type="button"
      ref={rowRef}
      onClick={onSelect}
      aria-pressed={isSelected}
      whileHover={reduceMotion ? undefined : { x: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.65 }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
        isSelected
          ? "bg-primary/10 text-primary font-medium ring-1 ring-primary/30"
          : "hover:bg-accent",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30",
        )}
      >
        {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate leading-tight">{model.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-micro text-muted-foreground/60">
          <span className="inline-flex items-center gap-0.5">
            <Brain className="h-2.5 w-2.5" />
            {formatContextLength(model.context_length)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <FileText className="h-2.5 w-2.5" />
            files
          </span>
        </p>
      </div>
      <LatencyBar latency={perf?.latency ?? null} />
    </motion.button>
  )
}

function CreditsGauge({ credits }: { credits: OpenRouterCredits }) {
  const reduceMotion = useReducedMotion()
  const remaining = Math.max(0, credits.total_credits - credits.total_usage)
  const usedRatio =
    credits.total_credits > 0
      ? Math.min(1, credits.total_usage / credits.total_credits)
      : 0
  const usedPct = Math.round(usedRatio * 100)
  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-micro font-medium uppercase tracking-wider text-muted-foreground/65">
            Credits remaining
          </p>
          <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
            ${remaining.toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-micro text-muted-foreground/60 tabular-nums">
            of ${credits.total_credits.toFixed(2)}
          </p>
          <p
            className={cn(
              "mt-0.5 text-caption font-medium tabular-nums",
              usedRatio > 0.85
                ? "text-destructive"
                : usedRatio > 0.6
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {usedPct}% used
          </p>
        </div>
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/8">
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            usedRatio > 0.85
              ? "bg-destructive"
              : usedRatio > 0.6
                ? "bg-amber-500"
                : "bg-emerald-500",
          )}
          initial={false}
          animate={{ width: `${usedRatio * 100}%` }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  )
}

function SelectedModelCard({ modelId, models }: { modelId: string; models: OpenRouterModel[] }) {
  const reduceMotion = useReducedMotion()
  const model = useMemo(() => models.find((m) => m.id === modelId), [models, modelId])
  if (!model) return null
  const prompt = parseFloat(model.pricing.prompt)
  const completion = parseFloat(model.pricing.completion)
  return (
    <motion.div
      key={modelId}
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.05] p-2.5"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-caption font-medium leading-tight">{model.name}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground/65">
          {formatContextLength(model.context_length)} context · ${prompt.toFixed(3)} in · ${completion.toFixed(3)} out
        </p>
      </div>
    </motion.div>
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
  const [reasoningHelpOpen, setReasoningHelpOpen] = useState(false)
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
    notifyUserSettingsChanged()
  }, [])

  const handleModelChange = useCallback((value: string) => {
    setModelState(value)
    setModel(value)
    notifyUserSettingsChanged()
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
    notifyUserSettingsChanged()
  }, [])

  const handleReasoningMaxTokensChange = useCallback((value: number) => {
    setReasoningMaxTokensState(value)
    setReasoningMaxTokens(value)
    notifyUserSettingsChanged()
  }, [])

  const handleReasoningExcludeChange = useCallback((checked: boolean) => {
    setReasoningExcludeState(checked)
    setReasoningExclude(checked)
    notifyUserSettingsChanged()
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">OpenRouter API Key</h2>
            <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
              Used for AI file renaming and any features that need a language model.
            </p>
          </div>
          {saved && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-caption font-medium text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
        <Input
          id="openrouter-api-key"
          type="password"
          value={key ?? ""}
          onChange={(e) => handleKeyChange(e.target.value)}
          placeholder="sk-or-..."
          className="mt-3 h-9 font-mono text-xs"
          aria-label="OpenRouter API key"
        />
        <p className="mt-2 rounded-lg border border-border/70 bg-background/30 p-2.5 text-caption text-muted-foreground/70">
          API keys stay on this device and are not synced to your account.
        </p>
        <div className="mt-2 flex items-center justify-end">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          >
            Get a key
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <AnimatePresence initial={false}>
          {key && (
            <motion.div
              key="credits"
              initial={false}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3">
                {creditsLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/30 px-3 py-2.5 text-caption text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading credits…
                  </div>
                ) : creditsError ? (
                  <div className="rounded-lg border border-border/60 bg-background/30 px-3 py-2.5">
                    <p className="text-caption text-destructive">{creditsError}</p>
                    {creditsError.includes("Management key") && (
                      <a
                        href="https://openrouter.ai/settings/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Create a Management key
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ) : credits ? (
                  <CreditsGauge credits={credits} />
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">AI Model</h2>
            <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
              Showing only models that support structured output and file uploads. Latency is live when an API key is set.
            </p>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {model && models.some((m) => m.id === model) && (
            <motion.div
              key="selected-wrap"
              initial={false}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3">
                <SelectedModelCard key={model} modelId={model} models={models} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {modelsLoading ? (
          <div className="flex items-center gap-2 mt-2 text-caption text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading models…
          </div>
        ) : modelsError ? (
          <div className="mt-2">
            <p className="text-caption text-destructive">{modelsError}</p>
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
                placeholder="Search models…"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <ScrollArea className="mt-2 h-56 rounded-lg border border-border/70">
              <div className="p-1">
                {filteredModels.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
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

      <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Reasoning Tokens</h2>
            <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
              Enable step-by-step reasoning for supported models (OpenAI o-series, Anthropic Claude, Gemini, DeepSeek R1).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReasoningHelpOpen((v) => !v)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            aria-label="What do these levels mean?"
            aria-expanded={reasoningHelpOpen}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {reasoningHelpOpen && (
            <motion.div
              key="help"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <ul className="mt-3 grid gap-1 rounded-lg border border-border/60 bg-background/30 p-2.5 text-caption">
                {(["xhigh", "high", "medium", "low", "minimal", "none"] as const).map((level) => (
                  <li key={level} className="flex items-baseline gap-2">
                    <span className="w-14 shrink-0 font-medium capitalize text-foreground/80">
                      {level === "xhigh" ? "Max" : level}
                    </span>
                    <span className="text-muted-foreground/80">{REASONING_BLURB[level]}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-3 block text-caption text-muted-foreground/70">Effort Level</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(["xhigh", "high", "medium", "low", "minimal", "none"] as const).map((level) => (
            <button
              type="button"
              key={level}
              onClick={() => handleReasoningEffortChange(level)}
              aria-pressed={reasoningEffort === level}
              title={REASONING_BLURB[level]}
              className={cn(
                "rounded-lg border bg-background/30 px-2.5 py-1 text-xs transition-colors outline-none hover:border-muted-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                reasoningEffort === level
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {level === "xhigh" ? "Max" : level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>

        {reasoningEffort !== "none" && (
          <>
            <label className="mt-3 block text-caption text-muted-foreground/70" htmlFor="reasoning-max-tokens">
              Max Tokens (Anthropic models)
            </label>
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
                className="h-4 w-4 shrink-0 accent-primary mt-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
    </div>
  )
}
