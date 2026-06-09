import { useState, useCallback, useRef, useMemo } from "react"
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Wand2,
  X,
  Calendar as CalendarIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { getTimetableConfig, setTimetableConfig, type TimetableConfig } from "@/lib/settings"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import { VCE_SUBJECTS, type TimetableEntry, type TimetableDayLabel } from "@/lib/types"
import { parseTimetableFromImage } from "@/lib/timetable"

type Step = "upload" | "review" | "done"

interface HolidayDraft {
  id: string
  name: string
  startDate: string
  endDate: string
}

interface PeriodDraft {
  period: string
  subject: string
  location: string
  startTime: string
  endTime: string
}

interface EntryDraft {
  id: string
  dayLabel: number
  periods: PeriodDraft[]
  approved: boolean
}

function generateId() {
  return crypto.randomUUID()
}

function EntryCard({
  draft,
  onToggle,
  onDelete,
  onUpdatePeriod,
  onUpdateDay,
  allSubjects,
}: {
  draft: EntryDraft
  onToggle: () => void
  onDelete: () => void
  onUpdatePeriod: (index: number, field: keyof PeriodDraft, value: string) => void
  onUpdateDay: (day: number) => void
  allSubjects: { id: string; name: string; shortCode: string; color: string }[]
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={cn(
      "rounded-xl border transition-colors",
      draft.approved
        ? "border-border/70 bg-background/50"
        : "border-destructive/30 bg-destructive/5",
    )}>
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
            draft.approved
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
          aria-label={draft.approved ? "Exclude entry" : "Include entry"}
        >
          {draft.approved && <Check className="h-3 w-3" />}
        </button>

        <select
          value={draft.dayLabel}
          onChange={(e) => onUpdateDay(Number(e.target.value))}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
            <option key={d} value={d}>Day {d}</option>
          ))}
        </select>

        <span className="ml-auto text-micro text-muted-foreground tabular-nums">
          {draft.periods.length} period{draft.periods.length !== 1 ? "s" : ""}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove entry"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border/60 px-3 pb-3 pt-2">
          <div className="space-y-1.5">
            {draft.periods.map((period, idx) => (
              <div key={idx} className="grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-2">
                <span className="text-micro font-medium text-muted-foreground w-16 truncate">
                  {period.period || "—"}
                </span>
                <select
                  value={period.subject}
                  onChange={(e) => onUpdatePeriod(idx, "subject", e.target.value)}
                  className="h-6 rounded border border-input bg-background px-1.5 text-xs"
                >
                  <option value="">No subject</option>
                  {allSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.shortCode})</option>
                  ))}
                </select>
                <input
                  type="time"
                  value={period.startTime}
                  onChange={(e) => onUpdatePeriod(idx, "startTime", e.target.value)}
                  className="h-6 rounded border border-input bg-background px-1.5 text-xs"
                />
                <input
                  type="time"
                  value={period.endTime}
                  onChange={(e) => onUpdatePeriod(idx, "endTime", e.target.value)}
                  className="h-6 rounded border border-input bg-background px-1.5 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface TimetableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customSubjects?: { id: string; name: string; shortCode: string; color: string }[]
}

