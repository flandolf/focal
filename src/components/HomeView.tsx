import { useState } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, AlertCircle, CalendarPlus, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatDeadline, isOverdue, getSubjectById, getEventTypeInfo, getSessionSubjectIds } from "@/lib/utils"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"
import { cn } from "@/lib/utils"

interface HomeViewProps {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: StudySession) => void
  onSelectEvent: (event: CalendarEvent) => void
  onNewSession: () => void
  onNewEvent: () => void
  onNewProject: () => void
}

export function HomeView({
  projects,
  sessions,
  events,
  onSelectProject,
  onSelectSession,
  onSelectEvent,
  onNewSession,
  onNewEvent,
  onNewProject,
}: HomeViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const activeProjects = projects.filter((p) => !p.isFinished)
  const projectsWithDeadlines = activeProjects.filter((p) => p.deadline)
  const overdueProjects = projectsWithDeadlines.filter((p) => p.deadline && isOverdue(p.deadline))
  const upcomingProjects = projectsWithDeadlines.filter((p) => p.deadline && !isOverdue(p.deadline))

  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const dueThisWeek = upcomingProjects
    .filter((p) => p.deadline && parseISO(p.deadline) <= nextWeek)
    .sort((a, b) => parseISO(a.deadline!).getTime() - parseISO(b.deadline!).getTime())

  const totalStudyMinutes = sessions.reduce((acc, s) => {
    const startMs = new Date(s.startTime).getTime()
    const endMs = new Date(s.endTime).getTime()
    return acc + (endMs - startMs) / (1000 * 60)
  }, 0)
  const totalStudyHours = Math.round(totalStudyMinutes / 60 * 10) / 10

  const completedSessions = sessions.filter((s) => s.status === "completed").length

  const studyBySubject: Record<string, { minutes: number; icon: string; shortCode: string }> = {}
  sessions.forEach((s) => {
    const project = projects.find((p) => p.id === s.projectId)
    const subjectIds = getSessionSubjectIds(s, project)
    if (subjectIds.length === 0) return
    const startMs = new Date(s.startTime).getTime()
    const endMs = new Date(s.endTime).getTime()
    const mins = (endMs - startMs) / (1000 * 60)
    subjectIds.forEach((subjectId) => {
      const subject = getSubjectById(subjectId)
      if (!studyBySubject[subjectId]) {
        studyBySubject[subjectId] = {
          minutes: 0,
          icon: subject?.icon ?? "",
          shortCode: subject?.shortCode ?? subjectId,
        }
      }
      studyBySubject[subjectId].minutes += mins
    })
  })
  const topSubjects = Object.entries(studyBySubject)
    .sort(([, a], [, b]) => b.minutes - a.minutes)
    .slice(0, 3)
  const upcomingSessions = sessions
    .filter((s) => {
      const sessionStart = new Date(s.startTime)
      return sessionStart >= now && sessionStart <= nextWeek && s.status === "planned"
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  const upcomingEvents = events
    .filter((event) => {
      const eventStart = new Date(event.startTime)
      return eventStart >= now && eventStart <= nextWeek
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayOfWeek = monthStart.getDay()
  const calendarPad = Array.from({ length: startDayOfWeek }, () => null)

  const deadlinesByDate: Record<string, Project[]> = {}
  projectsWithDeadlines.forEach((p) => {
    if (p.deadline) {
      const dateKey = format(parseISO(p.deadline), "yyyy-MM-dd")
      if (!deadlinesByDate[dateKey]) deadlinesByDate[dateKey] = []
      deadlinesByDate[dateKey].push(p)
    }
  })

  const sessionsByDate: Record<string, StudySession[]> = {}
  sessions.forEach((s) => {
    const dateKey = format(parseISO(s.startTime), "yyyy-MM-dd")
    if (!sessionsByDate[dateKey]) sessionsByDate[dateKey] = []
    sessionsByDate[dateKey].push(s)
  })

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  events.forEach((event) => {
    const dateKey = format(parseISO(event.startTime), "yyyy-MM-dd")
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = []
    eventsByDate[dateKey].push(event)
  })

  const handlePrevMonth = () => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1))
  const handleNextMonth = () => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1))
  const handleToday = () => setCurrentMonth(new Date())

  return (
    <div className="h-full overflow-auto">
      <div className="px-5 pb-8 pt-5 min-[1200px]:px-8 min-[1200px]:pb-10 min-[1200px]:pt-7">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 min-[1200px]:mb-8 min-[1200px]:gap-5">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold min-[1200px]:text-3xl">Today</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {overdueProjects.length > 0 ? (
                <span className="text-destructive font-medium">
                  {overdueProjects.length} overdue{overdueProjects.length > 0 ? "" : ""}
                </span>
              ) : null}
              {overdueProjects.length > 0 && dueThisWeek.length > 0 && (
                <span className="text-muted-foreground/40">{" · "}</span>
              )}
              {dueThisWeek.length > 0 && (
                <span>{dueThisWeek.length} due this week</span>
              )}
              {dueThisWeek.length > 0 && upcomingEvents.length > 0 && (
                <span className="text-muted-foreground/40">{" · "}</span>
              )}
              {upcomingEvents.length > 0 && (
                <span>{upcomingEvents.length} event{upcomingEvents.length !== 1 ? "s" : ""} this week</span>
              )}
              {overdueProjects.length === 0 && dueThisWeek.length === 0 && upcomingEvents.length === 0 && (
                <span>No urgent deadlines. Keep the workspace tidy.</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onNewProject} className="h-8 gap-1.5 rounded-xl bg-background/45">
              <Plus className="h-3.5 w-3.5" />
              Project
            </Button>
            <Button variant="outline" size="sm" onClick={onNewEvent} className="h-8 gap-1.5 rounded-xl bg-background/45">
              <CalendarPlus className="h-3.5 w-3.5" />
              Event
            </Button>
            <Button size="sm" onClick={onNewSession} className="h-8 gap-1.5 rounded-xl">
              <Calendar className="h-3.5 w-3.5" />
              Plan Session
            </Button>
          </div>
        </div>

        {/* Overdue banner — not a card, a compact callout */}
        {overdueProjects.length > 0 && (
          <div className="mb-6 rounded-2xl border border-destructive/15 bg-destructive/8 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive/70" />
              <span className="text-xs font-semibold text-destructive/80">
                {overdueProjects.length} overdue project{overdueProjects.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {overdueProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className="text-xs px-2.5 py-1 rounded-md hover:bg-destructive/10 transition-colors text-left font-medium"
                >
                  {p.name}
                  <span className="text-destructive/60 ml-1.5">{formatDeadline(p.deadline!)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 min-[1200px]:gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
          <Card className="rounded-2xl border border-border/70 bg-background/48 p-4 shadow-sm backdrop-blur min-[1200px]:rounded-[1.25rem] min-[1200px]:p-6">
            <div className="space-y-4 min-[1200px]:space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-heading text-lg font-semibold">Assessment Calendar</h2>
                  <p className="text-caption text-muted-foreground">Deadlines, events, and planned sessions share the same grid.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handlePrevMonth} className="h-8 w-8 rounded-xl p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToday}
                    className={cn(
                      "h-8 rounded-xl px-3 text-xs",
                      isSameMonth(currentMonth, new Date()) && "bg-accent text-accent-foreground"
                    )}
                  >
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleNextMonth} className="h-8 w-8 rounded-xl p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-sm text-foreground/90">{format(currentMonth, "MMMM yyyy")}</h3>

                <div className="grid grid-cols-7 gap-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {day}
                    </div>
                  ))}
                  {calendarPad.map((_, i) => (
                    <div key={`pad-${i}`} className="h-12" />
                  ))}
                  {daysInMonth.map((date) => {
                    const dateKey = format(date, "yyyy-MM-dd")
                    const dayDeadlines = deadlinesByDate[dateKey] || []
                    const daySessions = sessionsByDate[dateKey] || []
                    const dayEvents = eventsByDate[dateKey] || []
                    const isCurrentMonth = isSameMonth(date, currentMonth)
                    const isTodayDate = isToday(date)

                    return (
                      <div
                        key={dateKey}
                        onClick={() => setSelectedDate(selectedDate === dateKey ? null : dateKey)}
                        className={cn(
                          "relative h-12 cursor-pointer rounded-xl border p-1.5 transition-colors min-[1200px]:h-14",
                          selectedDate === dateKey ? "border-primary bg-primary/8 ring-1 ring-primary/30" : "border-border/65 bg-background/28 hover:border-muted-foreground/30 hover:bg-accent/30",
                          isTodayDate && selectedDate !== dateKey && "border-primary bg-primary/5",
                          !isCurrentMonth && "opacity-40"
                        )}
                      >
                        <div className="text-xs font-medium leading-tight">{date.getDate()}</div>
                        <div className="flex gap-0.5 mt-0.5 flex-wrap">
                          {dayDeadlines.slice(0, 2).map((p, idx) => {
                            const subject = getSubjectById(p.subjectId)
                            return (
                              <div
                                key={`deadline-${idx}`}
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: subject?.color ?? "#888" }}
                                title={`${p.name} (deadline)`}
                              />
                            )
                          })}
                          {daySessions.slice(0, 2).map((s, idx) => (
                            <div
                              key={`session-${idx}`}
                              className="w-1 h-1 rounded-full bg-blue-500/60"
                              title={`${s.title} (study session)`}
                            />
                          ))}
                          {dayEvents.slice(0, 2).map((event, idx) => {
                            const eventInfo = getEventTypeInfo(event.eventType)
                            return (
                              <div
                                key={`event-${idx}`}
                                className="h-1.5 w-2.5 rounded-full"
                                style={{ backgroundColor: eventInfo.color }}
                                title={`${event.title} (${eventInfo.label})`}
                              />
                            )
                          })}
                          {(dayDeadlines.length > 2 || daySessions.length > 2 || dayEvents.length > 2) && (
                            <div className="text-micro leading-tight">
                              +{Math.max(0, dayDeadlines.length - 2) + Math.max(0, daySessions.length - 2) + Math.max(0, dayEvents.length - 2)}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {selectedDate && (() => {
                  const dayDeadlines = deadlinesByDate[selectedDate] || []
                  const daySessions = sessionsByDate[selectedDate] || []
                  const dayEvents = eventsByDate[selectedDate] || []
                  if (dayDeadlines.length === 0 && daySessions.length === 0 && dayEvents.length === 0) return null
                  return (
                    <div className="border-t border-border/70 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold">
                          {format(parseISO(selectedDate), "EEEE, MMMM d")}
                        </p>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedDate(null)}>
                          Close
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {dayDeadlines.map((p) => {
                          const subject = getSubjectById(p.subjectId)
                          return (
                            <button
                              key={p.id}
                              onClick={() => onSelectProject(p.id)}
                              className="w-full rounded-xl border border-border/70 bg-background/30 p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{p.icon} {p.name}</p>
                                  <p className="text-micro text-muted-foreground mt-0.5">
                                    {formatDeadline(p.deadline!)}
                                  </p>
                                </div>
                                {subject && (
                                  <div
                                    className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium shrink-0"
                                    style={{
                                      backgroundColor: subject.color + "18",
                                      color: subject.color,
                                    }}
                                  >
                                    {subject.shortCode}
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })}
                        {daySessions.map((s) => {
                          const project = projects.find((p) => p.id === s.projectId)
                          const subjects = getSessionSubjectIds(s, project)
                            .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
                            .join(", ")
                          return (
                            <button
                              key={s.id}
                              onClick={() => onSelectSession(s)}
                              className="w-full rounded-xl border border-blue-200/40 bg-blue-50/20 p-2 text-left transition-colors hover:border-blue-400/60 dark:border-blue-900/40 dark:bg-blue-950/20"
                            >
                              <p className="text-xs font-medium">{s.title}</p>
                              <p className="text-micro text-muted-foreground mt-0.5">
                                {project?.name ?? subjects}
                              </p>
                              <p className="text-micro text-muted-foreground mt-1">
                                {format(parseISO(s.startTime), "h:mm a")}
                              </p>
                            </button>
                          )
                        })}
                        {dayEvents.map((event) => {
                          const subject = getSubjectById(event.subjectId)
                          const eventInfo = getEventTypeInfo(event.eventType)
                          return (
                            <button
                              key={event.id}
                              onClick={() => onSelectEvent(event)}
                              className="w-full rounded-xl border border-border/70 bg-background/30 p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-medium">{event.title}</p>
                                  <p className="text-micro text-muted-foreground mt-0.5">
                                    {format(parseISO(event.startTime), "h:mm a")}
                                    {event.location ? ` · ${event.location}` : ""}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  {subject && (
                                    <span
                                      className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
                                      style={{
                                        backgroundColor: subject.color + "18",
                                        color: subject.color,
                                      }}
                                    >
                                      {subject.shortCode}
                                    </span>
                                  )}
                                  <span
                                    className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
                                    style={{
                                      backgroundColor: eventInfo.color + "18",
                                      color: eventInfo.color,
                                    }}
                                  >
                                    {eventInfo.label}
                                  </span>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </Card>

          <div className="space-y-4 min-[1200px]:space-y-6">
            {dueThisWeek.length > 0 && (
              <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-4 shadow-sm backdrop-blur">
                <h3 className="mb-3 font-heading text-sm font-semibold">Due This Week</h3>
                <div className="space-y-1">
                  {dueThisWeek.map((p) => {
                    const subject = getSubjectById(p.subjectId)
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelectProject(p.id)}
                        className="group w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-micro text-muted-foreground mt-0.5">
                              {formatDeadline(p.deadline!)}
                            </p>
                          </div>
                          {subject && (
                            <div
                              className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium shrink-0"
                              style={{
                                backgroundColor: subject.color + "14",
                                color: subject.color,
                              }}
                            >
                              {subject.shortCode}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {upcomingSessions.length > 0 && (
              <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-4 shadow-sm backdrop-blur">
                <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Upcoming Sessions
                </h3>
                <div className="space-y-1">
                  {upcomingSessions.slice(0, 5).map((session) => {
                    const project = projects.find((p) => p.id === session.projectId)
                    const subjects = getSessionSubjectIds(session, project)
                      .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
                      .join(", ")
                    return (
                      <button
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40"
                      >
                        <p className="text-xs font-medium truncate">{session.title}</p>
                        <p className="text-micro text-muted-foreground mt-0.5">{project?.name ?? subjects}</p>
                        <p className="text-micro text-muted-foreground mt-1">
                          {format(parseISO(session.startTime), "MMM d, h:mm a")}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {upcomingEvents.length > 0 && (
              <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-4 shadow-sm backdrop-blur">
                <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-semibold">
                  <CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  Events
                </h3>
                <div className="space-y-1">
                  {upcomingEvents.slice(0, 5).map((event) => {
                    const subject = getSubjectById(event.subjectId)
                    const eventInfo = getEventTypeInfo(event.eventType)
                    return (
                      <button
                        key={event.id}
                        onClick={() => onSelectEvent(event)}
                        className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{event.title}</p>
                            <p className="text-micro text-muted-foreground mt-0.5">
                              {format(parseISO(event.startTime), "MMM d, h:mm a")}
                            </p>
                            {event.location && (
                              <p className="text-micro text-muted-foreground mt-0.5 flex items-center gap-1">
                                <MapPin className="h-2.5 w-2.5" />
                                <span className="truncate">{event.location}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
                              style={{
                                backgroundColor: eventInfo.color + "14",
                                color: eventInfo.color,
                              }}
                            >
                              {eventInfo.label}
                            </span>
                            {subject && (
                              <span
                                className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
                                style={{
                                  backgroundColor: subject.color + "14",
                                  color: subject.color,
                                }}
                              >
                                {subject.shortCode}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {dueThisWeek.length === 0 && upcomingSessions.length === 0 && upcomingEvents.length === 0 && overdueProjects.length === 0 && (
              <div className="rounded-[1.25rem] border border-dashed border-border bg-background/30 p-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  No deadlines, events, or sessions this week. Add an event or project to get started.
                </p>
              </div>
            )}

            <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-4 shadow-sm backdrop-blur">
              <h3 className="mb-4 font-heading text-sm font-semibold">Summary</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active projects</span>
                  <span className="font-medium tabular-nums">{activeProjects.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">With deadlines</span>
                  <span className="font-medium tabular-nums">{projectsWithDeadlines.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sessions planned</span>
                  <span className="font-medium tabular-nums">{upcomingSessions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Events this week</span>
                  <span className="font-medium tabular-nums">{upcomingEvents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sessions completed</span>
                  <span className="font-medium tabular-nums">{completedSessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Study time</span>
                  <span className="font-medium tabular-nums">{totalStudyHours}h</span>
                </div>
              </div>

              {topSubjects.length > 0 && (
                <div className="mt-5 pt-4 border-t">
                  <p className="text-xs font-medium mb-3 text-muted-foreground">Top Subjects</p>
                  <div className="space-y-2">
                    {topSubjects.map(([subjectId, info]) => {
                      const subject = getSubjectById(subjectId)
                      return (
                        <div key={subjectId} className="flex items-center justify-between">
                          <span
                            className="text-micro px-1.5 py-0.5 rounded font-medium"
                            style={{
                              backgroundColor: subject?.color + "14",
                              color: subject?.color,
                            }}
                          >
                            {info.icon} {info.shortCode}
                          </span>
                          <span className="text-xs tabular-nums font-medium">
                            {Math.round(info.minutes / 60 * 10) / 10}h
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
