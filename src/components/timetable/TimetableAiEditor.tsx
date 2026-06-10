import { useState, useCallback, useMemo } from "react"
import { Loader2, Wand2, Check, ArrowLeft, AlertCircle, Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getTimetableConfig, setTimetableConfig } from "@/lib/settings"
import { aiEditTimetable, type TimetableAiEditDraft, type TimetableAiEditResult } from "@/lib/timetable"
import { cn } from "@/lib/utils"
import { VCE_SUBJECTS } from "@/lib/types"
import type { TimetableConfig } from "@/lib/settings"
import type { Subject, TimetableDayLabel } from "@/lib/types"

// --- Helpers ---

function generateId() {
  return crypto.randomUUID()
}

function serializeEntryToTimetable(entries: TimetableAiEditDraft[]): TimetableConfig["entries"] {
  return entries.map((e) => ({
    dayLabel: e.dayLabel,
    periods: e.periods.map((p) => ({
      period: p.period,
      subject: p.subject,
      location: p.location || undefined,
      startTime: p.startTime,
      endTime: p.endTime,
    })),
  }))
}

// --- Props ---

interface TimetableAiEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customSubjects?: Subject[]
}

// --- Period edit row ---

function AiPeriodRow({
  period,
  index,
  onChange,
  onDelete,
}: {
  period: TimetableAiEditDraft["periods"][number]
  index: number
  onChange: (field: string, value: string) => void
  onDelete: () => void
}) {
  return (
    <div className="grid grid-cols-[4rem_1fr_5.5rem_5.5rem_auto] items-center gap-2 rounded-lg bg-muted/25 px-2.5 py-1.5">
      <input
        type="text"
        value={period.period}
        onChange={(e) => onChange("period", e.target.value)}
        placeholder={index === 0 ? "Period 1" : `Period ${index + 1}`}
        className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Period name"
      />
      <input
        type="text"
        value={period.subject}
        onChange={(e) => onChange("subject", e.target.value)}
        placeholder="Subject or label"
        className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Subject"
      />
      <input
        type="time"
        value={period.startTime}
        onChange={(e) => onChange("startTime", e.target.value)}
        className="h-6 rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Start time"
      />
      <input
        type="time"
        value={period.endTime}
        onChange={(e) => onChange("endTime", e.target.value)}
        className="h-6 rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="End time"
      />
      <div className="flex items-center">
        <input
          type="text"
          value={period.location}
          onChange={(e) => onChange("location", e.target.value)}
          placeholder="Rm"
          className="h-6 w-12 rounded border border-input bg-background px-1 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Location"
        />
        <button
          type="button"
          onClick={onDelete}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove period"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// --- Day entry card ---

function AiEntryCard({
  draft,
  duplicate,
  onChangeDay,
  onToggle,
  onDeleteDay,
  onUpdatePeriod,
  onDeletePeriod,
  onAddPeriod,
}: {
  draft: TimetableAiEditDraft & { id: string; approved: boolean }
  duplicate?: boolean
  onChangeDay: (day: number) => void
  onToggle: () => void
  onDeleteDay: () => void
  onUpdatePeriod: (periodIdx: number, field: string, value: string) => void
  onDeletePeriod: (periodIdx: number) => void
  onAddPeriod: () => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        duplicate
          ? "border-amber-400/50 bg-amber-50/30 dark:border-amber-800/50 dark:bg-amber-950/20"
          : draft.approved
            ? "border-border/70 bg-background/50"
            : "border-destructive/25 bg-destructive/4",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
            draft.approved
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30",
          )}
          aria-label={draft.approved ? "Exclude day" : "Include day"}
        >
          {draft.approved && <Check className="h-3 w-3" />}
        </button>

        <select
          value={draft.dayLabel}
          onChange={(e) => { onChangeDay(Number(e.currentTarget.value)) }}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
            <option key={d} value={d}>Day {d}</option>
          ))}
        </select>

        <span className="ml-auto text-micro tabular-nums text-muted-foreground/60">
          {draft.periods.length} {draft.periods.length === 1 ? "period" : "periods"}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onDeleteDay}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove day entry"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Periods */}
      {expanded && (
        <div className="border-t border-border/50 px-3 pb-3 pt-2">
          <div className="space-y-1.5">
            {draft.periods.map((period, idx) => (
              <AiPeriodRow
                key={idx}
                period={period}
                index={idx}
                onChange={(field, value) => onUpdatePeriod(idx, field, value)}
                onDelete={() => onDeletePeriod(idx)}
              />
            ))}
          </div>
          <Button variant="ghost" size="xs" onClick={onAddPeriod} className="mt-1.5 h-6 gap-1 text-xs text-muted-foreground/70">
            <Plus className="h-3 w-3" />
            Add period
          </Button>
        </div>
      )}
    </div>
  )
}

