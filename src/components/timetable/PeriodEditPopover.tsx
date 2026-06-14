import { useState, useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  Trash2,
  MoveRight,
  Check,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { VCE_SUBJECTS, type TimetablePeriod, type TimetableDayLabel, type Subject } from "@/lib/types"
import { MOTION_DURATION, MOTION_EASE_SNAPPY } from "@/lib/motion"

interface PeriodEditPopoverProps {
  period: TimetablePeriod
  dayLabel: TimetableDayLabel
  cycleLength: number
  allDayLabels: TimetableDayLabel[]
  subjects: Subject[]
  onSave: (updated: TimetablePeriod) => void
  onDelete: () => void
  onMove: (toDay: TimetableDayLabel) => void
  children: React.ReactNode
}

export function PeriodEditPopover({
  period,
  dayLabel,
  allDayLabels,
  subjects,
  onSave,
  onDelete,
  onMove,
  children,
}: PeriodEditPopoverProps) {
  const reduceMotion = useReducedMotion() === true
  const [open, setOpen] = useState(false)

  const [periodName, setPeriodName] = useState(period.period)
  const [subject, setSubject] = useState(period.subject)
  const [location, setLocation] = useState(period.location ?? "")
  const [startTime, setStartTime] = useState(period.startTime)
  const [endTime, setEndTime] = useState(period.endTime)
  const [moveToDay, setMoveToDay] = useState<TimetableDayLabel | null>(null)

  // ponytail: form state resets are handled by remounting the inner
  // content via the `key` prop below when the period data or popover
  // open state changes. This avoids the cascading-render anti-pattern
  // of useEffect + setState, and the ref-during-render lint trap.
  // Ceiling: if a popover ever needs live validation that survives
  // period swaps, lift state out and use a controlled-form hook.

  const allSubjects = useMemo(() => [...VCE_SUBJECTS, ...subjects], [subjects])

  const selectedSubject = useMemo(
    () => allSubjects.find((s) => s.id === subject),
    [allSubjects, subject],
  )

  const isValid = periodName.trim() && startTime && endTime && startTime < endTime

  const handleSave = () => {
    if (!isValid) return
    if (moveToDay !== null && moveToDay !== dayLabel) {
      onMove(moveToDay)
    } else {
      onSave({
        period: periodName.trim(),
        subject,
        location: location || undefined,
        startTime,
        endTime,
      })
    }
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3 space-y-3"
        align="start"
        side="right"
        onKeyDown={handleKeyDown}
      >
        <motion.div
          key={`${open}-${period.period}-${period.startTime}-${period.endTime}-${period.subject}-${period.location ?? ""}`}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE_SNAPPY }}
          className="space-y-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">
              Edit period — Day {dayLabel}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Period name */}
          <div className="space-y-1">
            <label className="text-micro font-medium text-muted-foreground/80">
              Period name
            </label>
            <input
              type="text"
              value={periodName}
              onChange={(e) => setPeriodName(e.target.value)}
              placeholder="Period 1"
              autoFocus
              className="h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <label className="text-micro font-medium text-muted-foreground/80">
              Subject
            </label>
            <Select value={subject || "_none"} onValueChange={(v) => setSubject(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue placeholder="No subject">
                  {selectedSubject ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: selectedSubject.color }}
                      />
                      {selectedSubject.shortCode || selectedSubject.name}
                    </span>
                  ) : subject ? (
                    <span className="text-muted-foreground/80">{subject}</span>
                  ) : (
                    "No subject"
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">No subject</SelectItem>
                {allSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.shortCode || s.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-micro font-medium text-muted-foreground/80">
                Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={cn(
                  "h-7 w-full rounded border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                  startTime && endTime && startTime >= endTime
                    ? "border-destructive/50"
                    : "border-input",
                )}
              />
            </div>
            <div className="space-y-1">
              <label className="text-micro font-medium text-muted-foreground/80">
                End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={cn(
                  "h-7 w-full rounded border bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
                  startTime && endTime && startTime >= endTime
                    ? "border-destructive/50"
                    : "border-input",
                )}
              />
            </div>
          </div>
          {startTime && endTime && startTime >= endTime && (
            <p className="text-caption text-destructive">
              Start must be before end
            </p>
          )}

          {/* Location */}
          <div className="space-y-1">
            <label className="text-micro font-medium text-muted-foreground/80">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Room"
              className="h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>

          {/* Move to day */}
          <div className="space-y-1">
            <label className="flex items-center gap-1 text-micro font-medium text-muted-foreground/80">
              <MoveRight className="h-3 w-3" />
              Move to day
            </label>
            <Select
              value={moveToDay !== null ? String(moveToDay) : "_current"}
              onValueChange={(v) =>
                setMoveToDay(v === "_current" ? null : (Number(v)))
              }
            >
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue>
                  {moveToDay !== null
                    ? `Day ${moveToDay}`
                    : "Keep on this day"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_current">Keep on Day {dayLabel}</SelectItem>
                {allDayLabels
                  .filter((d) => d !== dayLabel)
                  .map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      Day {d}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                onDelete()
                setOpen(false)
              }}
              className="h-7 gap-1 text-xs text-muted-foreground/70 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                onClick={() => setOpen(false)}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={handleSave}
                disabled={!isValid}
                className="h-7 gap-1 text-xs"
              >
                <Check className="h-3 w-3" />
                Save
              </Button>
            </div>
          </div>

          <p className="text-caption text-muted-foreground/40 text-center">
            {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to save
          </p>
        </motion.div>
      </PopoverContent>
    </Popover>
  )
}
