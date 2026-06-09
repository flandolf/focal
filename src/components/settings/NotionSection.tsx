import { useState, useCallback, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { getNotionCalendarSettings, setNotionCalendarSettings } from "@/lib/settings"
import type { NotionCalendarSettings } from "@/lib/settings"
import { SETTINGS_SECTION_CLASS, SETTINGS_LINK_CLASS, formatTimeAgo } from "./constants"

type NotionPropertyField = "titleProperty" | "dateProperty" | "typeProperty" | "completedProperty" | "subjectProperty"

interface NotionSectionProps {
  onSyncNotionCalendar?: (onProgress: (msg: string) => void) => Promise<{ created: unknown[]; updated: unknown[]; createdSessions?: unknown[]; updatedSessions?: unknown[]; skipped: number; skippedReasons?: string[]; pushedCreated?: number; pushedUpdated?: number; deleted?: number; pushErrors?: string[] } | null>
  lastSyncTime?: number
}

export function NotionSection({ onSyncNotionCalendar, lastSyncTime }: NotionSectionProps) {
  const [notionSettings, setNotionSettings] = useState<NotionCalendarSettings>(() => getNotionCalendarSettings())
  const [notionSaved, setNotionSaved] = useState(false)
  const [notionSyncing, setNotionSyncing] = useState(false)
  const [notionSyncResult, setNotionSyncResult] = useState<string | null>(null)
  const [notionSyncPhase, setNotionSyncPhase] = useState<string | null>(null)

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
  )
}