export function TimetableDialog({ open, onOpenChange, customSubjects = [] }: TimetableDialogProps) {
  const existingConfig = getTimetableConfig()

  const [step, setStep] = useState<Step>("upload")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const [day1Starts, setDay1Starts] = useState(existingConfig.day1Starts)
  const [holidays, setHolidays] = useState<HolidayDraft[]>(
    existingConfig.holidays.length > 0
      ? existingConfig.holidays.map((h) => ({ id: generateId(), name: h.name, startDate: h.startDate, endDate: h.endDate }))
      : [],
  )
  const [entries, setEntries] = useState<EntryDraft[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const allSubjects = useMemo(
    () => [...VCE_SUBJECTS, ...(customSubjects ?? [])],
    [customSubjects],
  )

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, etc.)")
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setImagePreview(result)
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [setError, setImagePreview])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file (PNG, JPG, etc.)")
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = ev.target?.result as string
      setImagePreview(result)
      setError(null)
    }
    reader.readAsDataURL(file)
  }, [setError, setImagePreview])

  const handleParse = useCallback(async () => {
    if (!imagePreview) {
      setError("Upload a timetable image first.")
      return
    }
    if (!day1Starts) {
      setError("Set the date that Day 1 starts.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await parseTimetableFromImage(imagePreview, holidays, day1Starts)
      const drafts: EntryDraft[] = result.entries.map((e) => ({
        id: generateId(),
        dayLabel: e.dayLabel,
        periods: e.periods.map((p) => ({
          period: p.period,
          subject: p.subject,
          location: p.location,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
        approved: true,
      }))

      const newHolidays: HolidayDraft[] = result.holidays.map((h) => ({
        id: generateId(),
        name: h.name,
        startDate: h.startDate,
        endDate: h.endDate,
      }))

      if (newHolidays.length > 0) {
        setHolidays((prev) => {
          const ids = new Set(prev.map((p) => p.name))
          const toAdd = newHolidays.filter((h) => !ids.has(h.name))
          return [...prev, ...toAdd]
        })
      }

      setEntries(drafts)
      setStep("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [imagePreview, day1Starts, holidays, setError, setLoading, setStep])

  const toggleEntry = useCallback((id: string) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, approved: !e.approved } : e))
  }, [])

  const deleteEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const updatePeriod = useCallback((id: string, periodIdx: number, field: keyof PeriodDraft, value: string) => {
    setEntries((prev) => prev.map((e) => {
      if (e.id !== id) return e
      const newPeriods = e.periods.map((p, i) => i === periodIdx ? { ...p, [field]: value } : p)
      return { ...e, periods: newPeriods }
    }))
  }, [])

  const updateDay = useCallback((id: string, day: number) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, dayLabel: day } : e))
  }, [])



  const addHoliday = useCallback(() => {
    setHolidays((prev) => [...prev, { id: generateId(), name: "", startDate: "", endDate: "" }])
  }, [])

  const updateHoliday = useCallback((id: string, field: keyof HolidayDraft, value: string) => {
    setHolidays((prev) => prev.map((h) => h.id === id ? { ...h, [field]: value } : h))
  }, [])

  const deleteHoliday = useCallback((id: string) => {
    setHolidays((prev) => prev.filter((h) => h.id !== id))
  }, [])

  const addEntry = useCallback(() => {
    setEntries((prev) => [...prev, {
      id: generateId(),
      dayLabel: 1,
      periods: [{ period: "Period 1", subject: "", location: "", startTime: "09:00", endTime: "10:00" }],
      approved: true,
    }])
  }, [])

  const handleSave = useCallback(() => {
    const approvedEntries = entries.filter((e) => e.approved)
    const timetableEntries: TimetableEntry[] = approvedEntries.map((e) => ({
      dayLabel: e.dayLabel as TimetableDayLabel,
      periods: e.periods.map((p) => ({
        period: p.period,
        subject: p.subject,
        location: p.location || undefined,
        startTime: p.startTime,
        endTime: p.endTime,
      })),
    }))

    const config: TimetableConfig = {
      enabled: timetableEntries.length > 0,
      day1Starts,
      holidays: holidays.map((h) => ({ name: h.name, startDate: h.startDate, endDate: h.endDate })),
      entries: timetableEntries,
    }
    setTimetableConfig(config)
    window.dispatchEvent(new Event("focal-timetable-updated"))
    setStep("done")
    setTimeout(() => {
      onOpenChange(false)
      setStep("upload")
      setImagePreview(null)
      setEntries([])
    }, 1200)
  }, [entries, day1Starts, holidays, onOpenChange, setStep, setImagePreview, setEntries])

  const handleClearTimetable = useCallback(async () => {
    const confirmed = await confirmDestructiveAction({
      title: "Remove timetable?",
      description: "Your parsed timetable will be deleted and the Timetable section will be hidden.",
      actionLabel: "Remove",
    })
    if (!confirmed) return
    setTimetableConfig({ ...getTimetableConfig(), enabled: false, entries: [] })
    window.dispatchEvent(new Event("focal-timetable-updated"))
    onOpenChange(false)
    setStep("upload")
    setImagePreview(null)
    setEntries([])
  }, [onOpenChange, setStep, setImagePreview, setEntries])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setStep("upload")
    setImagePreview(null)
    setError(null)
    setEntries([])
  }, [onOpenChange, setStep, setImagePreview, setError, setEntries])

  const approvedCount = entries.filter((e) => e.approved).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[min(92dvh,56rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            Timetable
          </DialogTitle>
          <DialogDescription>
            Upload a photo of your school timetable. AI parses it into a native 10-day cycle schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Step: Upload */}
          {step === "upload" && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              {error && (
                <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              {/* Image upload zone */}
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
                  imagePreview ? "border-primary/40 bg-primary/5" : "border-border/70 bg-muted/20",
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                {imagePreview ? (
                  <div className="relative w-full">
                    <img
                      src={imagePreview}
                      alt="Timetable preview"
                      className="mx-auto max-h-52 rounded-lg object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setImagePreview(null)}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive/80 text-destructive-foreground shadow-sm"
                      aria-label="Remove image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="mb-3 h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm font-medium text-muted-foreground">Drop timetable image here</p>
                    <p className="mt-1 text-xs text-muted-foreground/60">or click Browse to select a file</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </>
                )}
              </div>

              {/* Day 1 configuration */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="day1-starts">
                  Day 1 starts on
                </label>
                <p className="text-xs text-muted-foreground/70">
                  Choose a past Monday that began Day 1 of the cycle. The cycle repeats every 10 days.
                </p>
                <input
                  id="day1-starts"
                  type="date"
                  value={day1Starts}
                  onChange={(e) => setDay1Starts(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              {/* Holidays */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">School holidays</label>
                  <Button variant="ghost" size="sm" onClick={addHoliday} className="h-7 gap-1 rounded-lg text-xs">
                    <Plus className="h-3 w-3" />
                    Add holiday
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Timetable periods are hidden on school holiday dates.
                </p>
                {holidays.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground/70">
                    No holidays added yet.
                  </p>
                )}
                <div className="space-y-1.5">
                  {holidays.map((holiday) => (
                    <div key={holiday.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
                      <Input
                        placeholder="Holiday name"
                        value={holiday.name}
                        onChange={(e) => updateHoliday(holiday.id, "name", e.target.value)}
                        className="h-6 flex-1 text-xs"
                      />
                      <input
                        type="date"
                        value={holiday.startDate}
                        onChange={(e) => updateHoliday(holiday.id, "startDate", e.target.value)}
                        className="h-6 w-32 rounded border border-input bg-background px-2 text-xs"
                      />
                      <span className="text-xs text-muted-foreground/50">to</span>
                      <input
                        type="date"
                        value={holiday.endDate}
                        onChange={(e) => updateHoliday(holiday.id, "endDate", e.target.value)}
                        className="h-6 w-32 rounded border border-input bg-background px-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => deleteHoliday(holiday.id)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove holiday"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Existing entries notice */}
              {existingConfig.entries.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  A timetable is already configured. Parsing will replace it.
                </div>
              )}
            </div>
          )}

          {/* Step: Review */}
          {step === "review" && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Review parsed timetable</p>
                  <p className="text-xs text-muted-foreground/70">
                    {approvedCount} of {entries.length} day{entries.length !== 1 ? "s" : ""} included
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addEntry} className="h-8 gap-1.5 rounded-xl">
                  <Plus className="h-3.5 w-3.5" />
                  Add day
                </Button>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-2 pr-2">
                  {entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground/70">No entries parsed. Try a clearer image.</p>
                    </div>
                  ) : (
                    entries.map((draft) => (
                      <EntryCard
                      key={draft.id}
                      draft={draft}
                      onToggle={() => toggleEntry(draft.id)}
                      onDelete={() => deleteEntry(draft.id)}
                      onUpdatePeriod={(idx, field, value) => updatePeriod(draft.id, idx, field, value)}
                      onUpdateDay={(day) => updateDay(draft.id, day)}
                      allSubjects={allSubjects}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Day 1 + holidays (editable in review too) */}
              <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium" htmlFor="review-day1">Day 1 starts</label>
                  <input
                    id="review-day1"
                    type="date"
                    value={day1Starts}
                    onChange={(e) => setDay1Starts(e.target.value)}
                    className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium">Holidays</label>
                  <Button variant="ghost" size="sm" onClick={addHoliday} className="h-6 gap-1 rounded-md px-2 text-xs">
                    <Plus className="h-2.5 w-2.5" />
                    Add
                  </Button>
                </div>
                {holidays.map((holiday) => (
                  <div key={holiday.id} className="flex items-center gap-1.5 rounded-md border border-border/50 bg-background/30 px-2 py-1.5">
                    <Input
                      placeholder="Name"
                      value={holiday.name}
                      onChange={(e) => updateHoliday(holiday.id, "name", e.target.value)}
                      className="h-5 flex-1 text-xs"
                    />
                    <input type="date" value={holiday.startDate} onChange={(e) => updateHoliday(holiday.id, "startDate", e.target.value)} className="h-5 w-28 rounded border border-input bg-background px-1.5 text-xs" />
                    <span className="text-micro text-muted-foreground/50">to</span>
                    <input type="date" value={holiday.endDate} onChange={(e) => updateHoliday(holiday.id, "endDate", e.target.value)} className="h-5 w-28 rounded border border-input bg-background px-1.5 text-xs" />
                    <button type="button" onClick={() => deleteHoliday(holiday.id)} className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="flex flex-1 items-center justify-center p-8">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/12">
                  <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
                </div>
                <p className="text-lg font-semibold">Timetable saved!</p>
                <p className="mt-1 text-sm text-muted-foreground/70">Your school timetable is now active.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none border-t px-5 py-3">
          {step === "upload" && (
            <>
              <div className="flex items-center gap-2">
                {existingConfig.entries.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleClearTimetable} className="h-8 rounded-xl px-2.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                    Remove timetable
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleParse}
                  disabled={loading || !imagePreview || !day1Starts}
                  className="gap-1.5 text-background"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {loading ? "Analysing..." : "Parse with AI"}
                </Button>
              </div>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={approvedCount === 0}
                className="gap-1.5 text-background"
              >
                <Check className="h-4 w-4" />
                Save {approvedCount} day{approvedCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
          {step === "done" && null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}