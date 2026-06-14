import { useState, useCallback, useMemo } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, ExternalLink, Check, ArrowRight, KeyRound, Database, Share2, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getNotionCalendarSettings, setNotionCalendarSettings } from "@/lib/settings"
import { notifyUserSettingsChanged } from "@/lib/sync/engine"
import type { NotionCalendarSettings } from "@/lib/settings"
import { formatTimeAgo } from "./constants"

type NotionPropertyField = "titleProperty" | "dateProperty" | "typeProperty" | "completedProperty" | "subjectProperty"

interface NotionSectionProps {
  onSyncNotionCalendar?: (onProgress: (msg: string) => void) => Promise<{ created: unknown[]; updated: unknown[]; createdSessions?: unknown[]; updatedSessions?: unknown[]; skipped: number; skippedReasons?: string[]; pushedCreated?: number; pushedUpdated?: number; deleted?: number; pushErrors?: string[] } | null>
  lastSyncTime?: number
}

interface Step {
  number: number
  icon: LucideIcon
  title: string
  hint: string
  link: { label: string; href: string }
  done: boolean
}

export function NotionSection({ onSyncNotionCalendar, lastSyncTime }: NotionSectionProps) {
  const [notionSettings, setNotionSettings] = useState<NotionCalendarSettings>(() => getNotionCalendarSettings())
  const [notionSaved, setNotionSaved] = useState(false)
  const [notionSyncing, setNotionSyncing] = useState(false)
  const [notionSyncResult, setNotionSyncResult] = useState<string | null>(null)
  const [notionSyncPhase, setNotionSyncPhase] = useState<string | null>(null)
  const [notionSyncBreakdown, setNotionSyncBreakdown] = useState<{
    created: number
    updated: number
    createdSessions: number
    updatedSessions: number
    pushedCreated: number
    pushedUpdated: number
    deleted: number
    skipped: number
    pushErrors: number
  } | null>(null)
  const [stepsOpen, setStepsOpen] = useState(false)
  const reduceMotion = useReducedMotion()

  const handleNotionSettingChange = useCallback((field: keyof NotionCalendarSettings, value: string) => {
    setNotionSettings((current) => {
      const next = { ...current, [field]: value }
      setNotionCalendarSettings(next)
      return next
    })
    setNotionSaved(true)
    setNotionSyncResult(null)
    setTimeout(() => setNotionSaved(false), 2000)
    notifyUserSettingsChanged()
  }, [])

  const handleSyncNotionCalendar = useCallback(() => {
    if (!onSyncNotionCalendar) return
    setNotionSyncing(true)
    setNotionSyncResult(null)
    setNotionSyncBreakdown(null)
    setNotionSyncPhase("Connecting to Notion…")
    onSyncNotionCalendar((msg) => setNotionSyncPhase(msg))
      .then((result) => {
        if (!result) { setNotionSyncResult("Sync skipped"); return }
        setNotionSyncBreakdown({
          created: result.created.length,
          updated: result.updated.length,
          createdSessions: result.createdSessions?.length ?? 0,
          updatedSessions: result.updatedSessions?.length ?? 0,
          pushedCreated: result.pushedCreated ?? 0,
          pushedUpdated: result.pushedUpdated ?? 0,
          deleted: result.deleted ?? 0,
          skipped: result.skipped,
          pushErrors: result.pushErrors?.length ?? 0,
        })
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

  const hasToken = notionSettings.token.trim().length > 0
  const hasSource = notionSettings.dataSourceId.trim().length > 0

  const steps: Step[] = useMemo(() => [
    {
      number: 1,
      icon: KeyRound,
      title: "Create an integration",
      hint: "Get a secret token from Notion's developer dashboard.",
      link: { label: "Open Notion integrations", href: "https://www.notion.so/my-integrations" },
      done: hasToken,
    },
    {
      number: 2,
      icon: Share2,
      title: "Share your database",
      hint: "In Notion, open the database → Share → invite the integration.",
      link: { label: "Read the share guide", href: "https://developers.notion.com/docs/working-with-databases" },
      done: hasSource,
    },
    {
      number: 3,
      icon: Database,
      title: "Paste your credentials",
      hint: "Drop the token and database id into the form below.",
      link: { label: "Find your database id", href: "https://developers.notion.com/docs/working-with-databases#adding-pages-to-a-database" },
      done: hasToken && hasSource,
    },
  ], [hasToken, hasSource])

  const allDone = steps.every((s) => s.done)

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Notion Calendar Sync</h2>
            <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
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

        {/* Step indicator */}
        <button
          type="button"
          onClick={() => setStepsOpen((v) => !v)}
          aria-expanded={stepsOpen}
          aria-controls="notion-setup-steps"
          className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/30 px-2.5 py-2 text-left transition-colors hover:border-muted-foreground/30"
        >
          <div className="flex shrink-0 items-center" aria-hidden="true">
            {steps.map((step, i) => (
              <span
                key={step.number}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-semibold tabular-nums transition-colors",
                  i > 0 && "-ml-1.5",
                  step.done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border bg-background text-muted-foreground",
                )}
                style={{ zIndex: steps.length - i }}
              >
                {step.done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : step.number}
              </span>
            ))}
          </div>
          <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
            {allDone
              ? "All set. You can sync any time."
              : hasToken && !hasSource
                ? "Step 2 of 3 — share your database"
                : !hasToken
                  ? "Step 1 of 3 — create a Notion integration"
                  : "Almost there"}
          </span>
          <motion.span
            animate={{ rotate: stepsOpen ? 90 : 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 text-muted-foreground/60"
            aria-hidden="true"
          >
            <ArrowRight className="h-3 w-3" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {stepsOpen && (
            <motion.ol
              id="notion-setup-steps"
              key="steps"
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-1.5">
                {steps.map((step) => {
                  const Icon = step.icon
                  return (
                    <li
                      key={step.number}
                      className={cn(
                        "flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                        step.done
                          ? "border-emerald-500/25 bg-emerald-500/[0.05]"
                          : "border-border/60 bg-background/30",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                          step.done ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {step.done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-caption font-medium leading-tight">
                          <span className="text-muted-foreground/60 tabular-nums">{step.number}.</span>{" "}
                          {step.title}
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/75 text-wrap-balance">
                          {step.hint}
                        </p>
                        <a
                          href={step.link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary transition-colors hover:text-primary/80"
                        >
                          {step.link.label}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </li>
                  )
                })}
              </div>
            </motion.ol>
          )}
        </AnimatePresence>
      </section>

      <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
        <div className="grid gap-2">
          <label className="text-caption text-muted-foreground/70" htmlFor="notion-token">Integration token</label>
          <Input
            id="notion-token"
            type="password"
            value={notionSettings.token}
            onChange={(event) => handleNotionSettingChange("token", event.target.value)}
            placeholder="secret_…"
            className="font-mono text-xs"
          />
          <p className="rounded-lg border border-border/70 bg-background/30 p-2.5 text-caption text-muted-foreground/70">
            Integration tokens stay on this device and are not synced to your account.
          </p>
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
              <motion.div
                key="result"
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "rounded-lg border px-3 py-2 space-y-2",
                  notionSyncResult.includes("error") || notionSyncResult.includes("failed")
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
                )}
              >
                <p className="text-caption">{notionSyncResult}</p>
                {notionSyncBreakdown && (
                  <div className="flex flex-wrap gap-1.5">
                    {notionSyncBreakdown.created > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        {notionSyncBreakdown.created} created
                      </span>
                    )}
                    {notionSyncBreakdown.updated > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                        {notionSyncBreakdown.updated} updated
                      </span>
                    )}
                    {notionSyncBreakdown.createdSessions > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                        {notionSyncBreakdown.createdSessions} sessions created
                      </span>
                    )}
                    {notionSyncBreakdown.updatedSessions > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
                        {notionSyncBreakdown.updatedSessions} sessions updated
                      </span>
                    )}
                    {notionSyncBreakdown.pushedCreated > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        {notionSyncBreakdown.pushedCreated} pushed
                      </span>
                    )}
                    {notionSyncBreakdown.pushedUpdated > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        {notionSyncBreakdown.pushedUpdated} pushed updates
                      </span>
                    )}
                    {notionSyncBreakdown.deleted > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {notionSyncBreakdown.deleted} deleted
                      </span>
                    )}
                    {notionSyncBreakdown.skipped > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                        {notionSyncBreakdown.skipped} skipped
                      </span>
                    )}
                    {notionSyncBreakdown.pushErrors > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                        {notionSyncBreakdown.pushErrors} push errors
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            ) : lastSyncTime && lastSyncTime > 0 ? (
              <p className="text-caption text-muted-foreground/60">
                Last synced <span className="font-medium text-foreground/75">{formatTimeAgo(lastSyncTime)}</span>
              </p>
            ) : (
              <p className="text-caption text-muted-foreground/50">Never synced</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {notionSaved && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-caption font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
            <a
              href="https://developers.notion.com/docs/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              Setup
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
