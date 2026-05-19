import { useState } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatDeadline, isOverdue, getSubjectById } from "@/lib/utils"
import type { Project, StudySession } from "@/lib/types"
import { cn } from "@/lib/utils"

interface HomeViewProps {
  projects: Project[]
  sessions: StudySession[]
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: StudySession) => void
  onNewSession: () => void
  onNewProject: () => void
}

export function HomeView({
  projects,
  sessions,
  onSelectProject,
  onSelectSession,
  onNewSession,
  onNewProject,
}: HomeViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const projectsWithDeadlines = projects.filter((p) => p.deadline)
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
    if (!project?.subjectId) return
    const subject = getSubjectById(project.subjectId)
    const startMs = new Date(s.startTime).getTime()
    const endMs = new Date(s.endTime).getTime()
    const mins = (endMs - startMs) / (1000 * 60)
    if (!studyBySubject[project.subjectId]) {
      studyBySubject[project.subjectId] = {
        minutes: 0,
        icon: subject?.icon ?? "",
        shortCode: subject?.shortCode ?? project.subjectId,
      }
    }
    studyBySubject[project.subjectId].minutes += mins
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

  const handlePrevMonth = () => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1))
  const handleNextMonth = () => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1))
  const handleToday = () => setCurrentMonth(new Date())

  return (
    <div className="h-full overflow-auto">
      <div className="px-8 pt-8 pb-10">
        {/* Header — compact, actions inline */}
        <div className="flex items-start justify-between gap-6 mb-10">
          <div className="space-y-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
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
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onNewProject} className="gap-1.5 h-8">
              <Plus className="h-3.5 w-3.5" />
              Project
            </Button>
            <Button size="sm" onClick={onNewSession} className="gap-1.5 h-8">
              <Calendar className="h-3.5 w-3.5" />
              Plan Session
            </Button>
          </div>
        </div>

        {/* Overdue banner — not a card, a compact callout */}
        {overdueProjects.length > 0 && (
          <div className="mb-8 px-4 py-3 rounded-lg bg-destructive/5 border border-destructive/10">
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

        <div className="grid grid-cols-3 gap-8">
          {/* Calendar — dominant, takes 2/3 */}
          <Card className="col-span-2 p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Assessment Calendar</h2>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handlePrevMonth} className="h-8 w-8 p-0">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleToday}
                    className={cn(
                      "h-8 px-3 text-xs",
                      isSameMonth(currentMonth, new Date()) && "bg-accent text-accent-foreground"
                    )}
                  >
                    Today
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleNextMonth} className="h-8 w-8 p-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-sm">{format(currentMonth, "MMMM yyyy")}</h3>

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
                    const isCurrentMonth = isSameMonth(date, currentMonth)
                    const isTodayDate = isToday(date)

                    return (
                      <div
                        key={dateKey}
                        onClick={() => setSelectedDate(selectedDate === dateKey ? null : dateKey)}
                        className={cn(
                          "h-12 rounded-lg border p-1 relative transition-colors",
                          selectedDate === dateKey ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/30 hover:bg-accent/30",
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
                          {(dayDeadlines.length > 2 || daySessions.length > 2) && (
                            <div className="text-[9px] leading-tight">
                              +{Math.max(0, dayDeadlines.length - 2) + Math.max(0, daySessions.length - 2)}
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
                  if (dayDeadlines.length === 0 && daySessions.length === 0) return null
                  return (
                    <div className="pt-4 border-t">
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
                              className="w-full text-left p-2 rounded border border-border hover:border-primary/50 hover:bg-accent/30 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{p.icon} {p.name}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {formatDeadline(p.deadline!)}
                                  </p>
                                </div>
                                {subject && (
                                  <div
                                    className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap font-medium flex-shrink-0"
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
                          return (
                            <button
                              key={s.id}
                              onClick={() => onSelectSession(s)}
                              className="w-full text-left p-2 rounded border border-blue-200/40 bg-blue-50/20 dark:border-blue-900/40 dark:bg-blue-950/20 hover:border-blue-400/60 transition-colors"
                            >
                              <p className="text-xs font-medium">{s.title}</p>
                              {project && <p className="text-[10px] text-muted-foreground mt-0.5">{project.name}</p>}
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {format(parseISO(s.startTime), "h:mm a")}
                              </p>
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

          {/* Sidebar — de-carded, rhythmic spacing */}
          <div>
            {/* Due This Week */}
            {dueThisWeek.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-3">Due This Week</h3>
                <div className="space-y-1">
                  {dueThisWeek.map((p) => {
                    const subject = getSubjectById(p.subjectId)
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelectProject(p.id)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/40 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDeadline(p.deadline!)}
                            </p>
                          </div>
                          {subject && (
                            <div
                              className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap font-medium flex-shrink-0"
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

            {/* Study Sessions — upcoming */}
            {upcomingSessions.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Upcoming Sessions
                </h3>
                <div className="space-y-1">
                  {upcomingSessions.slice(0, 5).map((session) => {
                    const project = projects.find((p) => p.id === session.projectId)
                    return (
                      <button
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/40 transition-colors"
                      >
                        <p className="text-xs font-medium truncate">{session.title}</p>
                        {project && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{project.name}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {format(parseISO(session.startTime), "MMM d, h:mm a")}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty state when nothing is due */}
            {dueThisWeek.length === 0 && upcomingSessions.length === 0 && overdueProjects.length === 0 && (
              <p className="text-xs text-muted-foreground/60 leading-relaxed py-4">
                No deadlines or sessions this week. Add a project to get started.
              </p>
            )}

            {/* Divider before summary */}
            <div className="border-t pt-6 mt-4">
              <h3 className="text-sm font-semibold mb-4">Summary</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Projects</span>
                  <span className="font-medium tabular-nums">{projects.length}</span>
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
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
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
