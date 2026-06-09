import { useState, useCallback, useMemo } from "react"
import { format, isSameMonth, isToday, parseISO, differenceInDays } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getSubjectById, getEventTypeInfo, cn } from "@/lib/utils"
import { getCalendarSessionIndicators } from "@/lib/groupSessions"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"

const CALENDAR_FALLBACK_COLOR = "var(--muted-foreground)"

interface CalendarGridProps {
  currentMonth: Date
  calendarView: "month" | "week"
  selectedDate: string | null
  deadlinesByDate: Record<string, Project[]>
  sessionsByDate: Record<string, StudySession[]>
  eventsByDate: Record<string, CalendarEvent[]>
  events: CalendarEvent[]
  projects: Project[]
  onSetCalendarView: (view: "month" | "week") => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onSelectDate: (dateKey: string) => void
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: StudySession) => void
  onSelectEvent: (event: CalendarEvent) => void
  onMoveEvent?: (eventId: string, newStartTime: string, newEndTime?: string) => void
}

export function CalendarGrid({
  currentMonth,
  calendarView,
  selectedDate,
  deadlinesByDate,
  sessionsByDate,
  eventsByDate,
  events,
  projects,
  onSetCalendarView,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelectDate,
  onSelectProject,
  onSelectSession: _onSelectSession,
  onSelectEvent,
  onMoveEvent,
}: CalendarGridProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const monthStart = useMemo(() => {
    const d = new Date(currentMonth)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  }, [currentMonth])

  const monthEnd = useMemo(() => {
    const d = new Date(currentMonth)
    d.setMonth(d.getMonth() + 1, 0)
    d.setHours(23, 59, 59, 999)
    return d
  }, [currentMonth])

  const daysInMonth = useMemo(() => {
    const days: Date[] = []
    const current = new Date(monthStart)
    while (current <= monthEnd) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return days
  }, [monthStart, monthEnd])

  const calendarPad = useMemo(() => {
    return Array.from({ length: monthStart.getDay() }, (_, i) => i)
  }, [monthStart])

  const weekStart = useMemo(() => {
    const date = new Date(currentMonth)
    const start = new Date(date)
    start.setDate(start.getDate() - start.getDay())
    start.setHours(0, 0, 0, 0)
    return start
  }, [currentMonth])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      return date
    })
  }, [weekStart])

  const multiDayEvents = useMemo(() => {
    return events.filter((event) => {
      if (!event.endTime) return false
      const startKey = format(parseISO(event.startTime), "yyyy-MM-dd")
      const endKey = format(parseISO(event.endTime), "yyyy-MM-dd")
      return startKey !== endKey
    })
  }, [events])

  const getMultiDayForDate = useCallback((dateKey: string): CalendarEvent[] => {
    return multiDayEvents.filter((event) => {
      const startKey = format(parseISO(event.startTime), "yyyy-MM-dd")
      const endKey = format(parseISO(event.endTime!), "yyyy-MM-dd")
      return dateKey >= startKey && dateKey <= endKey
    })
  }, [multiDayEvents])

  const getMultiDayPosition = useCallback((event: CalendarEvent, dateKey: string): "start" | "middle" | "end" | "alone" => {
    const startKey = format(parseISO(event.startTime), "yyyy-MM-dd")
    const endKey = format(parseISO(event.endTime!), "yyyy-MM-dd")
    const isStart = dateKey === startKey
    const isEnd = dateKey === endKey
    if (isStart && isEnd) return "alone"
    if (isStart) return "start"
    if (isEnd) return "end"
    return "middle"
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, eventId: string, sourceDateKey: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ eventId, sourceDateKey }))
    e.dataTransfer.effectAllowed = "move"
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverDate(dateKey)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetDateKey: string) => {
    e.preventDefault()
    setDragOverDate(null)
    if (!onMoveEvent) return
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain")) as { eventId: string; sourceDateKey: string }
      if (!data.eventId) return
      const event = events.find((ev) => ev.id === data.eventId)
      if (!event) return
      if (data.sourceDateKey === targetDateKey) return

      const oldStart = parseISO(event.startTime)
      const [year, month, day] = targetDateKey.split("-").map(Number)
      const newStart = new Date(oldStart)
      newStart.setFullYear(year, month - 1, day)
      const delta = newStart.getTime() - oldStart.getTime()

      const newStartTime = newStart.toISOString()
      let newEndTime: string | undefined
      if (event.endTime) {
        newEndTime = new Date(new Date(event.endTime).getTime() + delta).toISOString()
      }
      onMoveEvent(data.eventId, newStartTime, newEndTime)
    } catch {
      // invalid drag data, ignore
    }
  }, [onMoveEvent, events])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Assessment Calendar</h2>
          <p className="text-caption text-muted-foreground">Deadlines, events, and planned sessions share the same grid.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-xl border border-border/70 bg-background/55 p-0.5">
            <button
              type="button"
              onClick={() => onSetCalendarView("month")}
              className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                calendarView === "month"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => onSetCalendarView("week")}
              className={cn(
                "rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                calendarView === "week"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Week
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={onPrevMonth} className="h-8 w-8 rounded-xl p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToday}
            className={cn(
              "h-8 rounded-xl px-3 text-xs",
              isSameMonth(currentMonth, new Date()) && "bg-accent text-accent-foreground"
            )}
          >
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={onNextMonth} className="h-8 w-8 rounded-xl p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {calendarView === "month" && (
        <div className="grid grid-cols-7 gap-0 rounded-2xl border border-border/35 bg-background/16">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="flex h-7 items-center justify-center border-b border-border/15 text-micro font-medium uppercase text-muted-foreground/70">
              {day}
            </div>
          ))}
          {calendarPad.map((i) => (
            <div key={`pad-${i}`} className="h-28 border-b border-border/15" />
          ))}
          {daysInMonth.map((date) => {
            const dateKey = format(date, "yyyy-MM-dd")
            const dayDeadlines = deadlinesByDate[dateKey] || []
            const daySessions = sessionsByDate[dateKey] || []
            const dayEvents = eventsByDate[dateKey] || []
            const isCurrentMonth = isSameMonth(date, currentMonth)
            const isTodayDate = isToday(date)
            const isDragOver = dragOverDate === dateKey
            const dayMultiDayEvents = getMultiDayForDate(dateKey)
            const multiDayEventIds = new Set(dayMultiDayEvents.map((e) => e.id))
            const sessionIndicators = getCalendarSessionIndicators(daySessions, projects)
            const allItems = [
              ...dayDeadlines.map((p) => ({ type: "deadline" as const, name: p.name, color: getSubjectById(p.subjectId)?.color ?? CALENDAR_FALLBACK_COLOR, kind: "deadline" as const, id: p.id })),
              ...sessionIndicators.map((ind) => ({ type: "session" as const, name: ind.count > 1 ? `${ind.shortCode} · ${ind.count}` : ind.shortCode, color: ind.color, kind: "session" as const, id: ind.subjectId })),
              ...dayEvents.map((e) => ({ type: "event" as const, name: e.title, color: getEventTypeInfo(e.eventType).color, kind: "event" as const, id: e.id, event: e })),
            ]
            const regularItems = allItems.filter((item) => !multiDayEventIds.has(item.id))
            const visibleItems = regularItems.slice(0, 3)
            const overflow = regularItems.length - 3

            return (
              <button
                type="button"
                key={dateKey}
                onClick={() => onSelectDate(dateKey)}
                onDragOver={(e) => handleDragOver(e, dateKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, dateKey)}
                className={cn(
                  "relative flex h-28 w-full flex-col items-start justify-start border-b border-border/15 p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                  selectedDate === dateKey
                    ? "bg-primary/8 shadow-[inset_0_0_0_1px_var(--primary)]"
                    : "bg-background/16 hover:bg-accent/24",
                  isTodayDate && selectedDate !== dateKey && "bg-primary/5",
                  !isCurrentMonth && "opacity-30",
                  isDragOver && "bg-accent/30"
                )}
              >
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-lg text-micro font-semibold leading-none",
                  isTodayDate && "bg-primary/12",
                  isTodayDate ? "text-primary" : "text-foreground/80"
                )}>
                  {date.getDate()}
                </div>
                {dayMultiDayEvents.length > 0 && (
                  <div className="mt-0.5 w-[calc(100%+0.75rem)] -mx-1.5 space-y-px">
                    {dayMultiDayEvents.map((event) => {
                      const position = getMultiDayPosition(event, dateKey)
                      const color = getEventTypeInfo(event.eventType).color
                      const isStart = position === "start" || position === "alone"
                      return (
                        <button
                          key={event.id}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation()
                            handleDragStart(e, event.id, dateKey)
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectEvent(event)
                          }}
                          className="flex h-5 w-full items-center gap-1 overflow-hidden text-left transition-opacity hover:opacity-85 rounded-none"
                          style={{ backgroundColor: isStart ? color + "12" : color + "08" }}
                        >
                          {isStart && (
                            <div className="h-full w-[3px] shrink-0" style={{ backgroundColor: color }} />
                          )}
                          {isStart && (
                            <span className="truncate text-[10px] font-medium leading-5 text-foreground/75">
                              {event.title}
                            </span>
                          )}
                          {isStart && (() => {
                            const dayCount = differenceInDays(parseISO(event.endTime!), parseISO(event.startTime)) + 1
                            return dayCount >= 3 ? (
                              <span className="ml-auto mr-1 shrink-0 text-[9px] text-foreground/40 font-medium">
                                {dayCount}d
                              </span>
                            ) : null
                          })()}
                        </button>
                      )
                    })}
                  </div>
                )}
                  <div className="mt-0.5 w-[calc(100%+0.75rem)] -mx-1.5 space-y-px">
                  {visibleItems.map((item, idx) => {
                    const isDraggableEvent = "event" in item && item.type === "event"
                    const sharedClasses = "flex h-5 w-full items-center gap-1 overflow-hidden rounded-[3px]"
                    const content = (
                      <>
                        <div className="h-full w-[3px] shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="truncate text-[10px] font-medium leading-5 text-foreground/75">
                          {item.name}
                        </span>
                      </>
                    )
                    if (isDraggableEvent) {
                      const ev = (item as { event: CalendarEvent }).event
                      return (
                        <button
                          key={`${item.type}-${idx}`}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation()
                            handleDragStart(e, ev.id, dateKey)
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectEvent(ev)
                          }}
                          className={cn(sharedClasses, "cursor-grab active:cursor-grabbing")}
                          style={{ backgroundColor: item.color + "12" }}
                        >
                          {content}
                        </button>
                      )
                    }
                    return (
                      <div
                        key={`${item.type}-${idx}`}
                        className={sharedClasses}
                        style={{ backgroundColor: item.color + "12" }}
                      >
                        {content}
                      </div>
                    )
                  })}
                  {overflow > 0 && (
                    <div className={cn(
                      "text-micro leading-tight text-muted-foreground/50 font-medium",
                      selectedDate === dateKey ? "px-0" : "px-1.5"
                    )}>
                      +{overflow} item{overflow !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {calendarView === "week" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium text-sm text-foreground/90">
              Week of {format(weekStart, "MMM d")} - {format(weekDays[6], "MMM d, yyyy")}
            </h3>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((date) => {
              const dateKey = format(date, "yyyy-MM-dd")
              const dayDeadlines = deadlinesByDate[dateKey] || []
              const daySessions = sessionsByDate[dateKey] || []
              const dayEvents = eventsByDate[dateKey] || []
              const isTodayDate = isToday(date)
              const isDragOver = dragOverDate === dateKey
              const dayMultiDayEvents = getMultiDayForDate(dateKey)
              const sessionIndicators = getCalendarSessionIndicators(daySessions, projects)
              const allItems = [
                ...dayDeadlines.map((p) => ({ type: "deadline" as const, name: p.name, color: getSubjectById(p.subjectId)?.color ?? CALENDAR_FALLBACK_COLOR, project: p })),
                ...sessionIndicators.map((ind) => ({ type: "session" as const, name: ind.count > 1 ? `${ind.shortCode} · ${ind.count}` : ind.shortCode, color: ind.color, kind: "session" as const, id: ind.subjectId })),
                ...dayEvents.map((e) => ({ type: "event" as const, name: e.title, color: getEventTypeInfo(e.eventType).color, event: e })),
              ]

              return (
                <div
                  key={dateKey}
                  onDragOver={(e) => handleDragOver(e, dateKey)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, dateKey)}
                  className={cn(
                    "min-h-[10rem] rounded-2xl border p-2 transition-colors",
                    selectedDate === dateKey
                      ? "border-primary/65 bg-primary/8 ring-1 ring-primary/25"
                      : "border-border/35 bg-background/16 hover:border-border hover:bg-accent/24",
                    isTodayDate && selectedDate !== dateKey && "border-primary/40 bg-primary/5",
                    isDragOver && "border-primary/50 bg-accent/30 ring-2 ring-primary/20"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDate(dateKey)}
                    className={cn(
                      "mb-2 flex h-7 w-7 items-center justify-center rounded-xl text-xs font-semibold transition-colors",
                      isTodayDate
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/80 hover:bg-muted/65"
                    )}
                  >
                    {date.getDate()}
                  </button>
                  {dayMultiDayEvents.length > 0 && (
                    <div className="mb-1 w-full space-y-0.5">
                      {dayMultiDayEvents.map((event) => {
                        const _position = getMultiDayPosition(event, dateKey)
                        const color = getEventTypeInfo(event.eventType).color
                        return (
                          <button
                            key={event.id}
                            type="button"
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation()
                              handleDragStart(e, event.id, dateKey)
                            }}
                            onClick={() => onSelectEvent(event)}
                            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/45"
                            style={{ backgroundColor: color + "14" }}
                        >
                          <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                          <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-foreground/80">
                            {event.title}
                          </span>
                        </button>
                        )
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    {allItems.map((item, idx) => (
                      <button
                        key={`${item.type}-${idx}`}
                        type="button"
                        draggable={item.type === "event" && "event" in item}
                        onDragStart={(e) => {
                          if (item.type === "event" && "event" in item) {
                            e.stopPropagation()
                            handleDragStart(e, item.event.id, dateKey)
                          }
                        }}
                        onClick={() => {
                          if (item.type === "deadline" && "project" in item) onSelectProject(item.project.id)
                          else if (item.type === "session") onSelectDate(dateKey)
                          else if (item.type === "event" && "event" in item) onSelectEvent(item.event)
                        }}
                        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/45"
                      >
                        <div
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="min-w-0 truncate text-[11px] font-medium leading-tight text-foreground/80">
                          {item.name}
                        </span>
                      </button>
                    ))}
                    {allItems.length === 0 && dayMultiDayEvents.length === 0 && (
                      <p className="px-1.5 text-[10px] text-muted-foreground/50">No items</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
