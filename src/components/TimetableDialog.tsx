import { useState, useCallback, useRef, useMemo } from "react"
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  defaultDayToWeekday,
  DEFAULT_CYCLE_LENGTH,
  getCycleLength,
  getDayToWeekday,
  getTimetableConfig,
  getWeekendTimetables,
  setTimetableConfig,
  type TimetableConfig,
} from "@/lib/settings"
import { VCE_SUBJECTS, type TimetableEntry } from "@/lib/types"
import { parseTimetableFromImage } from "@/lib/timetable"

type Step = "upload" | "review"

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

// --- Image upload zone ---

function ImageDropZone({
  imagePreview,
  onImage,
  onClear,
  error,
}: {
  imagePreview: string | null
  onImage: (dataUrl: string) => void
  onClear: () => void
  error: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const result = ev.target?.result as string
        if (result) onImage(result)
      }
      reader.readAsDataURL(file)
    },
    [onImage],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-colors",
        dragging && "border-primary/50 bg-primary/10",
        imagePreview
          ? "border-primary/30 bg-primary/5"
          : error
            ? "border-destructive/30 bg-destructive/5"
            : "border-border/60 bg-muted/20",
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {imagePreview ? (
        <div className="relative w-full">
          <img
            src={imagePreview}
            alt="Timetable preview"
            className="mx-auto max-h-44 rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-xs transition-colors hover:bg-destructive/20 hover:text-destructive"
            aria-label="Remove image"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m2 2 6 6M8 2l-6 6"/></svg>
          </button>
        </div>
      ) : (
        <>
          <Upload className="mb-2.5 h-7 w-7 text-muted-foreground/60" />
          <p className="text-sm font-medium text-muted-foreground">Upload timetable photo</p>
          <p className="mt-0.5 text-xs text-muted-foreground/60">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </>
      )}
    </div>
  )
}

// --- Day selector ---

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

