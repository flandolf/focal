import { useState, useMemo, useEffect, useCallback, memo } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  Clock,
  Pencil,
  Trash2,
  AlertCircle,
  CalendarDays,
  ChevronDown,
  Edit3,
  MapPin,
  Pin,
  PinOff,
  Wand2,
  Sparkles,
  Sun,
  CheckCircle2,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, getSubjectById, formatTime12 } from "@/lib/utils"
import { getDayLabelForDate, getTimetableEntriesForDay, getCurrentPeriodInfo } from "@/lib/timetable"
import { getTimetableConfig, setTimetableConfig, setTimetableCurrentDayOverride } from "@/lib/settings"
import { TimetableDialog } from "@/components/TimetableDialog"
import { InlineEditDayDialog } from "@/components/timetable/InlineEditDayDialog"
import { TimetableAiEditor } from "@/components/timetable/TimetableAiEditor"
import { MOTION_DURATION, MOTION_EASE, staggerContainer, staggerItem } from "@/lib/motion"
import type { TimetableDayLabel, Subject, TimetablePeriod } from "@/lib/types"

// --- Helpers ---

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return h * 60 + m
}

function getCurrentPeriodProgress(period: TimetablePeriod, now: Date): number {
  const start = timeStringToMinutes(period.startTime)
  const end = timeStringToMinutes(period.endTime)
  if (end <= start) return 0
  const currentMin = now.getHours() * 60 + now.getMinutes()
  return Math.max(0, Math.min(100, ((currentMin - start) / (end - start)) * 100))
}

interface TimetableViewProps {
  customSubjects: Subject[]
}

// --- Live "now/next" hero card ---

function LiveStatusCard({
  current,
  next,
  periods,
  now,
  reduceMotion,
}: {
  current: TimetablePeriod | null
  next: TimetablePeriod | null
  periods: TimetablePeriod[]
  now: Date
  reduceMotion: boolean
}) {
  // No periods on the current day — a free day
  if (periods.length === 0) {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/30 px-3.5 py-2.5"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
          <Sparkles className="h-4 w-4 text-muted-foreground/60" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">No classes scheduled</p>
          <p className="text-xs text-muted-foreground/70">A free day — add periods from the edit menu.</p>
        </div>
      </motion.div>
    )
  }

  // All periods are in the past — school day is done
  if (!current && !next) {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">School day done</p>
          <p className="text-xs text-muted-foreground/70">All {periods.length} period{periods.length !== 1 ? "s" : ""} complete — see you tomorrow.</p>
        </div>
      </motion.div>
    )
  }

  // Period in progress
  if (current) {
    const subject = getSubjectById(current.subject)
    const progress = getCurrentPeriodProgress(current, now)
    const endMin = timeStringToMinutes(current.endTime)
    const remaining = Math.max(0, endMin - (now.getHours() * 60 + now.getMinutes()))

    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-primary/[0.04] to-transparent px-3.5 py-2.5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-micro font-bold uppercase tracking-[0.1em] text-primary">
                Happening now
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {subject && (
                <div
                  className="h-4 w-[2px] rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
              )}
              <h3
                className="truncate font-heading text-base font-semibold"
                style={subject ? { color: subject.color } : undefined}
              >
                {subject?.name ?? current.subject}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatTime12(current.startTime)} – {formatTime12(current.endTime)}
              </span>
              {current.location && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />
                    {current.location}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-heading text-xl font-semibold tabular-nums text-primary">
              {remaining}
            </div>
            <div className="text-micro font-medium uppercase tracking-wider text-muted-foreground/60">
              min left
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/10">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: MOTION_DURATION.page, ease: MOTION_EASE }}
          />
        </div>

        {next && <NextUpHint next={next} reduceMotion={reduceMotion} />}
      </motion.div>
    )
  }

  // No period in progress, but a next one
  if (next) {
    const subject = getSubjectById(next.subject)
    const startMin = timeStringToMinutes(next.startTime)
    const currentMin = now.getHours() * 60 + now.getMinutes()
    const minutesUntil = Math.max(0, startMin - currentMin)

    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-micro font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
            Up next
          </p>
          <div className="mt-px flex items-center gap-1">
            {subject && (
              <span
                className="h-2 w-[2px] shrink-0 rounded-full"
                style={{ backgroundColor: subject.color }}
              />
            )}
            <p
              className="truncate text-xs font-semibold"
              style={subject ? { color: subject.color } : undefined}
            >
              {subject?.name ?? next.subject}
            </p>
            <span className="text-micro text-muted-foreground/70 tabular-nums">
              at {formatTime12(next.startTime)}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-heading text-base font-semibold tabular-nums">{minutesUntil}</div>
          <div className="text-micro font-medium uppercase tracking-wider text-muted-foreground/60">
            min
          </div>
        </div>
      </motion.div>
    )
  }

  return null
}

