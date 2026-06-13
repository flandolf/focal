import { useState, useCallback, useMemo, useId } from "react"
import { Plus, Trash2, Copy, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getTimetableConfig, setTimetableConfig } from "@/lib/settings"
import { type TimetableEntry, type TimetableDayLabel, VCE_SUBJECTS } from "@/lib/types"
import { getTimetableEntriesForDay } from "@/lib/timetable"
import { cn, formatTime12 } from "@/lib/utils"

const PERIOD_NAME_SUGGESTIONS = [
  "Period 1", "Period 2", "Period 3", "Period 4", "Period 5", "Period 6", "Period 7",
  "Recess", "Lunch", "Homeroom", "Assembly", "Form", "Study", "Free",
]

const BREAK_LABELS = ["Recess", "Lunch", "Homeroom", "Assembly", "Form", "Free"] as const

const QUICK_TIMES = ["08:00", "09:00", "10:00", "12:00", "13:00", "14:00", "15:00", "16:00"] as const

// --- Period model ---

interface PeriodDraft {
  period: string
  subject: string
  location: string
  startTime: string
  endTime: string
  isBreak: boolean
}

function isBreakLabel(label: string) {
  return (BREAK_LABELS as readonly string[]).includes(label)
}

// --- Time picker popover ---

interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
}

function parseTimeInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase()
  const re = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/
  const m = re.exec(trimmed)
  if (!m) return null

  let h = parseInt(m[1], 10)
  const min = m[2] !== undefined ? parseInt(m[2], 10) : 0
  const meridian = m[3] as string | undefined

  if (meridian) {
    if (h < 1 || h > 12) return null
    if (meridian === "pm") h = h === 12 ? 12 : h + 12
    else h = h === 12 ? 0 : h
  } else {
    if (h > 23) return null
  }

  if (min > 59) return null

  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