function DaySelect({
  value,
  onChange,
  cycleLength,
  dayToWeekday,
}: {
  value: number
  onChange: (day: number) => void
  cycleLength: number
  dayToWeekday: number[]
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-7 w-[5.5rem] rounded-md px-2 text-xs font-medium">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: cycleLength }, (_, i) => i + 1).map((d) => (
          <SelectItem key={d} value={String(d)}>
            Day {d}
            {dayToWeekday[d - 1] !== undefined
              ? ` · ${WEEKDAY_SHORT[dayToWeekday[d - 1]]}`
              : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// --- Holiday row ---

function HolidayRow({
  holiday,
  onUpdate,
  onDelete,
}: {
  holiday: HolidayDraft
  onUpdate: (field: keyof HolidayDraft, value: string) => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-1.5">
      <Input
        placeholder="Name"
        value={holiday.name}
        onChange={(e) => onUpdate("name", e.target.value)}
        className="h-6 flex-1 min-w-0 text-xs"
      />
      <input
        type="date"
        value={holiday.startDate}
        onChange={(e) => onUpdate("startDate", e.target.value)}
        className="h-6 w-30 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <span className="text-caption text-muted-foreground/50" aria-hidden>–</span>
      <input
        type="date"
        value={holiday.endDate}
        onChange={(e) => onUpdate("endDate", e.target.value)}
        className="h-6 w-30 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <button
        type="button"
        onClick={onDelete}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:text-foreground"
        aria-label="Remove holiday"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m2 2 6 6M8 2l-6 6"/></svg>
      </button>
    </div>
  )
}

// --- Period row inside a day entry ---

function PeriodEditRow({
  period,
  index,
  allSubjects,
  onChange,
  onDelete,
}: {
  period: PeriodDraft
  index: number
  allSubjects: { id: string; name: string; shortCode: string; color: string }[]
  onChange: (field: keyof PeriodDraft, value: string) => void
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
      <Select value={period.subject || "_none"} onValueChange={(value) => onChange("subject", value === "_none" ? "" : value)}>
        <SelectTrigger className="h-6 w-full rounded px-1.5 text-xs" aria-label="Subject">
          <SelectValue placeholder="No subject" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">No subject</SelectItem>
          {allSubjects.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.shortCode || s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
          className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:text-foreground"
          aria-label="Remove period"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m2 2 6 6M8 2l-6 6"/></svg>
        </button>
      </div>
    </div>
  )
}

// --- Entry card (a single day's block) ---

function EntryCard({
  draft,
  onToggle,
  onDelete,
  onAddPeriod,
  onUpdatePeriod,
  onDeletePeriod,
  onUpdateDay,
  allSubjects,
  cycleLength,
  dayToWeekday,
}: {
  draft: EntryDraft
  onToggle: () => void
  onDelete: () => void
  onAddPeriod: () => void
  onUpdatePeriod: (index: number, field: keyof PeriodDraft, value: string) => void
  onDeletePeriod: (index: number) => void
  onUpdateDay: (day: number) => void
  allSubjects: { id: string; name: string; shortCode: string; color: string }[]
  cycleLength: number
  dayToWeekday: number[]
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        draft.approved
          ? "border-border/70 bg-background/50"
          : "border-destructive/30 bg-destructive/5",
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
              : "border-muted-foreground/50",
          )}
          aria-label={draft.approved ? "Exclude day" : "Include day"}
        >
          {draft.approved && <Check className="h-3 w-3" />}
        </button>

        <DaySelect
          value={draft.dayLabel}
          onChange={onUpdateDay}
          cycleLength={cycleLength}
          dayToWeekday={dayToWeekday}
        />

        <span className="ml-auto text-micro tabular-nums text-muted-foreground/70">
          {draft.periods.length} {draft.periods.length === 1 ? "period" : "periods"}
        </span>

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:text-foreground"
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
              <PeriodEditRow
                key={idx}
                period={period}
                index={idx}
                allSubjects={allSubjects}
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

// --- Cycle length + day-to-weekday editor ---

function CycleEditor({
  cycleLength,
  dayToWeekday,
  weekendTimetables,
  onCycleLengthChange,
  onDayToWeekdayChange,
  onWeekendTimetablesChange,
}: {
  cycleLength: number
  dayToWeekday: number[]
  weekendTimetables: boolean
  onCycleLengthChange: (n: number) => void
  onDayToWeekdayChange: (mapping: number[]) => void
  onWeekendTimetablesChange: (enabled: boolean) => void
}) {
  const isDefault = useMemo(() => {
    const def = defaultDayToWeekday(cycleLength, weekendTimetables)
    if (def.length !== dayToWeekday.length) return false
    return def.every((d, i) => d === dayToWeekday[i])
  }, [cycleLength, dayToWeekday, weekendTimetables])

  const handleLengthInput = useCallback(
    (raw: string) => {
      const n = parseInt(raw, 10)
      if (!Number.isFinite(n) || n < 1) return
      onCycleLengthChange(n)
    },
    [onCycleLengthChange],
  )

  const handleResetDefaults = useCallback(() => {
    onDayToWeekdayChange(defaultDayToWeekday(cycleLength, weekendTimetables))
  }, [cycleLength, weekendTimetables, onDayToWeekdayChange])

  const handleDayWeekday = useCallback(
    (dayIdx: number, weekday: number) => {
      const next = [...dayToWeekday]
      next[dayIdx] = weekday
      onDayToWeekdayChange(next)
    },
    [dayToWeekday, onDayToWeekdayChange],
  )

  return (
    <div className="space-y-2">
      {/* Weekend toggle */}
      <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border/40 bg-background/40 px-2 py-1.5">          <button
            type="button"
            onClick={() => onWeekendTimetablesChange(!weekendTimetables)}
            className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
              weekendTimetables
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/50",
            )}
            role="checkbox"
            aria-checked={weekendTimetables}
            aria-label="Include weekend timetables"
          >
            {weekendTimetables && <Check className="h-3 w-3" />}
          </button>
          <span className="flex-1 text-xs leading-snug">
            <span className="font-medium">Include weekend timetables</span>
            <span className="mt-0.5 block text-caption text-muted-foreground/70">
              When off (default), Sat &amp; Sun have no day label. Turn on to give
              weekend days their own slot in the cycle.
            </span>
          </span>
      </label>

      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <label className="text-sm font-medium leading-none" htmlFor="cycle-length">
            Cycle length
          </label>
          <p className="text-xs text-muted-foreground/70">
            How many school days before the cycle repeats. 10 = two school weeks.
          </p>
        </div>
        <Input
          id="cycle-length"
          type="number"
          min={1}
          max={60}
          value={cycleLength}
          onChange={(e) => handleLengthInput(e.target.value)}
          className="h-7 w-16 text-center text-xs"
          aria-label="Cycle length in days"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium leading-none">Day → weekday</span>
          <button
            type="button"
            onClick={handleResetDefaults}
            disabled={isDefault}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-caption text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            title="Reset to Mon–Fri pattern"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reset
          </button>
        </div>
        <p className="text-xs text-muted-foreground/70">
          Each Day X falls on this calendar weekday. Used to pick "today" automatically.
        </p>
        <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-border/50 bg-background/30 p-2 sm:grid-cols-3">
          {Array.from({ length: cycleLength }, (_, i) => i + 1).map((day, idx) => (
            <div
              key={day}
              className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-1.5 py-1"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted/40 text-caption font-bold tabular-nums text-foreground/80">
                {day}
              </span>
              <Select
                value={String(dayToWeekday[idx] ?? 1)}
                onValueChange={(v) => handleDayWeekday(idx, Number(v))}
              >
                <SelectTrigger className="h-5 min-w-0 flex-1 rounded border-0 bg-transparent px-1 text-caption shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_SHORT.map((label, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- Main dialog ---

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
  const [saved, setSaved] = useState(false)

  const [day1Starts, setDay1Starts] = useState(existingConfig.day1Starts)
  const [cycleLength, setCycleLength] = useState(() => getCycleLength(existingConfig))
  const [dayToWeekday, setDayToWeekday] = useState<number[]>(() => [...getDayToWeekday(existingConfig)])
  const [weekendTimetables, setWeekendTimetables] = useState<boolean>(() => getWeekendTimetables(existingConfig))
  const [holidays, setHolidays] = useState<HolidayDraft[]>(
    existingConfig.holidays.length > 0
      ? existingConfig.holidays.map((h) => ({ id: generateId(), name: h.name, startDate: h.startDate, endDate: h.endDate }))
      : [],
  )
  const [entries, setEntries] = useState<EntryDraft[]>([])

  const allSubjects = [...VCE_SUBJECTS, ...customSubjects]

  const handleParse = async () => {
    if (!imagePreview) { setError("Upload a timetable image first."); return }
    if (!day1Starts) { setError("Set the date that Day 1 starts."); return }

    setLoading(true)
    setError(null)
    try {
      const result = await parseTimetableFromImage(imagePreview, holidays, day1Starts)
      // Clamp the AI-returned day labels to the configured cycle length so days
      // past cycleLength don't leak in (e.g. AI returning days 1–10 for an 8-day cycle).
      const safeEntries = result.entries
        .filter((e) => e.dayLabel >= 1 && e.dayLabel <= cycleLength)
        .map((e) => ({ ...e }))
      const drafts: EntryDraft[] = safeEntries.map((e) => ({
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
          const ids = new Set(prev.map((p) => p.name.toLowerCase()))
          const toAdd = newHolidays.filter((h) => !ids.has(h.name.toLowerCase()))
          return toAdd.length ? [...prev, ...toAdd] : prev
        })
      }

      setEntries(drafts)
      setStep("review")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const toggleEntry = (id: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, approved: !e.approved } : e)))
  }
  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }
  const addEntry = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: generateId(),
        dayLabel: 1,
        periods: [{ period: "Period 1", subject: "", location: "", startTime: "09:00", endTime: "10:00" }],
        approved: true,
      },
    ])
  }
  const updatePeriod = (id: string, periodIdx: number, field: keyof PeriodDraft, value: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id !== id
          ? e
          : { ...e, periods: e.periods.map((p, i) => (i === periodIdx ? { ...p, [field]: value } : p)) },
      ),
    )
  }
  const deletePeriod = (id: string, periodIdx: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id !== id ? e : { ...e, periods: e.periods.filter((_, i) => i !== periodIdx) })),
    )
  }
  const addPeriod = (id: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
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
          periods: [
            ...e.periods,
            { period: `Period ${e.periods.length + 1}`, subject: "", location: "", startTime: newStart, endTime: newEnd },
          ],
        }
      }),
    )
  }
  const updateDay = (id: string, day: number) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, dayLabel: day } : e)))
  }

  const addHoliday = () => {
    setHolidays((prev) => [...prev, { id: generateId(), name: "", startDate: "", endDate: "" }])
  }
  const updateHoliday = (id: string, field: keyof HolidayDraft, value: string) => {
    setHolidays((prev) => prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)))
  }
  const deleteHoliday = (id: string) => {
    setHolidays((prev) => prev.filter((h) => h.id !== id))
  }

  const handleSave = () => {
    const approvedEntries = entries.filter((e) => e.approved)
    // Clamp entries to the configured cycle length so decreasing the cycle
    // doesn't silently leak dayLabels past the new range on save.
    const timetableEntries: TimetableEntry[] = approvedEntries
      .filter((e) => e.dayLabel >= 1 && e.dayLabel <= cycleLength)
      .map((e) => ({
        dayLabel: e.dayLabel,
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
      cycleLength,
      dayToWeekday: [...dayToWeekday],
      weekendTimetables,
    }
    setTimetableConfig(config)
    window.dispatchEvent(new Event("focal-timetable-updated"))
    setSaved(true)
  }

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(() => {
      setStep("upload")
      setImagePreview(null)
      setError(null)
      setEntries([])
      setSaved(false)
    }, 150)
  }

  const handleRemove = () => {
    setTimetableConfig({ ...getTimetableConfig(), enabled: false, entries: [] })
    window.dispatchEvent(new Event("focal-timetable-updated"))
    onOpenChange(false)
    setTimeout(() => {
      setStep("upload")
      setImagePreview(null)
      setError(null)
      setEntries([])
      setSaved(false)
    }, 150)
  }

  // When cycle length changes, keep dayToWeekday the right length — pad with
  // the default Mon–Fri pattern, or truncate if shrinking.
  const handleCycleLengthChange = useCallback((n: number) => {
    const safe = Math.max(1, Math.min(60, Math.floor(n) || DEFAULT_CYCLE_LENGTH))
    setCycleLength(safe)
    setDayToWeekday((prev) => {
      const def = defaultDayToWeekday(safe, weekendTimetables)
      if (prev.length === safe) return prev
      if (prev.length < safe) {
        return [...prev, ...def.slice(prev.length)]
      }
      return prev.slice(0, safe)
    })
  }, [weekendTimetables])

  // Toggling weekend timetables rebuilds the default pattern but preserves any
  // explicit overrides by clamping weekend values (0,6) to Mon (1) when off.
  const handleWeekendTimetablesChange = useCallback((enabled: boolean) => {
    setWeekendTimetables(enabled)
    setDayToWeekday((prev) => {
      const def = defaultDayToWeekday(cycleLength, enabled)
      if (enabled) return def
      return prev.map((d) => (d === 0 || d === 6 ? 1 : d))
    })
  }, [cycleLength])

  const approvedCount = entries.filter((e) => e.approved).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[min(92dvh,54rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-3.5 pt-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            Timetable
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {/* Error banner */}
          {error && (
            <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
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
              <p className="text-sm font-semibold">Timetable saved</p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                Your timetable is now active — {approvedCount} day{approvedCount !== 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Step: Upload */}
          {!saved && step === "upload" && (
            <>
              <ImageDropZone
                imagePreview={imagePreview}
                onImage={setImagePreview}
                onClear={() => setImagePreview(null)}
                error={error}
              />

              {/* Day 1 start */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none" htmlFor="day1-starts">
                  Day 1 starts
                </label>
                <p className="text-xs text-muted-foreground/70">
                  The date of a past Monday that began Day 1. Cycle advances only on weekdays (Mon–Fri), so Day 6 = Monday of week 2.
                </p>
                <input
                  id="day1-starts"
                  type="date"
                  value={day1Starts}
                  onChange={(e) => setDay1Starts(e.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>

              {/* Cycle length + day-to-weekday mapping */}
              <CycleEditor
                cycleLength={cycleLength}
                dayToWeekday={dayToWeekday}
                weekendTimetables={weekendTimetables}
                onCycleLengthChange={handleCycleLengthChange}
                onDayToWeekdayChange={setDayToWeekday}
                onWeekendTimetablesChange={handleWeekendTimetablesChange}
              />

              {/* Holidays */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium leading-none">Holidays</span>
                  <Button variant="ghost" size="xs" onClick={addHoliday} className="h-6 gap-1 rounded-md text-xs">
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Periods are hidden on holiday dates.
                </p>
                {holidays.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground/70">
                    No holidays added.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {holidays.map((h) => (
                      <HolidayRow
                        key={h.id}
                        holiday={h}
                        onUpdate={(field, value) => updateHoliday(h.id, field, value)}
                        onDelete={() => deleteHoliday(h.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Existing timetable notice */}
              {existingConfig.entries.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200/50 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  A timetable is already configured. Parsing will replace it.
                </div>
              )}
            </>
          )}

          {/* Step: Review */}
          {!saved && step === "review" && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Review parsed timetable</p>
                  <p className="text-xs text-muted-foreground/70">
                    {approvedCount} of {entries.length} day{entries.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={addEntry} className="h-7 gap-1.5 rounded-lg text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Add day
                </Button>
              </div>

              <ScrollArea className="min-h-0 flex-1 -mx-5 px-5">
                <div className="space-y-2">
                  {entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground/70">No entries parsed. Try a clearer image.</p>
                    </div>
                  ) : (
                    entries.map((draft) => (
                      <EntryCard
                        key={draft.id}
                        draft={draft}
                        onToggle={() => toggleEntry(draft.id)}
                        onDelete={() => deleteEntry(draft.id)}
                        onAddPeriod={() => addPeriod(draft.id)}
                        onUpdatePeriod={(idx, field, value) => updatePeriod(draft.id, idx, field, value)}
                        onDeletePeriod={(idx) => deletePeriod(draft.id, idx)}
                        onUpdateDay={(day) => updateDay(draft.id, day)}
                        allSubjects={allSubjects}
                        cycleLength={cycleLength}
                        dayToWeekday={dayToWeekday}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>

              {/* Day 1 + cycle + holidays inline in review */}
              <div className="space-y-3 rounded-xl border border-border/60 bg-background/30 p-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium leading-none" htmlFor="review-day1">Day 1</label>
                  <input
                    id="review-day1"
                    type="date"
                    value={day1Starts}
                    onChange={(e) => setDay1Starts(e.target.value)}
                    className="h-7 flex-1 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                </div>

                <CycleEditor
                  cycleLength={cycleLength}
                  dayToWeekday={dayToWeekday}
                  weekendTimetables={weekendTimetables}
                  onCycleLengthChange={handleCycleLengthChange}
                  onDayToWeekdayChange={setDayToWeekday}
                  onWeekendTimetablesChange={handleWeekendTimetablesChange}
                />

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium leading-none">Holidays</span>
                    <Button variant="ghost" size="xs" onClick={addHoliday} className="h-5 gap-1 rounded-md text-caption">
                      <Plus className="h-2.5 w-2.5" />
                      Add
                    </Button>
                  </div>
                  {holidays.map((h) => (
                    <HolidayRow
                      key={h.id}
                      holiday={h}
                      onUpdate={(field, value) => updateHoliday(h.id, field, value)}
                      onDelete={() => deleteHoliday(h.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogBody>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none border-t px-5 py-3">
          {saved ? (
            <Button size="sm" onClick={handleClose} className="ml-auto gap-1.5 text-background btn-glow-primary">
              <Check className="h-4 w-4" />
              Done
            </Button>
          ) : step === "upload" ? (
            <>
              <div>
                {existingConfig.entries.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemove}
                    className="h-7 rounded-lg px-2 text-xs text-muted-foreground/80 hover:text-destructive focus-visible:text-destructive"
                  >
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
                  className="gap-1.5 text-background btn-glow-primary"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {loading ? "Analysing…" : "Parse with AI"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button size="sm" onClick={handleSave} disabled={approvedCount === 0} className="gap-1.5 text-background btn-glow-primary">
                <Check className="h-4 w-4" />
                Save {approvedCount} day{approvedCount !== 1 ? "s" : ""}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