function NextUpHint({ next, reduceMotion }: { next: TimetablePeriod; reduceMotion: boolean }) {
  const subject = getSubjectById(next.subject)
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE, delay: 0.12 }}
      className="mt-2 flex items-center gap-1.5 border-t border-primary/15 pt-1.5"
    >
      <span className="text-micro font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
        Then
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {subject && (
          <span
            className="h-2 w-[2px] shrink-0 rounded-full"
            style={{ backgroundColor: subject.color }}
          />
        )}
        <span className="truncate text-micro font-medium text-muted-foreground">
          {subject?.name ?? next.subject}
        </span>
        {next.location && (
          <span className="hidden text-micro text-muted-foreground/50 sm:inline">· {next.location}</span>
        )}
      </div>
      <span className="shrink-0 text-micro tabular-nums text-muted-foreground/70">
        {formatTime12(next.startTime)}
      </span>
    </motion.div>
  )
}

// --- Period row ---

function PeriodRow({
  period,
  subject,
  isCurrentPeriod,
  isNextPeriod,
  reduceMotion,
  onEdit,
  onDelete,
}: {
  period: TimetablePeriod
  subject: ReturnType<typeof getSubjectById>
  isCurrentPeriod: boolean
  isNextPeriod: boolean
  reduceMotion: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const displayName = subject ? subject.name : period.subject || period.period
  return (
    <motion.div
      className={cn(
        "group/period relative flex items-start gap-2 py-1 transition-colors",
        subject ? "hover:bg-accent/30" : "opacity-60",
        isCurrentPeriod && "bg-primary/[0.07]",
      )}
    >
      {/* Subject color accent bar */}
      {subject && (
        <div
          className={cn(
            "absolute left-0 top-1 bottom-1 w-[2px] rounded-full",
          )}
          style={{ backgroundColor: subject.color }}
        />
      )}

      {/* Time stack (start above end) */}
        <div className="flex shrink-0 flex-col items-start pl-2 w-[2.5rem]">
        <span
          className={cn(
            "text-xs font-semibold leading-none tabular-nums",
            isCurrentPeriod ? "text-foreground" : "text-foreground/90",
          )}
        >
          {formatTime12(period.startTime)}
        </span>
        <span className="mt-px text-micro tabular-nums text-muted-foreground/55">
          {formatTime12(period.endTime)}
        </span>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-0.5">
          <span
            className={cn(
              "truncate text-xs",
              isCurrentPeriod ? "font-semibold" : "font-medium",
            )}
            style={subject ? { color: subject.color } : undefined}
          >
            {displayName}
          </span>
          {isCurrentPeriod && (
            <motion.span
              initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: MOTION_DURATION.normal, ease: MOTION_EASE }}
              className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-0.5 py-px text-micro font-bold uppercase tracking-wider text-primary"
            >
              <span className="h-0.5 w-0.5 rounded-full bg-primary animate-pulse" />
              Now
            </motion.span>
          )}
          {isNextPeriod && !isCurrentPeriod && (
            <span className="text-micro font-bold uppercase tracking-wider text-muted-foreground/40">
              Next
            </span>
          )}
        </div>
        {period.location && (
          <div className="flex items-center gap-1 text-micro text-muted-foreground/60">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{period.location}</span>
          </div>
        )}
      </div>

      {/* Hover-revealed actions */}
      <div
        className="pointer-events-none absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-px rounded-md bg-background/80 p-px opacity-0 ring-1 ring-border/30 transition-all duration-150 group-hover/period:pointer-events-auto group-hover/period:opacity-100 group-focus-within/period:pointer-events-auto group-focus-within/period:opacity-100"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={`Edit ${displayName}`}
          title="Edit period"
        >
          <Pencil className="h-2 w-2" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          aria-label={`Delete ${displayName}`}
          title="Delete period"
        >
          <Trash2 className="h-2 w-2" />
        </button>
      </div>
    </motion.div>
  )
}

