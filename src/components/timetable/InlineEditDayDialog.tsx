import { useState, useCallback } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getTimetableConfig, setTimetableConfig } from "@/lib/settings"
import { type TimetableEntry, type TimetableDayLabel, VCE_SUBJECTS } from "@/lib/types"
import { getTimetableEntriesForDay } from "@/lib/timetable"
import { useMemo } from "react"


interface PeriodDraft {
  period: string
  subject: string
  location: string
  startTime: string
  endTime: string
}

interface InlineEditDayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dayLabel: TimetableDayLabel
  customSubjects?: { id: string; name: string; shortCode: string; color: string }[]
}

export function InlineEditDayDialog({
  open,
  onOpenChange,
  dayLabel: initialDayLabel,
  customSubjects = [],
}: InlineEditDayDialogProps) {
  const config = getTimetableConfig()

  // Find existing entry for this day, or start blank
  const existingEntries = getTimetableEntriesForDay(initialDayLabel, config.entries as TimetableEntry[])
  const existing = existingEntries[0]

  const [dayLabel, setDayLabel] = useState<TimetableDayLabel>(existing?.dayLabel ?? initialDayLabel)
  const [periods, setPeriods] = useState<PeriodDraft[]>(
    existing?.periods.map((p) => ({
      period: p.period,
      subject: p.subject,
      location: p.location ?? "",
      startTime: p.startTime,
      endTime: p.endTime,
    })) ?? [{ period: "Period 1", subject: "", location: "", startTime: "09:00", endTime: "10:00" }],
  )

  const allSubjects = useMemo(
    () => [...VCE_SUBJECTS, ...customSubjects],
    [customSubjects],
  )

  const updatePeriod = useCallback((idx: number, field: keyof PeriodDraft, value: string) => {
    setPeriods((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }, [])

  const deletePeriod = useCallback((idx: number) => {
    setPeriods((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const addPeriod = useCallback(() => {
    const last = periods[periods.length - 1]
    const newStart = last
      ? (() => {
          const [h, m] = last.endTime.split(":").map(Number)
          const total = h * 60 + m + 10
          return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
        })()
      : "09:00"
    const newEnd = last
      ? (() => {
          const [h, m] = last.endTime.split(":").map(Number)
          const total = h * 60 + m + 60
          return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
        })()
      : "10:00"
    setPeriods((prev) => [
      ...prev,
      { period: `Period ${prev.length + 1}`, subject: "", location: "", startTime: newStart, endTime: newEnd },
    ])
  }, [periods])

  const handleSave = useCallback(() => {
    if (periods.length === 0) {
      // Remove existing entry for this day if periods cleared
      const filtered = (config.entries as TimetableEntry[]).filter((e) => e.dayLabel !== dayLabel)
      setTimetableConfig({ ...config, entries: filtered, enabled: filtered.length > 0 })
      window.dispatchEvent(new Event("focal-timetable-updated"))
      onOpenChange(false)
      return
    }

    const newEntry: TimetableEntry = {
      dayLabel,
      periods: periods.map((p) => ({
        period: p.period,
        subject: p.subject,
        location: p.location || undefined,
        startTime: p.startTime,
        endTime: p.endTime,
      })),
    }

    // Replace any existing entry for same day, or append
    const filtered = (config.entries as TimetableEntry[]).filter((e) => e.dayLabel !== dayLabel)
    const updated = [...filtered, newEntry]
    setTimetableConfig({ ...config, entries: updated, enabled: updated.length > 0 })
    window.dispatchEvent(new Event("focal-timetable-updated"))
    onOpenChange(false)
  }, [periods, dayLabel, config, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-8rem)] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="text-base">Edit Day {initialDayLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* Day row */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">Day</label>
              <select
                value={dayLabel}
                onChange={(e) => setDayLabel(Number(e.target.value) as TimetableDayLabel)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm font-medium"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                  <option key={d} value={d}>Day {d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Periods */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Periods</span>
              <Button variant="ghost" size="sm" onClick={addPeriod} className="h-7 gap-1 rounded-lg text-xs">
                <Plus className="h-3 w-3" />
                Add period
              </Button>
            </div>

            {periods.length === 0 && (
              <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-4 text-center text-sm text-muted-foreground/70">
                No periods. Click &quot;Add period&quot; to add one, or save to remove this day.
              </p>
            )}

            <div className="space-y-1.5">
              {periods.map((period, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5"
                >
                  {/* Period name */}
                  <input
                    type="text"
                    value={period.period}
                    onChange={(e) => updatePeriod(idx, "period", e.target.value)}
                    placeholder="Period name"
                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                  />

                  {/* Subject */}
                  <select
                    value={period.subject}
                    onChange={(e) => updatePeriod(idx, "subject", e.target.value)}
                    className="h-7 rounded border border-input bg-background px-1.5 text-xs"
                  >
                    <option value="">No subject</option>
                    {allSubjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.shortCode}</option>
                    ))}
                  </select>

                  {/* Location */}
                  <input
                    type="text"
                    value={period.location}
                    onChange={(e) => updatePeriod(idx, "location", e.target.value)}
                    placeholder="Room"
                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                  />

                  <button
                    type="button"
                    onClick={() => deletePeriod(idx)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete period"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {periods.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">Name</span>
                  <span className="font-medium">Subject</span>
                  <span className="font-medium">Room</span>
                  <span />
                </div>
                <div className="mt-1 grid grid-cols-4 gap-2 text-xs text-muted-foreground/70">
                  <span>Period label</span>
                  <span>VCE subject</span>
                  <span>Optional</span>
                  <span />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5 text-background">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}