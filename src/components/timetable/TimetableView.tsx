import { useState, useMemo, useEffect } from "react"
import { Clock, Pencil, AlertCircle, CalendarDays, Edit3, MapPin, Wand2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { cn, getSubjectById, formatTime12 } from "@/lib/utils"
import { getDayLabelForDate, getTimetableEntriesForDay, getCurrentPeriodInfo } from "@/lib/timetable"
import { getTimetableConfig } from "@/lib/settings"
import { TimetableDialog } from "@/components/TimetableDialog"
import { InlineEditDayDialog } from "@/components/timetable/InlineEditDayDialog"
import { TimetableAiEditor } from "@/components/timetable/TimetableAiEditor"
import type { TimetableDayLabel, Subject } from "@/lib/types"

interface TimetableViewProps {
  customSubjects: Subject[]
}

export function TimetableView({ customSubjects }: TimetableViewProps) {
  const [config, setConfig] = useState(getTimetableConfig)
  const [aiEditOpen, setAiEditOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editDayOpen, setEditDayOpen] = useState(false)
  const [editDayLabel, setEditDayLabel] = useState<TimetableDayLabel>(1)
  const [now, setNow] = useState(() => new Date())

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

  const currentDayLabel = useMemo(() => {
    if (!config.enabled || !config.day1Starts) return null
    return getDayLabelForDate(new Date(), config.day1Starts, config.holidays)
  }, [config])

  const todayPeriods = useMemo(() => {
    if (currentDayLabel === null) return []
    const entries = getTimetableEntriesForDay(currentDayLabel, config.entries)
    return entries.flatMap((e) => e.periods).sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [currentDayLabel, config])

  const todayPeriodInfo = useMemo(() => getCurrentPeriodInfo(todayPeriods, now), [todayPeriods, now])


  return (
    <>
      <ScrollArea className="h-full">
        <div className="px-4 py-5 min-[1200px]:px-8 min-[1200px]:py-6">
          {/* Header */}
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-semibold">Timetable</h2>
                {currentDayLabel !== null && config.enabled && (
                  <p className="text-caption text-muted-foreground">
                    Day {currentDayLabel}
                    {todayPeriods.length > 0 && (
                      <>
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        {todayPeriods.length} period{todayPeriods.length !== 1 ? "s" : ""}
                      </>
                    )}
                    {todayPeriodInfo.next && (
                      <>
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        Next: {getSubjectById(todayPeriodInfo.next.subject)?.name ?? todayPeriodInfo.next.subject}{" "}
                        <span className="tabular-nums">{todayPeriodInfo.next.startTime}</span>
                      </>
                    )}
                    {todayPeriodInfo.current && (
                      <>
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        <span className="inline-flex items-center gap-1 text-primary">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          Now
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Timetable
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => setAiEditOpen(true)}
              >
                <Wand2 className="h-3.5 w-3.5" />
                AI Editor
              </Button>
            </div>
          </div>

          {/* Not configured state */}
          {!config.enabled || config.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30">
                <Clock className="h-7 w-7 text-muted-foreground/30" />
              </div>
              <p className="mb-1 text-sm font-medium">No timetable configured</p>
              <p className="mb-4 max-w-xs text-caption text-muted-foreground">
                Upload a photo of your school timetable and AI will parse it into a native 10-day cycle.
              </p>
              <Button
                size="sm"
                className="gap-1.5 rounded-xl"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
                Set up Timetable
              </Button>
            </div>
          ) : (
            <>
              {/* 10-day grid */}
              <div className="grid grid-cols-1 gap-1 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-5">
                {days.map(({ dayLabel, entries }) => {
                  const isToday = currentDayLabel === dayLabel
                  return (
                    <div
                      key={dayLabel}
                      className={cn(
                        "rounded-2xl border p-3 transition-colors",
                        isToday
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/60 bg-muted/18",
                      )}
                    >
                      {/* Day header */}
                      <div className="mb-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {isToday && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                          <span className={cn(
                            "text-sm font-semibold",
                            isToday ? "text-primary" : "",
                          )}>
                            Day {dayLabel}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setEditDayLabel(dayLabel)
                            setEditDayOpen(true)
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
                          aria-label={`Edit Day ${dayLabel}`}
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>

                      </div>

                      {/* Periods */}
                      {entries.length > 0 ? (
                        <div className="space-y-1">
                          {entries.flatMap((entry) => entry.periods).map((period, idx) => {
                            const subject = getSubjectById(period.subject)
                            const isCurrentPeriod = isToday
                              && todayPeriodInfo.current?.startTime === period.startTime
                              && todayPeriodInfo.current?.subject === period.subject
                            const isNextPeriod = isToday
                              && !isCurrentPeriod
                              && todayPeriodInfo.next?.startTime === period.startTime
                              && todayPeriodInfo.next?.subject === period.subject
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "relative flex items-start gap-2 rounded-lg px-2 py-1.5",
                                  subject ? "bg-background/70" : "bg-background/40",
                                  isCurrentPeriod && "bg-primary/[0.06] ring-1 ring-primary/15",
                                )}
                              >
                                {/* Subject color accent bar */}
                                {subject && (
                                  <div
                                    className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                                    style={{ backgroundColor: subject.color }}
                                  />
                                )}

                                {/* Current period live dot */}
                                {isCurrentPeriod && (
                                  <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
                                )}

                                {/* Time */}
                                        <span className="text-sm font-medium text-muted-foreground w-12 shrink-0 tabular-nums mt-0.5">
                                  {formatTime12(period.startTime)}
                                </span>

                                {/* Subject details */}
                                <div className="flex min-w-0 flex-col gap-0">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="text-sm truncate"
                                      style={{ color: subject ? subject.color : undefined }}
                                    >
                                      {subject ? subject.name : period.subject}
                                    </span>
                                    {isNextPeriod && !isCurrentPeriod && (
                                      <span className="text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
                                        Up next
                                      </span>
                                    )}
                                  </div>

                                  {/* Location */}
                                  {period.location && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/40 mt-0.5">
                                      <MapPin className="h-2.5 w-2.5 shrink-0" />
                                      <span className="truncate">{period.location}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground/60">—</p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Holiday notice */}
              {config.holidays.length > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200/40 bg-amber-50/30 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {config.holidays.length} holiday period{config.holidays.length !== 1 ? "s" : ""} active — timetable pauses during these dates.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      <TimetableDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) setConfig(getTimetableConfig())
        }}
        customSubjects={customSubjects}
      />

      <InlineEditDayDialog
        key={editDayLabel}
        open={editDayOpen}
        onOpenChange={(open) => {
          setEditDayOpen(open)
          if (!open) setConfig(getTimetableConfig())
        }}
        dayLabel={editDayLabel}
        customSubjects={customSubjects}
      />

      <TimetableAiEditor
        open={aiEditOpen}
        onOpenChange={(open) => {
          setAiEditOpen(open)
          if (!open) setConfig(getTimetableConfig())
        }}
        customSubjects={customSubjects}
      />
    </>
  )
}