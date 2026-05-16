import { useState } from "react"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
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

  // Get all project deadlines
  const projectsWithDeadlines = projects.filter((p) => p.deadline)
  const overdueProjects = projectsWithDeadlines.filter((p) => p.deadline && isOverdue(p.deadline))
  const upcomingProjects = projectsWithDeadlines.filter((p) => p.deadline && !isOverdue(p.deadline))

  // Get projects due in next 7 days
  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const dueThisWeek = upcomingProjects
    .filter((p) => p.deadline && parseISO(p.deadline) <= nextWeek)
    .sort((a, b) => parseISO(a.deadline!).getTime() - parseISO(b.deadline!).getTime())

  // Calculate study stats
  const totalStudyMinutes = sessions.reduce((acc, s) => {
    const startMs = new Date(s.startTime).getTime()
    const endMs = new Date(s.endTime).getTime()
    return acc + (endMs - startMs) / (1000 * 60)
  }, 0)
  const totalStudyHours = Math.round(totalStudyMinutes / 60 * 10) / 10

  const completedSessions = sessions.filter((s) => s.status === "completed").length

  // Per-subject breakdown
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

  // Calendar days
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayOfWeek = monthStart.getDay()
  const calendarPad = Array.from({ length: startDayOfWeek }, () => null)

  // Map projects to calendar dates
  const deadlinesByDate: Record<string, Project[]> = {}
  projectsWithDeadlines.forEach((p) => {
    if (p.deadline) {
      const dateKey = format(parseISO(p.deadline), "yyyy-MM-dd")
      if (!deadlinesByDate[dateKey]) {
        deadlinesByDate[dateKey] = []
      }
      deadlinesByDate[dateKey].push(p)
    }
  })

  // Map study sessions to calendar dates
  const sessionsByDate: Record<string, StudySession[]> = {}
  sessions.forEach((s) => {
    const dateKey = format(parseISO(s.startTime), "yyyy-MM-dd")
    if (!sessionsByDate[dateKey]) {
      sessionsByDate[dateKey] = []
    }
    sessionsByDate[dateKey].push(s)
  })

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1))
  }

  const handleToday = () => {
    setCurrentMonth(new Date())
  }

  return (
    <div className="h-full overflow-auto">
      <div className="px-8 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {overdueProjects.length > 0 ? (
              <span className="text-destructive font-medium">
                {overdueProjects.length} overdue • 
              </span>
            ) : null}
            {dueThisWeek.length} due this week
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Calendar */}
          <Card className="col-span-2 p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Assessment Calendar</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePrevMonth}
                    className="h-8 w-8 p-0"
                  >
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNextMonth}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">{format(currentMonth, "MMMM yyyy")}</h3>
                </div>

                {/* Calendar Grid */}
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
                          {/* Project deadlines (larger dots) */}
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
                          {/* Study sessions (smaller dots) */}
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

                {/* Legend */}
                <div className="pt-4 border-t">
                  <div className="text-xs text-muted-foreground space-y-2">
                    <p className="font-medium mb-2">Legend:</p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        <span>Project deadlines (by subject color)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-blue-500/60" />
                        <span>Study sessions</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Selected Day Detail */}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setSelectedDate(null)}
                        >
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

          {/* Sidebar - Upcoming */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Quick Actions</h3>
              <Button
                onClick={onNewProject}
                className="w-full gap-2"
                size="sm"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                New Project
              </Button>
              <Button
                onClick={onNewSession}
                className="w-full gap-2"
                size="sm"
              >
                <Calendar className="h-4 w-4" />
                Plan Session
              </Button>
            </Card>

            {/* Overdue Alert */}
            {overdueProjects.length > 0 && (
              <Card className="p-4 border-destructive/20 bg-destructive/5 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <h3 className="text-sm font-semibold text-destructive">
                    {overdueProjects.length} Overdue
                  </h3>
                </div>
                <ScrollArea className="h-24">
                  <div className="space-y-1.5 pr-4">
                    {overdueProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => onSelectProject(p.id)}
                        className="w-full text-left text-xs p-2 rounded hover:bg-destructive/10 transition-colors"
                      >
                        <p className="font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-destructive/80 text-[10px]">
                          {formatDeadline(p.deadline!)}
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            )}

            {/* This Week */}
            {dueThisWeek.length > 0 && (
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">Due This Week</h3>
                <ScrollArea className="h-40">
                  <div className="space-y-2 pr-4">
                    {dueThisWeek.map((p) => {
                      const subject = getSubjectById(p.subjectId)
                      return (
                        <button
                          key={p.id}
                          onClick={() => onSelectProject(p.id)}
                          className="w-full text-left p-2 rounded border border-border hover:border-primary/50 hover:bg-accent/30 transition-colors"
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
                  </div>
                </ScrollArea>
              </Card>
            )}

            {/* Upcoming Study Sessions */}
            {upcomingSessions.length > 0 && (
              <Card className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Study Sessions
                </h3>
                <ScrollArea className="h-32">
                  <div className="space-y-2 pr-4">
                    {upcomingSessions.slice(0, 5).map((session) => {
                      const project = projects.find((p) => p.id === session.projectId)
                      return (
                        <button
                          key={session.id}
                          onClick={() => onSelectSession(session)}
                          className="w-full text-left text-xs p-2 rounded border border-blue-200/40 bg-blue-50/20 dark:border-blue-900/40 dark:bg-blue-950/20 hover:border-blue-400/60 hover:bg-blue-100/30 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          <p className="font-medium truncate">{session.title}</p>
                          {project && <p className="text-muted-foreground/70 text-[10px] mt-0.5">{project.name}</p>}
                          <p className="text-muted-foreground text-[10px] mt-1">
                            {format(parseISO(session.startTime), "MMM d, h:mm a")}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </ScrollArea>
              </Card>
            )}

            {/* Summary Stats */}
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Summary</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Projects</span>
                  <span className="font-medium">{projects.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">With Deadlines</span>
                  <span className="font-medium">{projectsWithDeadlines.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Upcoming Sessions</span>
                  <span className="font-medium">{upcomingSessions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-medium">{completedSessions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Study Time</span>
                  <span className="font-medium">{totalStudyHours}h</span>
                </div>
              </div>
              {topSubjects.length > 0 && (
                <>
                  <div className="pt-2 border-t">
                    <p className="text-xs font-medium mb-2 text-muted-foreground">Top Subjects</p>
                    <div className="space-y-1.5">
                      {topSubjects.map(([subjectId, info]) => {
                        const subject = getSubjectById(subjectId)
                        return (
                          <div key={subjectId} className="flex items-center justify-between">
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                              style={{
                                backgroundColor: subject?.color + "18",
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
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