function formatDisplayForInput(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const period = h >= 12 ? "PM" : "AM"
  const displayH = h % 12 === 0 ? 12 : h % 12
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`
}

function TimePicker({ value, onChange, label }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  // Draft tracks what the user is currently typing (raw, not parsed)
  const [draft, setDraft] = useState("")
  // Show formatted display when not actively editing
  const [isEditing, setIsEditing] = useState(false)
  const [h, m] = value.split(":").map(Number)
  const displayH = h % 12 === 0 ? 12 : h % 12

  const commit = useCallback(
    (hour: number, min: number) => {
      const hh = String(Math.max(0, Math.min(23, hour))).padStart(2, "0")
      const mm = String(Math.max(0, Math.min(59, min))).padStart(2, "0")
      onChange(`${hh}:${mm}`)
    },
    [onChange],
  )

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value)
    setIsEditing(true)
  }, [])

  const commitDraft = useCallback(
    (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return
      const parsed = parseTimeInput(trimmed)
      if (parsed) {
        onChange(parsed)
      }
      setDraft("")
      setIsEditing(false)
    },
    [onChange],
  )

  const handleBlur = useCallback(() => {
    if (draft) commitDraft(draft)
    else { setDraft(""); setIsEditing(false) }
  }, [draft, commitDraft])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        commitDraft(draft)
        e.currentTarget.blur()
      }
      if (e.key === "Escape") {
        setDraft("")
        setIsEditing(false)
        e.currentTarget.blur()
      }
    },
    [draft, commitDraft],
  )

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (newOpen) {
        setDraft("")
        setIsEditing(false)
      }
      setOpen(newOpen)
    },
    [],
  )

  const inputValue = isEditing ? draft : (draft || formatDisplayForInput(value))

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => { setDraft(formatDisplayForInput(value)); setIsEditing(true) }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        inputMode="numeric"
        aria-label={label}
        placeholder="9:00 AM"
        className="h-7 w-[5.5rem] rounded border border-input bg-background px-1.5 text-center text-xs font-medium tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded border border-input bg-background/60 text-xs text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground"
            aria-label={`Pick ${label ?? "time"}`}
          >
            <ChevronUp className="h-3 w-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          {/* Keyboard entry inside popup */}
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                commitDraft(draft)
                setOpen(false)
              }
            }}
            placeholder="Type time (e.g. 2:30 PM)"
            className="mb-2 h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            autoFocus
          />

          <div className="grid grid-cols-3 gap-2">
            {/* Hour column */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-caption font-medium text-muted-foreground">Hour</span>
              <button
                type="button"
                onClick={() => { const nv = (h + 1) % 24; commit(nv, m) }}
                className="flex h-7 w-full items-center justify-center rounded border border-input bg-background/60 text-xs hover:bg-accent/50"
                aria-label="Increment hour"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <div className="flex h-9 w-full items-center justify-center rounded border border-input bg-background font-medium tabular-nums text-sm">
                {String(displayH).padStart(2, "0")}
              </div>
              <button
                type="button"
                onClick={() => { const nv = (h - 1 + 24) % 24; commit(nv, m) }}
                className="flex h-7 w-full items-center justify-center rounded border border-input bg-background/60 text-xs hover:bg-accent/50"
                aria-label="Decrement hour"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>

            {/* Separator */}
            <div className="flex items-center justify-center pt-4">
              <span className="text-lg font-semibold text-muted-foreground">:</span>
            </div>

            {/* Minute column */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-caption font-medium text-muted-foreground">Min</span>
              <button
                type="button"
                onClick={() => { const nv = (m + 1) % 60; commit(h, nv) }}
                className="flex h-7 w-full items-center justify-center rounded border border-input bg-background/60 text-xs hover:bg-accent/50"
                aria-label="Increment minute"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <div className="flex h-9 w-full items-center justify-center rounded border border-input bg-background font-medium tabular-nums text-sm">
                {String(m).padStart(2, "0")}
              </div>
              <button
                type="button"
                onClick={() => { const nv = (m - 1 + 60) % 60; commit(h, nv) }}
                className="flex h-7 w-full items-center justify-center rounded border border-input bg-background/60 text-xs hover:bg-accent/50"
                aria-label="Decrement minute"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* AM/PM */}
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                const nv = h >= 12 ? h - 12 : h
                commit(nv, m)
              }}
              className={cn(
                "rounded border px-2 py-1 text-xs font-medium transition-colors",
                h < 12
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-input bg-background/60 text-muted-foreground hover:bg-accent/50",
              )}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => {
                const nv = h < 12 ? h + 12 : h
                commit(nv, m)
              }}
              className={cn(
                "rounded border px-2 py-1 text-xs font-medium transition-colors",
                h >= 12
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-input bg-background/60 text-muted-foreground hover:bg-accent/50",
              )}
            >
              PM
            </button>
          </div>

          {/* Quick presets — shown in 12h */}
          <div className="mt-2 grid grid-cols-4 gap-1">
            {QUICK_TIMES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  onChange(preset)
                  setOpen(false)
                }}
                className={cn(
                  "rounded border px-1 py-0.5 text-caption tabular-nums transition-colors",
                  value === preset
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-input bg-background/60 text-muted-foreground hover:bg-accent/50",
                )}
              >
                {formatTime12(preset)}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// --- Subject picker popover ---

interface SubjectPickerProps {
  value: string
  onChange: (value: string) => void
  subjects: { id: string; name: string; shortCode: string; color: string }[]
}

function SubjectPicker({ value, onChange, subjects }: SubjectPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [customValue, setCustomValue] = useState("")

  const selected = subjects.find((s) => s.id === value)
  const isCustomLabel = value !== "" && !selected

  const filtered = useMemo(() => {
    if (!search) return subjects
    const q = search.toLowerCase()
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.shortCode.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    )
  }, [subjects, search])

  // Reset custom input when popover opens
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next) setCustomValue(isCustomLabel ? value : "")
  }, [isCustomLabel, value])

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded border border-input bg-background px-2 text-xs outline-none hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {selected ? (
            <>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
              <span className="truncate">{selected.shortCode || selected.name}</span>
            </>
          ) : isCustomLabel ? (
            <>
              <span className="flex h-2 w-2 shrink-0 items-center justify-center rounded-full bg-muted-foreground/30 text-micro font-bold text-background">✎</span>
              <span className="truncate text-muted-foreground/80">{value}</span>
            </>
          ) : (
            <span className="text-muted-foreground/50">Subject</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <input
          type="text"
          value={open ? search : ""}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search subjects…"
          className="mb-1.5 h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          autoFocus
        />
        <ScrollArea className="max-h-36">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false) }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
              value === ""
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
            No subject
          </button>
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s.id); setOpen(false) }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                value === s.id ? "bg-primary/10 text-primary" : "hover:bg-accent/50",
              )}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="flex-1 truncate text-left">{s.name}</span>
              <span className="text-muted-foreground/50">{s.shortCode}</span>
            </button>
          ))}
          {filtered.length === 0 && search && (
            <p className="py-2 text-center text-xs text-muted-foreground">No subjects found</p>
          )}
        </div>
        </ScrollArea>

        {/* Custom label */}
        <div className="mt-1.5 border-t pt-1.5">
          <label className="mb-1 flex items-center gap-1.5 px-1 text-caption text-muted-foreground/60">
            <span className="text-caption">✎</span>
            Custom label
          </label>
          <input
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customValue.trim()) {
                onChange(customValue.trim())
                setOpen(false)
              }
            }}
            placeholder="e.g. Roll Call, Assembly…"
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {customValue.trim() && customValue.trim() !== value && (
            <button
              type="button"
              onClick={() => { onChange(customValue.trim()); setOpen(false) }}
              className="mt-1 flex w-full items-center gap-2 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              Set "{customValue.trim()}"
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// --- Period name input with autocomplete ---

interface PeriodNameInputProps {
  value: string
  onChange: (value: string) => void
  onPickBreak?: (label: string) => void
}

function PeriodNameInput({ value, onChange, onPickBreak }: PeriodNameInputProps) {
  const listId = useId()

  const allSuggestions = useMemo(() => {
    const seen = new Set<string>()
    return [...BREAK_LABELS, ...PERIOD_NAME_SUGGESTIONS].filter((s) => {
      if (seen.has(s)) return false
      seen.add(s)
      return true
    })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    onChange(next)
    if (onPickBreak && BREAK_LABELS.includes(next as typeof BREAK_LABELS[number])) {
      onPickBreak(next)
    }
  }

  return (
    <>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Period name"
        list={listId}
        className="h-7 w-full min-w-0 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <datalist id={listId}>
        {allSuggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  )
}

// --- Period row component ---

interface PeriodRowProps {
  period: PeriodDraft
  index: number
  total: number
  onUpdate: (field: keyof PeriodDraft, value: string | boolean) => void
  onMove: (direction: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
  invalid?: boolean
}

function PeriodRow({ period, index, total, onUpdate, onMove, onDuplicate, onDelete, subjects, invalid }: PeriodRowProps & { subjects: { id: string; name: string; shortCode: string; color: string }[] }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-colors",
        invalid
          ? "border-destructive/50 bg-destructive/5"
          : period.isBreak
            ? "border-amber-200/30 bg-amber-50/20 dark:border-amber-900/25 dark:bg-amber-950/15"
            : "border-border/60 bg-background/50",
      )}
    >
      <div className="flex items-start gap-2">
        {/* Index + reorder */}
        <div className="flex shrink-0 flex-col items-center gap-0 pt-0.5">
          <span className="text-caption font-medium text-muted-foreground/30">{index + 1}</span>
          <div className="flex flex-col gap-0">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              className="flex h-3 w-4 items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground disabled:opacity-15"
              aria-label="Move up"
            >
              <ChevronUp className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
              className="flex h-3 w-4 items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground disabled:opacity-15"
              aria-label="Move down"
            >
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>

        {/* Main fields grid */}
        <div className="flex flex-1 flex-col gap-1.5 min-w-0">
          <div className="grid grid-cols-[1fr_1fr_5rem] items-center gap-2">
            <PeriodNameInput
              value={period.period}
              onChange={(v) => onUpdate("period", v)}
              onPickBreak={(label) => onUpdate("isBreak", isBreakLabel(label))}
            />
            <SubjectPicker value={period.subject} onChange={(v) => onUpdate("subject", v)} subjects={subjects} />
            <input
              type="text"
              value={period.location}
              onChange={(e) => onUpdate("location", e.target.value)}
              placeholder="Room"
              className="h-7 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex items-center gap-2">
            <TimePicker value={period.startTime} onChange={(v) => onUpdate("startTime", v)} label="Start time" />
            <span className="text-xs text-muted-foreground/30">–</span>
            <TimePicker value={period.endTime} onChange={(v) => onUpdate("endTime", v)} label="End time" />

            <button
              type="button"
              onClick={() => onUpdate("isBreak", !period.isBreak)}
              className={cn(
                "ml-auto flex h-6 items-center gap-1 rounded-full border px-2 text-caption font-medium transition-colors",
                period.isBreak
                  ? "border-amber-400/40 bg-amber-100/50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/50 dark:text-amber-400"
                  : "border-input bg-background/60 text-muted-foreground/50 hover:border-amber-400/30 hover:text-amber-600 dark:hover:text-amber-400",
              )}
              aria-pressed={period.isBreak}
              title="Mark as break / recess / lunch"
            >
              {period.isBreak ? "Break" : "Break?"}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-0.5 pt-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-accent hover:text-muted-foreground"
            aria-label="Duplicate period"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label="Delete period"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Break hint */}
      {period.isBreak && !invalid && (
        <p className="mt-1.5 pl-7 text-caption text-amber-600/60 dark:text-amber-400/50">
          Marked as a break — subject and room are optional.
        </p>
      )}
      {invalid && (
        <p className="mt-1.5 pl-7 text-caption text-destructive">
          Start time must be before end time.
        </p>
      )}
    </div>
  )
}

// --- Main dialog ---

interface InlineEditDayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dayLabel: TimetableDayLabel
  customSubjects?: { id: string; name: string; shortCode: string; color: string }[]
}

export function InlineEditDayDialog({
  open,
  onOpenChange,
  dayLabel,
  customSubjects = [],
}: InlineEditDayDialogProps) {
  // Snapshot the config on mount only — the `key={dayLabel}` prop on the parent
  // forces a remount when the user switches days, so we never edit stale data.
  const [config] = useState(() => getTimetableConfig())

  const existingEntries = getTimetableEntriesForDay(dayLabel, config.entries)
  const existing = existingEntries[0]

  const getInitialPeriods = (): PeriodDraft[] =>
    existing?.periods.length
      ? existing.periods.map((p) => ({
          period: p.period,
          subject: p.subject,
          location: p.location ?? "",
          startTime: p.startTime,
          endTime: p.endTime,
          isBreak: isBreakLabel(p.period),
        }))
      : [{ period: "Period 1", subject: "", location: "", startTime: "09:00", endTime: "10:00", isBreak: false }]

  const [periods, setPeriods] = useState<PeriodDraft[]>(getInitialPeriods)

  const allSubjects = useMemo(() => [...VCE_SUBJECTS, ...customSubjects], [customSubjects])

  // Live validation — derive from current periods, not state, so it stays in sync.
  const invalidPeriodIndexes = useMemo(() => {
    const set = new Set<number>()
    periods.forEach((p, i) => {
      if (!p.startTime || !p.endTime) set.add(i)
      else if (p.startTime >= p.endTime) set.add(i)
    })
    return set
  }, [periods])
  const hasInvalidPeriods = invalidPeriodIndexes.size > 0

  const updatePeriod = useCallback((idx: number, field: keyof PeriodDraft, value: string | boolean) => {
    setPeriods((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)))
  }, [])

  const deletePeriod = useCallback((idx: number) => {
    setPeriods((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const duplicatePeriod = useCallback((idx: number) => {
    setPeriods((prev) => {
      const copy = { ...prev[idx] }
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)]
    })
  }, [])

  const movePeriod = useCallback((idx: number, direction: -1 | 1) => {
    setPeriods((prev) => {
      const target = idx + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }, [])

  const addPeriod = useCallback(() => {
    const parseTime = (t: string, addMins: number) => {
      const [h, m] = t.split(":").map(Number)
      const total = (h ?? 9) * 60 + (m ?? 0) + addMins
      return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
    }
    setPeriods((prev) => {
      const last = prev[prev.length - 1]
      const newStart = last ? parseTime(last.endTime, 10) : "09:00"
      const newEnd = last ? parseTime(last.endTime, 70) : "10:00"
      return [
        ...prev,
        { period: `Period ${prev.length + 1}`, subject: "", location: "", startTime: newStart, endTime: newEnd, isBreak: false },
      ]
    })
  }, [])

  const handleSave = useCallback(() => {
    if (hasInvalidPeriods) return
    if (periods.length === 0) {
      const filtered = (config.entries).filter((e) => e.dayLabel !== dayLabel)
      setTimetableConfig({ ...config, entries: filtered, enabled: filtered.length > 0 })
      window.dispatchEvent(new Event("focal-timetable-updated"))
      onOpenChange(false)
      return
    }

    const newEntry: TimetableEntry = {
      dayLabel,
      periods: periods.map((p) => ({
        period: p.period || (p.isBreak ? "Break" : "Period"),
        subject: p.subject,
        location: p.location || undefined,
        startTime: p.startTime,
        endTime: p.endTime,
      })),
    }

    const filtered = (config.entries).filter((e) => e.dayLabel !== dayLabel)
    const updated = [...filtered, newEntry]
    setTimetableConfig({ ...config, entries: updated, enabled: updated.length > 0 })
    window.dispatchEvent(new Event("focal-timetable-updated"))
    onOpenChange(false)
  }, [periods, dayLabel, config, onOpenChange, hasInvalidPeriods])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-8rem)] w-[calc(100vw-1rem)] max-w-xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-3.5 pt-4">
          <DialogTitle className="text-base">Edit Day {dayLabel}</DialogTitle>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5">

          {/* Periods header */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium leading-none">Periods</span>
            <Button variant="ghost" size="xs" onClick={addPeriod} className="h-6 gap-1 rounded-md text-xs">
              <Plus className="h-3 w-3" />
              Add period
            </Button>
          </div>

          {/* Empty state */}
          {periods.length === 0 && (
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/15 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground/60">No periods.</p>
              <p className="mt-1 text-xs text-muted-foreground/50">Add a period or save to remove this day.</p>
            </div>
          )}

          {/* Period rows */}
          <div className="space-y-2">
            {periods.map((period, idx) => (
              <PeriodRow
                key={idx}
                period={period}
                index={idx}
                total={periods.length}
                subjects={allSubjects}
                onUpdate={(field, value) => updatePeriod(idx, field, value)}
                onMove={(dir) => movePeriod(idx, dir)}
                onDuplicate={() => duplicatePeriod(idx)}
                onDelete={() => deletePeriod(idx)}
                invalid={invalidPeriodIndexes.has(idx)}
              />
            ))}
          </div>

          {hasInvalidPeriods && (
            <p className="text-xs text-destructive">
              Start time must be before end time for every period.
            </p>
          )}
        </DialogBody>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={hasInvalidPeriods}
            className="gap-1.5 text-background"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
