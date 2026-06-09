import { useMemo } from "react"
import { format, isSameMonth, isToday } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getSubjectById, getEventTypeInfo, cn } from "@/lib/utils"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"

const CALENDAR_FALLBACK_COLOR = "var(--muted-foreground)"
const CALENDAR_SESSION_COLOR = "var(--primary)"

interface CalendarGridProps {
  currentMonth: Date
  calendarView: "month" | "week"
  selectedDate: string | null
  deadlinesByDate: Record<string, Project[]>
  sessionsByDate: Record<string, StudySession[]>
  eventsByDate: Record<string, CalendarEvent[]>
  onSetCalendarView: (view: "month" | "week") => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
  onSelectDate: (dateKey: string) => void
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: StudySession) => void
  onSelectEvent: (event: CalendarEvent) => void
}

export function CalendarGrid({
  currentMonth,
  calendarView,
  selectedDate,
  deadlinesByDate,
  sessionsByDate,
  eventsByDate,
  onSetCalendarView,
  onPrevMonth,
  onNextMonth,
  onToday,
  onSelectDate,
  onSelectProject,
  onSelectSession,
  onSelectEvent,
}: CalendarGridProps) {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold">Assessment Calendar</h2>
          <p className="text-caption text-muted-foreground">Deadlines, events, and planned sessions share the same grid.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-lg border border-border/70 bg-background/55 p-0.5">
            <button
              type="button"
              onClick={() => onSetCalendarView("month")}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
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
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
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
        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="flex h-6 items-center justify-center text-micro font-medium uppercase text-muted-foreground/70">
              {day}
            </div>
          ))}
          {calendarPad.map((i) => (
            <div key={`pad-${i}`} className="h-22 rounded-xl border border-transparent" />
          ))}
          {daysInMonth.map((date) => {
            const dateKey = format(date, "yyyy-MM-dd")
            const dayDeadlines = deadlinesByDate[dateKey] || []
            const daySessions = sessionsByDate[dateKey] || []
            const dayEvents = eventsByDate[dateKey] || []
            const isCurrentMonth = isSameMonth(date, currentMonth)
            const isTodayDate = isToday(date)
            const allItems = [
              ...dayDeadlines.map((p) => ({ type: "deadline" as const, name: p.name, color: getSubjectById(p.subjectId)?.color ?? CALENDAR_FALLBACK_COLOR })),
              ...daySessions.map((s) => ({ type: "session" as const, name: s.title, color: CALENDAR_SESSION_COLOR })),
              ...dayEvents.map((e) => ({ type: "event" as const, name: e.title, color: getEventTypeInfo(e.eventType).color })),
            ]
            const visibleItems = allItems.slice(0, 3)
            const overflow = allItems.length - 3

            return (
              <button
                type="button"
                key={dateKey}
                onClick={() => onSelectDate(dateKey)}
                className={cn(
                  "relative flex h-22 w-full flex-col items-start justify-start rounded-xl border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                  selectedDate === dateKey
                    ? "border-primary/65 bg-primary/8 ring-1 ring-primary/25"
                    : "border-border/35 bg-background/16 hover:border-border hover:bg-accent/24",
                  isTodayDate && selectedDate !== dateKey && "border-primary/40 bg-primary/5",
                  !isCurrentMonth && "opacity-30"
                )}
              >
                <div className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-md text-micro font-semibold leading-none",
                  isTodayDate && "bg-primary/12",
                  isTodayDate ? "text-primary" : "text-foreground/80"
                )}>
                  {date.getDate()}
                </div>
                <div className="mt-1 w-full space-y-0.5">
                  {visibleItems.map((item, idx) => (
                    <div
                      key={`${item.type}-${idx}`}
                      className="flex items-center gap-1 min-w-0"
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-micro leading-tight truncate text-foreground/60">
                        {item.name}
                      </span>
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="text-micro leading-tight text-muted-foreground/50 font-medium pl-2.5">
                      +{overflow}
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
              const allItems = [
                ...dayDeadlines.map((p) => ({ type: "deadline" as const, name: p.name, color: getSubjectById(p.subjectId)?.color ?? CALENDAR_FALLBACK_COLOR, project: p })),
                ...daySessions.map((s) => ({ type: "session" as const, name: s.title, color: CALENDAR_SESSION_COLOR, session: s })),
                ...dayEvents.map((e) => ({ type: "event" as const, name: e.title, color: getEventTypeInfo(e.eventType).color, event: e })),
              ]

              return (
                <div
                  key={dateKey}
                  className={cn(
                    "min-h-[10rem] rounded-xl border p-2 transition-colors",
                    selectedDate === dateKey
                      ? "border-primary/65 bg-primary/8 ring-1 ring-primary/25"
                      : "border-border/35 bg-background/16 hover:border-border hover:bg-accent/24",
                    isTodayDate && selectedDate !== dateKey && "border-primary/40 bg-primary/5"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDate(dateKey)}
                    className={cn(
                      "mb-2 flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                      isTodayDate
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground/80 hover:bg-muted/65"
                    )}
                  >
                    {date.getDate()}
                  </button>
                  <div className="space-y-1">
                    {allItems.map((item, idx) => (
                      <button
                        key={`${item.type}-${idx}`}
                        type="button"
                        onClick={() => {
                          if (item.type === "deadline" && "project" in item) onSelectProject(item.project.id)
                          else if (item.type === "session" && "session" in item) onSelectSession(item.session)
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
                    {allItems.length === 0 && (
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