// --- Day card header ---

function DayHeader({
  dayLabel,
  isToday,
  isDayOverridden,
  onEdit,
}: {
  dayLabel: TimetableDayLabel
  isToday: boolean
  isDayOverridden: boolean
  onEdit: () => void
}) {
  return (
    <div className="mb-0.5 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded text-xs font-bold tabular-nums transition-colors",
            isToday
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground group-hover/day:bg-muted/80",
          )}
        >
          {dayLabel}
        </span>
        <span
          className={cn(
            "text-xs font-semibold",
            isToday ? "text-primary" : "text-foreground/80",
          )}
        >
          Day {dayLabel}
        </span>
        {isToday && isDayOverridden && (
          <Pin className="h-2.5 w-2.5 text-primary" aria-label="Pinned" />
        )}
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 transition-all hover:bg-accent hover:text-foreground"
        aria-label={`Edit Day ${dayLabel}`}
      >
        <Edit3 className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}

// --- Main view ---

export const TimetableView = memo(function TimetableView({ customSubjects }: TimetableViewProps) {
  const [config, setConfig] = useState(getTimetableConfig)
  const [aiEditOpen, setAiEditOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editDayOpen, setEditDayOpen] = useState(false)
  const [editDayLabel, setEditDayLabel] = useState<TimetableDayLabel>(1)
  const [dayPickerOpen, setDayPickerOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const reduceMotion = useReducedMotion() === true

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const days = useMemo(() => {
    if (!config.enabled || config.entries.length === 0) return []
    return Array.from({ length: 10 }, (_, i) => (i + 1) as TimetableDayLabel).map((dayLabel) => {
      const entries = getTimetableEntriesForDay(dayLabel, config.entries)
      return { dayLabel, entries }
    })
  }, [config])

  const autoDayLabel = useMemo(() => {
    if (!config.enabled || !config.day1Starts) return null
    return getDayLabelForDate(now, config.day1Starts, config.holidays)
  }, [config, now])

  const currentDayLabel = useMemo<TimetableDayLabel | null>(() => {
    if (!config.enabled) return null
    if (config.currentDayOverride != null) {
      return config.currentDayOverride
    }
    return autoDayLabel
  }, [config, autoDayLabel])

  const todayPeriods = useMemo(() => {
    if (currentDayLabel === null) return []
    const entries = getTimetableEntriesForDay(currentDayLabel, config.entries)
    return entries.flatMap((e) => e.periods).sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [currentDayLabel, config])

  const todayPeriodInfo = useMemo(
    () => getCurrentPeriodInfo(todayPeriods, now),
    [todayPeriods, now],
  )

  const isDayOverridden = config.currentDayOverride != null

  const handleSetDay = useCallback((day: TimetableDayLabel) => {
    setTimetableCurrentDayOverride(day)
    setConfig(getTimetableConfig())
    setDayPickerOpen(false)
  }, [])

  const handleResetDay = useCallback(() => {
    setTimetableCurrentDayOverride(null)
    setConfig(getTimetableConfig())
    setDayPickerOpen(false)
  }, [])

  const handleDeletePeriod = useCallback(
    (dayLabel: TimetableDayLabel, entryIdx: number, periodIdx: number) => {
      // Find the Nth entry for this day (entries with the same dayLabel are rare but possible)
      const dayEntryIndices = config.entries
        .map((e, i) => (e.dayLabel === dayLabel ? i : -1))
        .filter((i) => i !== -1)
      const globalEntryIdx = dayEntryIndices[entryIdx]
      if (globalEntryIdx === undefined) return

      const entry = config.entries[globalEntryIdx]
      const newPeriods = entry.periods.filter((_, i) => i !== periodIdx)

      const newEntries =
        newPeriods.length === 0
          ? config.entries.filter((_, i) => i !== globalEntryIdx)
          : config.entries.map((e, i) =>
              i === globalEntryIdx ? { ...e, periods: newPeriods } : e,
            )

      const updatedConfig = {
        ...config,
        entries: newEntries,
        enabled: newEntries.length > 0,
      }
      setTimetableConfig(updatedConfig)
      window.dispatchEvent(new Event("focal-timetable-updated"))
      setConfig(getTimetableConfig())
    },
    [config],
  )

  const refreshConfig = useCallback(() => setConfig(getTimetableConfig()), [])

  const showDayPicker = config.enabled && !!config.day1Starts
  const showLiveStatus = showDayPicker && currentDayLabel !== null

  return (
    <>
      <ScrollArea className="h-full">
        <div className="px-4 py-4 min-[1200px]:px-8 min-[1200px]:py-4 space-y-3">
          {/* Header */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
            className="flex flex-wrap items-start justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15">
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-sm font-semibold leading-tight">Timetable</h2>
                {showDayPicker ? (
                  <p className="mt-px flex items-center text-micro text-muted-foreground">
                    <Popover open={dayPickerOpen} onOpenChange={setDayPickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring",
                            isDayOverridden && "text-primary",
                          )}
                          aria-label="Set current day"
                        >
                          <span className="font-medium">
                            {currentDayLabel !== null ? `Day ${currentDayLabel}` : "No day"}
                          </span>
                          {isDayOverridden ? (
                            <Pin className="h-3 w-3 fill-primary" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-muted-foreground/50" aria-hidden />
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="px-1.5 pb-1.5 pt-0.5">
                          <p className="text-xs font-medium leading-none">Set current day</p>
                          <p className="mt-0.5 text-xs text-muted-foreground/70">
                            {isDayOverridden
                              ? "Pinned to a specific cycle day."
                              : autoDayLabel === null
                                ? "Pick a day to override the holiday auto-detection."
                                : "Pick any day to pin the timetable to it."}
                          </p>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as TimetableDayLabel[]).map((d) => {
                            const isSelected = currentDayLabel === d
                            const isAuto = autoDayLabel === d
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => handleSetDay(d)}
                                className={cn(
                                  "relative flex h-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-input bg-background/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                )}
                                aria-pressed={isSelected}
                              >
                                {d}
                                {isAuto && (
                                  <span
                                    className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-muted-foreground/40"
                                    aria-hidden
                                  />
                                )}
                              </button>
                            )
                          })}
                        </div>
                        {isDayOverridden && (
                          <button
                            type="button"
                            onClick={handleResetDay}
                            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background/60 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                          >
                            <PinOff className="h-3 w-3" />
                            Reset to auto
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>
                    {currentDayLabel !== null && todayPeriods.length > 0 && (
                      <>
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        {todayPeriods.length} period{todayPeriods.length !== 1 ? "s" : ""}
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-px text-micro text-muted-foreground">10-day cycle</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 rounded-lg h-7 px-2.5 text-xs"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 rounded-lg h-7 px-2.5 text-xs"
                onClick={() => setAiEditOpen(true)}
              >
                <Wand2 className="h-3 w-3" />
                AI
              </Button>
            </div>
          </motion.div>

          {/* Not configured state */}
          {!config.enabled || config.entries.length === 0 ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
                className="flex flex-col items-center justify-center py-10 text-center"
              >
                <motion.div
                  animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: 4, repeat: Infinity, ease: "easeInOut" }
                  }
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/30"
                >
                  <Sun className="h-5 w-5 text-muted-foreground/35" />
                </motion.div>
                <p className="mb-1 text-xs font-medium">No timetable configured</p>
                <p className="mb-3 max-w-xs text-micro text-muted-foreground">
                  Upload a photo of your school timetable and AI will parse it into a native 10-day cycle.
                </p>
                <Button size="sm" className="gap-1 rounded-lg h-7 px-2.5 text-xs" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Set up Timetable
              </Button>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {showLiveStatus && (
                <motion.div
                  key="live-status"
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: MOTION_DURATION.fast } }}
                  transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
                >
                  <LiveStatusCard
                    current={todayPeriodInfo.current}
                    next={todayPeriodInfo.next}
                    periods={todayPeriods}
                    now={now}
                    reduceMotion={reduceMotion}
                  />
                </motion.div>
              )}

              {/* 10-day grid */}
              <motion.div
                key="day-grid"
                className="grid grid-cols-1 gap-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-5"
                variants={staggerContainer(0.04, 0.08)}
                initial="initial"
                animate="animate"
              >
                {days.map(({ dayLabel, entries }) => {
                  const isToday = currentDayLabel === dayLabel
                  return (
                    <motion.div
                      key={dayLabel}
                      variants={staggerItem}
                      className={cn(
                        "group/day relative p-1",
                        isToday ? "bg-primary/[0.04] rounded-md" : "",
                      )}
                    >
                      {/* Today left stripe */}
                      {isToday && (
                        <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-primary" />
                      )}

                      <DayHeader
                        dayLabel={dayLabel}
                        isToday={isToday}
                        isDayOverridden={isDayOverridden}
                        onEdit={() => {
                          setEditDayLabel(dayLabel)
                          setEditDayOpen(true)
                        }}
                      />

                      {/* Periods */}
                      {entries.length > 0 ? (
                        <div className="space-y-px">
                          {entries.map((entry, entryIdx) =>
                            entry.periods.map((period, periodIdx) => {
                              const subject = getSubjectById(period.subject)
                              const isCurrentPeriod =
                                isToday &&
                                todayPeriodInfo.current?.startTime === period.startTime &&
                                todayPeriodInfo.current?.subject === period.subject
                              const isNextPeriod =
                                isToday &&
                                !isCurrentPeriod &&
                                todayPeriodInfo.next?.startTime === period.startTime &&
                                todayPeriodInfo.next?.subject === period.subject
                              return (
                                <PeriodRow
                                  key={`${entryIdx}-${periodIdx}`}
                                  period={period}
                                  subject={subject}
                                  isCurrentPeriod={isCurrentPeriod}
                                  isNextPeriod={isNextPeriod}
                                  reduceMotion={reduceMotion}
                                  onEdit={() => {
                                    setEditDayLabel(dayLabel)
                                    setEditDayOpen(true)
                                  }}
                                  onDelete={() =>
                                    handleDeletePeriod(dayLabel, entryIdx, periodIdx)
                                  }
                                />
                              )
                            }),
                          )}
                        </div>
                      ) : (
                        <p className="py-1 text-center text-micro text-muted-foreground/40">
                          No classes
                        </p>
                      )}
                    </motion.div>
                  )
                })}
              </motion.div>

              {/* Holiday notice */}
              {config.holidays.length > 0 && (
                <motion.div
                  key="holiday-notice"
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: MOTION_DURATION.medium,
                    ease: MOTION_EASE,
                    delay: reduceMotion ? 0 : 0.2,
                  }}
                  className="flex items-center gap-2 rounded-lg border border-amber-200/40 bg-amber-50/40 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
                    <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {config.holidays.length} holiday period
                    {config.holidays.length !== 1 ? "s" : ""} active
                    <span className="text-amber-700/60 dark:text-amber-300/60">
                      {" "}
                      — timetable pauses during these dates
                    </span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      <TimetableDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) refreshConfig()
        }}
        customSubjects={customSubjects}
      />

      <InlineEditDayDialog
        key={editDayLabel}
        open={editDayOpen}
        onOpenChange={(open) => {
          setEditDayOpen(open)
          if (!open) refreshConfig()
        }}
        dayLabel={editDayLabel}
        customSubjects={customSubjects}
      />

      <TimetableAiEditor
        open={aiEditOpen}
        onOpenChange={(open) => {
          setAiEditOpen(open)
          if (!open) refreshConfig()
        }}
        customSubjects={customSubjects}
      />
    </>
  )
})