// --- Main dialog ---

export function TimetableAiEditor({ open, onOpenChange, customSubjects = [] }: TimetableAiEditorProps) {
  // Snapshot config on each open so a stale entry (e.g. from a previous edit) can't overwrite newer changes.
  const [config, setConfig] = useState(() => getTimetableConfig())

  const [instruction, setInstruction] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Proposed result from AI
  const [result, setResult] = useState<TimetableAiEditResult | null>(null)
  const [saved, setSaved] = useState(false)

  // Editable draft state for the review step
  const [editableEntries, setEditableEntries] = useState<(TimetableAiEditDraft & { id: string; approved: boolean })[]>([])
  const [editableDay1, setEditableDay1] = useState("")

  const allSubjects = useMemo(() => [...VCE_SUBJECTS, ...customSubjects], [customSubjects])

  // Detect duplicate day labels (user can change the day in the dropdown)
  const duplicateDayLabels = useMemo(() => {
    const counts = new Map<TimetableDayLabel, number>()
    editableEntries.forEach((e) => counts.set(e.dayLabel, (counts.get(e.dayLabel) ?? 0) + 1))
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([d]) => d))
  }, [editableEntries])
  const hasDuplicates = duplicateDayLabels.size > 0

  // Build diff summary from current config vs proposed
  const diffSummary = useMemo(() => {
    if (!result) return []
    const changes: string[] = []

    const currentDays = new Set(config.entries.map((e) => e.dayLabel))
    const proposedDays = new Set<number>(result.entries.map((e) => e.dayLabel))

    const added = result.entries.filter((e) => !currentDays.has(e.dayLabel))
    const removed = config.entries.filter((e) => !proposedDays.has(e.dayLabel))

    if (added.length > 0) changes.push(`Day${added.length > 1 ? "s" : ""} added: ${added.map((e) => e.dayLabel).join(", ")}`)
    if (removed.length > 0) changes.push(`Day${removed.length > 1 ? "s" : ""} removed: ${removed.map((e) => e.dayLabel).join(", ")}`)

    const common = result.entries.filter((e) => currentDays.has(e.dayLabel))
    const modified = common.filter((e) => {
      const cur = config.entries.find((c) => c.dayLabel === e.dayLabel)
      if (!cur) return true
      if (cur.periods.length !== e.periods.length) return true
      return cur.periods.some((cp, i) => {
        const pp = e.periods[i]
        return pp
          ? cp.subject !== pp.subject || cp.startTime !== pp.startTime || cp.endTime !== pp.endTime || cp.location !== pp.location
          : true
      })
    })
    if (modified.length > 0) changes.push(`Day${modified.length > 1 ? "s" : ""} modified: ${modified.map((e) => e.dayLabel).join(", ")}`)

    if (result.day1Starts !== config.day1Starts) changes.push("Day 1 start date changed")

    // Compare holidays as sets, not by index, so reordering doesn't flag a false positive.
    const currentHolidayKeys = new Set(config.holidays.map((h) => `${h.name}|${h.startDate}|${h.endDate}`))
    const proposedHolidayKeys = new Set(result.holidays.map((h) => `${h.name}|${h.startDate}|${h.endDate}`))
    const holidaysChanged =
      currentHolidayKeys.size !== proposedHolidayKeys.size ||
      Array.from(currentHolidayKeys).some((k) => !proposedHolidayKeys.has(k))
    if (holidaysChanged) changes.push("Holidays updated")

    return changes
  }, [result, config])

  // Init editing state from result
  const initFromResult = useCallback((res: TimetableAiEditResult) => {
    setEditableEntries(
      res.entries.map((e) => ({
        ...e,
        id: generateId(),
        approved: true,
      })),
    )
    setEditableDay1(res.day1Starts)
  }, [])

  const handleGenerate = async () => {
    if (!instruction.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await aiEditTimetable(
        {
          day1Starts: config.day1Starts,
          holidays: config.holidays,
          entries: config.entries,
        },
        instruction.trim(),
        allSubjects,
      )
      setResult(res)
      initFromResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleRefine = () => {
    setResult(null)
    setError(null)
  }

  const handleApply = () => {
    if (hasDuplicates) return
    // If multiple entries target the same day, keep the first approved one and discard the rest
    // so we never write two entries with the same dayLabel (which would corrupt the data).
    const approved = editableEntries.filter((e) => e.approved)
    const seen = new Set<TimetableDayLabel>()
    const deduped = approved.filter((e) => {
      if (seen.has(e.dayLabel)) return false
      seen.add(e.dayLabel)
      return true
    })
    const entries = serializeEntryToTimetable(deduped)
    const updated: TimetableConfig = {
      enabled: entries.length > 0,
      day1Starts: editableDay1,
      holidays: result?.holidays ?? config.holidays,
      entries,
    }
    setTimetableConfig(updated)
    window.dispatchEvent(new Event("focal-timetable-updated"))
    setSaved(true)
  }

  const resetState = useCallback(() => {
    setInstruction("")
    setResult(null)
    setError(null)
    setSaved(false)
    setEditableEntries([])
    setConfig(getTimetableConfig())
  }, [])

  const handleClose = () => {
    onOpenChange(false)
    // Reset on next tick so the close animation isn't interrupted by state churn.
    // Using rAF is more reliable than a fixed timeout (which can race with the close transition).
    const id = requestAnimationFrame(() => resetState())
    return () => cancelAnimationFrame(id)
  }

  // --- Entry card callbacks ---
  const toggleEntry = (id: string) => {
    setEditableEntries((prev) => prev.map((e) => (e.id === id ? { ...e, approved: !e.approved } : e)))
  }
  const deleteEntry = (id: string) => {
    setEditableEntries((prev) => prev.filter((e) => e.id !== id))
  }
  const changeEntryDay = (id: string, day: number) => {
    setEditableEntries((prev) => prev.map((e) => (e.id === id ? { ...e, dayLabel: day as TimetableDayLabel } : e)))
  }
  const updatePeriod = (entryId: string, periodIdx: number, field: string, value: string) => {
    setEditableEntries((prev) =>
      prev.map((e) =>
        e.id !== entryId
          ? e
          : { ...e, periods: e.periods.map((p, i) => (i === periodIdx ? { ...p, [field]: value } : p)) },
      ),
    )
  }
  const deletePeriod = (entryId: string, periodIdx: number) => {
    setEditableEntries((prev) =>
      prev.map((e) => (e.id !== entryId ? e : { ...e, periods: e.periods.filter((_, i) => i !== periodIdx) })),
    )
  }
  const addPeriod = (entryId: string) => {
    setEditableEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e
        const last = e.periods[e.periods.length - 1]
        const parseTime = (t: string, addMins: number) => {
          const [h, m] = t.split(":").map(Number)
          const total = (h ?? 9) * 60 + (m ?? 0) + addMins
          return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
        }
        const newStart = last ? parseTime(last.endTime, 10) : "09:00"
        const newEnd = last ? parseTime(last.endTime, 70) : "10:00"
        return {
          ...e,
          periods: [...e.periods, { period: `Period ${e.periods.length + 1}`, subject: "", location: "", startTime: newStart, endTime: newEnd }],
        }
      }),
    )
  }

  const approvedCount = editableEntries.filter((e) => e.approved).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[min(92dvh,54rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-3.5 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-muted-foreground" />
            AI Timetable Editor
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* Error banner */}
          {error && (
            <p className="flex items-center gap-2 rounded-lg bg-destructive/8 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {/* Saved confirmation */}
          {saved && (
            <div className="flex flex-1 flex-col items-center justify-center py-16">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/12">
                <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-semibold">Changes applied</p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                Timetable updated — {approvedCount} day{approvedCount !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Input step */}
          {!saved && !result && (
            <div className="flex flex-1 flex-col gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none" htmlFor="ai-instruction">
                  What would you like to change?
                </label>
                <p className="text-xs text-muted-foreground/60">
                  Describe the changes in natural language. For example: <em>"Swap English and Chemistry on Day 2"</em>,{" "}
                  <em>"Add Maths Methods Period 3 on Day 4"</em>,{" "}
                  <em>"Remove Period 2 from Day 5"</em>.
                </p>
              </div>
              <textarea
                id="ai-instruction"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder='e.g. "Change Maths Methods on Day 3 to start at 10:30"'
                className="min-h-[7rem] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                autoFocus
              />
            </div>
          )}

          {/* Review step */}
          {!saved && result && (
            <>
              {/* Summary + diff */}
              <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
                <div className="flex items-start gap-3">
                  <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{result.summary}</p>
                    {diffSummary.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5">
                        {diffSummary.map((change, i) => (
                          <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="h-1 w-1 rounded-full bg-muted-foreground/30 shrink-0" />
                            {change}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Editable day entries */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Proposed timetable</p>
                  <p className="text-xs text-muted-foreground/70">
                    {approvedCount} of {editableEntries.length} day{editableEntries.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {hasDuplicates && (
                  <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    Two or more entries share the same day number. Only the first approved entry for each day will be saved.
                  </p>
                )}

                <ScrollArea className="-mx-5 min-h-0 px-5" style={{ maxHeight: "calc(100% - 2rem)" }}>
                  <div className="space-y-2">
                    {editableEntries.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <p className="text-sm text-muted-foreground/60">No days in the proposed timetable.</p>
                      </div>
                    ) : (
                      editableEntries.map((draft) => (
                        <AiEntryCard
                          key={draft.id}
                          draft={draft}
                          duplicate={duplicateDayLabels.has(draft.dayLabel)}
                          onChangeDay={(day: number) => changeEntryDay(draft.id, day)}
                          onToggle={() => toggleEntry(draft.id)}
                          onDeleteDay={() => deleteEntry(draft.id)}
                          onUpdatePeriod={(idx, field, value) => updatePeriod(draft.id, idx, field, value)}
                          onDeletePeriod={(idx) => deletePeriod(draft.id, idx)}
                          onAddPeriod={() => addPeriod(draft.id)}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none border-t px-5 py-3">
          {saved ? (
            <Button size="sm" onClick={handleClose} className="ml-auto gap-1.5 text-background">
              <Check className="h-4 w-4" />
              Done
            </Button>
          ) : result ? (
            <>
              <Button variant="outline" size="sm" onClick={handleRefine} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />
                Refine
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleApply} disabled={approvedCount === 0} className="gap-1.5 text-background">
                  <Check className="h-4 w-4" />
                  Apply {approvedCount} day{approvedCount !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={loading || !instruction.trim()}
                className="gap-1.5 text-background"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {loading ? "Generating…" : "Generate"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
