import { useState, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { format, isSameMonth, parseISO, differenceInDays } from "date-fns"
import { Plus, Calendar, Clock, AlertCircle, CalendarPlus, MapPin, Trash2, X, CheckCircle2, Combine, Check, Brain, Wand2, ArrowRight } from "lucide-react"
import { getDayLabelForDate, getTimetableEntriesForDay, getCurrentPeriodInfo } from "@/lib/timetable"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatDeadline, isOverdue, getSubjectById, getEventTypeInfo, getSessionSubjectIds, getSessionEffectiveMinutes, cn, getLocalDateValue, formatTime12 } from "@/lib/utils"
import { AssessmentCopilot } from "@/components/AssessmentCopilot"
import { TextEventPlanner } from "@/components/TextEventPlanner"
import { getPriorityItems } from "@/lib/studyPriority"
import type { PrepBalanceItem } from "@/lib/planning"
import type { TimetableConfig } from "@/lib/settings"
import type { CalendarEvent, PriorityItem, Project, StudySession } from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"
import { CalendarGrid } from "@/components/home/CalendarGrid"
import { DayDetail } from "@/components/home/DayDetail"
import { MonthBrief } from "@/components/home/MonthBrief"
import { PrepBalance } from "@/components/home/PrepBalance"
import { QuickLinks } from "@/components/home/QuickLinks"
import { StudyPriorities } from "@/components/home/StudyPriorities"
import { RecentActivity } from "@/components/home/RecentActivity"

interface MonthBriefItem {
  id: string
  title: string
  meta: string
  date: Date
  color: string
  kind: "assessment" | "session" | "event"
  projectId?: string
  session?: StudySession
  event?: CalendarEvent
}

const CALENDAR_SESSION_COLOR = "var(--primary)"
const PREP_COMPLETED_CREDIT_WINDOW_DAYS = 7

function getPlanningSubjects(projects: Project[]) {
  const subjectsById = new Map(VCE_SUBJECTS.map((subject) => [subject.id, subject]))
  projects.forEach((project) => {
    if (!project.subjectId || subjectsById.has(project.subjectId)) return
    const subject = getSubjectById(project.subjectId)
    if (subject) subjectsById.set(subject.id, subject)
  })
  return Array.from(subjectsById.values())
}

interface HomeViewProps {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: StudySession) => void
  onSelectEvent: (event: CalendarEvent) => void
  onNewSession: (initialDate?: Date) => void
  onNewEvent: (initialDate?: Date) => void
  onNewProject: () => void
  onCreateEvents: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
  onCreateStudySessions: (sessions: Omit<StudySession, "id" | "status" | "created_at">[]) => Promise<void>
  onDeleteCalendarItems: (itemIds: { eventIds: string[]; sessionIds: string[] }) => Promise<void>
  onSetCalendarItemsCompleted: (itemIds: { eventIds: string[]; sessionIds: string[] }, isCompleted: boolean) => Promise<void>
  onMergeEvents: (ids: string[]) => Promise<void>
  onMergeStudySessions: (ids: string[]) => Promise<void>
  onGoTimetable: () => void
  timetableConfig: TimetableConfig | null
  onMoveEvent?: (eventId: string, newStartTime: string, newEndTime?: string) => void
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
  onCreateEvents,
  onCreateStudySessions,
  onDeleteCalendarItems,
  onSetCalendarItemsCompleted,
  onMergeEvents,
  onMergeStudySessions,
  onGoTimetable,
  onMoveEvent,
  timetableConfig,
}: HomeViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(() => getLocalDateValue(new Date()))
  const [calendarView, setCalendarView] = useState<"month" | "week">("month")
  const [prioritiesOpen, setPrioritiesOpen] = useState(true)
  const [calendarSelectionMode, setCalendarSelectionMode] = useState(false)
  const [recentActivityOpen, setRecentActivityOpen] = useState(true)
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([])
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])
  const [eventBatchSaving, setEventBatchSaving] = useState(false)
  const [textPlannerOpen, setTextPlannerOpen] = useState(false)
  const [textPlannerTitle, setTextPlannerTitle] = useState("Text to Events")
  const [textPlannerDescription, setTextPlannerDescription] = useState("Paste a notice, rough plan, or teacher message. Review drafts before adding them.")
  const [textPlannerInitialText, setTextPlannerInitialText] = useState("")
  const [copilotOpen, setCopilotOpen] = useState(false)

  const selectedCalendarDate = selectedDate ? parseISO(selectedDate) : undefined

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
    return acc + getSessionEffectiveMinutes(s)
  }, 0)
  const totalStudyHours = Math.round(totalStudyMinutes / 60 * 10) / 10

  const completedSessions = sessions.filter((s) => s.status === "completed").length
  const priorityItems = useMemo(() => getPriorityItems({ projects, sessions, events }), [projects, sessions, events])
  const planningSubjects = useMemo(() => getPlanningSubjects(projects), [projects])

  const recentActivity = useMemo(() => {
    interface ActivityItem {
      id: string
      title: string
      subtitle: string
      timestamp: string
      kind: "session" | "event"
      session?: StudySession
      event?: CalendarEvent
    }
    const recentSessions: ActivityItem[] = sessions
      .filter((s) => s.status === "completed" && s.completedAt)
      .map((s) => {
        const project = s.projectId ? projects.find((p) => p.id === s.projectId) : undefined
        const subjectLabels = getSessionSubjectIds(s, project)
          .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
          .join(", ")
        return {
          id: s.id,
          title: s.title,
          subtitle: project?.name ?? (subjectLabels || "Study session"),
          timestamp: s.completedAt!,
          kind: "session" as const,
          session: s,
        }
      })
    const recentEvents: ActivityItem[] = events
      .filter((e) => e.isFinished && e.finishedAt)
      .map((e) => {
        const subject = getSubjectById(e.subjectId)
        return {
          id: e.id,
          title: e.title,
          subtitle: subject?.shortCode ?? e.eventType,
          timestamp: e.finishedAt!,
          kind: "event" as const,
          event: e,
        }
      })
    return [...recentSessions, ...recentEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 7)
  }, [sessions, events, projects])

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
      return !event.isFinished && eventStart >= now && eventStart <= nextWeek
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

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
    const startKey = format(parseISO(event.startTime), "yyyy-MM-dd")
    if (!eventsByDate[startKey]) eventsByDate[startKey] = []
    eventsByDate[startKey].push(event)

    // Index multi-day events on every date they span
    if (event.endTime) {
      const endKey = format(parseISO(event.endTime), "yyyy-MM-dd")
      if (endKey !== startKey) {
        let current = parseISO(event.startTime)
        const _endDate = parseISO(event.endTime)
        while (true) {
          current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
          const dateKey = format(current, "yyyy-MM-dd")
          if (dateKey > endKey) break
          if (!eventsByDate[dateKey]) eventsByDate[dateKey] = []
          eventsByDate[dateKey].push(event)
        }
      }
    }
  })

  const selectedEventIdSet = useMemo(() => new Set(selectedEventIds), [selectedEventIds])
  const selectedSessionIdSet = useMemo(() => new Set(selectedSessionIds), [selectedSessionIds])
  const selectedDayDeadlines = selectedDate ? deadlinesByDate[selectedDate] ?? [] : []
  const selectedDaySessions = selectedDate ? sessionsByDate[selectedDate] ?? [] : []
  const selectedDayEvents = selectedDate ? eventsByDate[selectedDate] ?? [] : []
  const selectedBatchEvents = selectedDayEvents.filter((event) => selectedEventIdSet.has(event.id))
  const selectedBatchSessions = selectedDaySessions.filter((session) => selectedSessionIdSet.has(session.id))
  const selectedBatchCount = selectedBatchEvents.length + selectedBatchSessions.length
  const canMergeSelectedEvents = selectedBatchEvents.length >= 2 && selectedBatchSessions.length === 0
  const canMergeSelectedSessions = selectedBatchSessions.length >= 2 && selectedBatchEvents.length === 0
  const canMergeSelectedItems = canMergeSelectedEvents || canMergeSelectedSessions
  const allSelectedItemsComplete = selectedBatchCount > 0
    && selectedBatchEvents.every((event) => event.isFinished)
    && selectedBatchSessions.every((session) => session.status === "completed")

  const clearEventSelection = () => {
    setCalendarSelectionMode(false)
    setSelectedEventIds([])
    setSelectedSessionIds([])
  }

  const handleSelectCalendarDate = (dateKey: string) => {
    setSelectedDate(dateKey)
    clearEventSelection()
  }

  const handleToggleEventSelection = (eventId: string) => {
    setSelectedEventIds((current) => (
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId]
    ))
  }

  const handleToggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds((current) => (
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId]
    ))
  }

  const handleDeleteSelectedEvents = async () => {
    if (selectedBatchCount === 0) return
    setEventBatchSaving(true)
    try {
      const eventIds = selectedBatchEvents.map((event) => event.id)
      const sessionIds = selectedBatchSessions.map((session) => session.id)
      await onDeleteCalendarItems({ eventIds, sessionIds })
      clearEventSelection()
    } finally {
      setEventBatchSaving(false)
    }
  }

  const handleMergeSelectedEvents = async () => {
    if (!canMergeSelectedItems) return
    setEventBatchSaving(true)
    try {
      if (canMergeSelectedEvents) {
        await onMergeEvents(selectedBatchEvents.map((event) => event.id))
      } else if (canMergeSelectedSessions) {
        await onMergeStudySessions(selectedBatchSessions.map((session) => session.id))
      }
      clearEventSelection()
    } finally {
      setEventBatchSaving(false)
    }
  }

  const handleToggleSelectedEventsComplete = async () => {
    if (selectedBatchCount === 0) return
    setEventBatchSaving(true)
    try {
      const eventIds = selectedBatchEvents.map((event) => event.id)
      const sessionIds = selectedBatchSessions.map((session) => session.id)
      const nextComplete = !allSelectedItemsComplete
      await onSetCalendarItemsCompleted({ eventIds, sessionIds }, nextComplete)
      clearEventSelection()
    } finally {
      setEventBatchSaving(false)
    }
  }

  const monthAgendaStart = isSameMonth(currentMonth, now)
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : (() => { const d = new Date(currentMonth); d.setDate(1); d.setHours(0, 0, 0, 0); return d })()
  const isMonthItemVisible = (date: Date) => date >= monthAgendaStart && (() => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + 1, 0); d.setHours(23, 59, 59, 999); return d })() >= date

  const monthBriefItems: MonthBriefItem[] = [
    ...projectsWithDeadlines
      .filter((project) => project.deadline && isMonthItemVisible(parseISO(project.deadline)))
      .map((project) => {
        const subject = getSubjectById(project.subjectId)
        return {
          id: `assessment-${project.id}`,
          title: project.name,
          meta: `${project.deadlineType?.toUpperCase() ?? "Assessment"} · ${formatDeadline(project.deadline!)}`,
          date: parseISO(project.deadline!),
          color: subject?.color ?? "var(--primary)",
          kind: "assessment" as const,
          projectId: project.id,
        }
      }),
    ...(() => {
      const plannedSessions = sessions.filter((session) => session.status === "planned" && isMonthItemVisible(parseISO(session.startTime)))
      const subjectDayMap = new Map<string, { count: number; totalMinutes: number; date: Date; subjectId: string; projectName: string }>()
      for (const session of plannedSessions) {
        const project = session.projectId ? projects.find((candidate) => candidate.id === session.projectId) : undefined
        const subjectIds = getSessionSubjectIds(session, project)
        const dateKey = format(parseISO(session.startTime), "yyyy-MM-dd")
        const durationMinutes = getSessionEffectiveMinutes(session)
        const sessionContext = project?.name ?? (subjectIds.map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId).join(", ") || "Study session")
        const minutesPerSubject = durationMinutes / (subjectIds.length || 1)
        for (const subjectId of subjectIds) {
          const key = `${dateKey}-${subjectId}`
          const existing = subjectDayMap.get(key)
          if (existing) {
            existing.count++
            existing.totalMinutes += minutesPerSubject
          } else {
            subjectDayMap.set(key, {
              count: 1,
              totalMinutes: minutesPerSubject,
              date: parseISO(session.startTime),
              subjectId,
              projectName: sessionContext,
            })
          }
        }
      }
      return Array.from(subjectDayMap.entries())
        .map(([, group]) => {
          const subject = getSubjectById(group.subjectId)
          const totalHours = Math.round(group.totalMinutes / 6) / 10
          const hourLabel = totalHours >= 1 ? `${totalHours}h` : `${Math.round(group.totalMinutes)}m`
          const meta = group.count > 1
            ? `${group.count} sessions · ${hourLabel} · ${group.projectName}`
            : `${hourLabel} · ${group.projectName}`
          return {
            id: `session-${group.subjectId}-${format(group.date, "yyyy-MM-dd")}`,
            title: subject?.shortCode ?? group.subjectId,
            meta,
            date: group.date,
            color: subject?.color ?? CALENDAR_SESSION_COLOR,
            kind: "session" as const,
          }
        })
    })(),
    ...events
      .filter((event) => !event.isFinished && isMonthItemVisible(parseISO(event.startTime)))
      .map((event) => {
        const subject = getSubjectById(event.subjectId)
        const eventInfo = getEventTypeInfo(event.eventType)
        const startDate = parseISO(event.startTime)
        const isMultiDay = event.endTime && format(startDate, "yyyy-MM-dd") !== format(parseISO(event.endTime), "yyyy-MM-dd")
        let meta: string
        if (isMultiDay && event.endTime) {
          const endDate = parseISO(event.endTime)
          const dayCount = differenceInDays(endDate, startDate) + 1
          meta = `${eventInfo.label} · ${format(startDate, "MMM d")}–${format(endDate, "MMM d")} · All day (${dayCount}d)`
        } else {
          const startStr = format(startDate, "MMM d, h:mm a")
          const endStr = event.endTime ? format(parseISO(event.endTime), "h:mm a") : null
          meta = endStr
            ? `${eventInfo.label} · ${startStr} – ${endStr}`
            : `${eventInfo.label} · ${startStr}`
        }
        return {
          id: `event-${event.id}`,
          title: event.title,
          meta,
          date: startDate,
          color: subject?.color ?? eventInfo.color,
          kind: "event" as const,
          event,
        }
      }),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())
  const monthBriefPreview = monthBriefItems.slice(0, 4)
  const monthStudyMinutes = sessions
    .filter((session) => session.status === "planned" && isMonthItemVisible(parseISO(session.startTime)))
    .reduce((total, session) => {
      const minutes = getSessionEffectiveMinutes(session)
      return total + minutes
    }, 0)
  const monthStudyHours = Math.round(monthStudyMinutes / 60 * 10) / 10
  const monthBusyDays = new Set(monthBriefItems.map((item) => format(item.date, "yyyy-MM-dd"))).size
  const monthAssessments = monthBriefItems.filter((item) => item.kind === "assessment").length
  const prepBalanceBySubject = new Map<string, PrepBalanceItem>()

  const ensurePrepBalanceItem = (subjectId: string) => {
    const existing = prepBalanceBySubject.get(subjectId)
    if (existing) return existing
    const subject = getSubjectById(subjectId)
    const nextItem: PrepBalanceItem = {
      subjectId,
      shortCode: subject?.shortCode ?? subjectId,
      name: subject?.name ?? subjectId,
      color: subject?.color ?? "var(--primary)",
      assessmentCount: 0,
      plannedMinutes: 0,
    }
    prepBalanceBySubject.set(subjectId, nextItem)
    return nextItem
  }

  const applyNextPrepItem = (item: PrepBalanceItem, title: string, date: Date, source: { projectId?: string; event?: CalendarEvent }) => {
    if (!item.nextDate || date < item.nextDate) {
      item.nextTitle = title
      item.nextDate = date
      item.projectId = source.projectId
      item.event = source.event
    }
  }

  const hasVisibleAssessmentDueWithinPrepWindow = (subjectId: string, sessionStart: Date) => {
    const windowEnd = new Date(sessionStart.getTime() + PREP_COMPLETED_CREDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const projectMatch = projectsWithDeadlines.some((project) => {
      if (!project.deadline || project.subjectId !== subjectId) return false
      const dueDate = parseISO(project.deadline)
      return isMonthItemVisible(dueDate) && dueDate >= sessionStart && dueDate <= windowEnd
    })
    if (projectMatch) return true

    return events.some((event) => {
      if (event.isFinished || event.eventType === "event" || event.subjectId !== subjectId) return false
      const dueDate = parseISO(event.startTime)
      return isMonthItemVisible(dueDate) && dueDate >= sessionStart && dueDate <= windowEnd
    })
  }

  projectsWithDeadlines.forEach((project) => {
    if (!project.deadline || !project.subjectId) return
    const deadlineDate = parseISO(project.deadline)
    if (!isMonthItemVisible(deadlineDate)) return
    const item = ensurePrepBalanceItem(project.subjectId)
    item.assessmentCount += 1
    applyNextPrepItem(item, project.name, deadlineDate, { projectId: project.id })
  })

  events.forEach((event) => {
    if (event.isFinished || event.eventType === "event" || !event.subjectId) return
    const eventDate = parseISO(event.startTime)
    if (!isMonthItemVisible(eventDate)) return
    const item = ensurePrepBalanceItem(event.subjectId)
    item.assessmentCount += 1
    applyNextPrepItem(item, event.title, eventDate, { event })
  })

  sessions.forEach((session) => {
    if (session.status !== "planned" && session.status !== "completed") return
    const sessionStart = parseISO(session.startTime)
    const project = session.projectId ? projects.find((candidate) => candidate.id === session.projectId) : undefined
    const subjectIds = getSessionSubjectIds(session, project)
    if (subjectIds.length === 0) return
    const creditedSubjectIds = session.status === "planned"
      ? subjectIds
      : subjectIds.filter((subjectId) => hasVisibleAssessmentDueWithinPrepWindow(subjectId, sessionStart))
    if (session.status === "planned" && !isMonthItemVisible(sessionStart)) return
    const minutes = getSessionEffectiveMinutes(session)
    const minutesPerSubject = minutes / subjectIds.length
    creditedSubjectIds.forEach((subjectId) => {
      ensurePrepBalanceItem(subjectId).plannedMinutes += minutesPerSubject
    })
  })

  const prepBalanceItems = Array.from(prepBalanceBySubject.values())
    .filter((item) => item.assessmentCount > 0)
    .sort((a, b) => {
      const pressureDelta = b.assessmentCount - a.assessmentCount
      if (pressureDelta !== 0) return pressureDelta
      const studyDelta = a.plannedMinutes - b.plannedMinutes
      if (studyDelta !== 0) return studyDelta
      return a.shortCode.localeCompare(b.shortCode)
    })
    .slice(0, 4)
  const prepBalanceNeedsAttention = prepBalanceItems.filter((item) => item.plannedMinutes < item.assessmentCount * 90).length

  const handleMonthBriefSelect = (item: MonthBriefItem) => {
    if (item.projectId) {
      onSelectProject(item.projectId)
      return
    }
    if (item.session) {
      onSelectSession(item.session)
      return
    }
    if (item.event) {
      onSelectEvent(item.event)
      return
    }
    // Grouped session item — navigate to the day
    setSelectedDate(format(item.date, "yyyy-MM-dd"))
    clearEventSelection()
  }

  const handlePrepBalanceSelect = (item: PrepBalanceItem) => {
    if (item.projectId) {
      onSelectProject(item.projectId)
      return
    }
    if (item.event) {
      onSelectEvent(item.event)
      return
    }
    onNewSession(selectedCalendarDate)
  }

  const handlePrevMonth = () => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1))
  const handleNextMonth = () => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1))
  const handleToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    setSelectedDate(getLocalDateValue(today))
  }

  const handleOpenTextPlanner = useCallback(() => {
    setTextPlannerTitle("Text to Events")
    setTextPlannerDescription("Paste a notice, rough plan, or teacher message. Review drafts before adding them.")

    setTextPlannerInitialText("")
    setTextPlannerOpen(true)
  }, [])

  const handlePrioritySelect = (item: PriorityItem) => {
    if (item.sessionId) {
      const session = sessions.find((candidate) => candidate.id === item.sessionId)
      if (session) {
        onSelectSession(session)
        return
      }
    }
    if (item.eventId) {
      const event = events.find((candidate) => candidate.id === item.eventId)
      if (event) {
        onSelectEvent(event)
        return
      }
    }
    if (item.projectId) {
      onSelectProject(item.projectId)
      return
    }
    onNewSession(selectedCalendarDate)
  }

  const eventBatchToolbar = selectedBatchCount > 0
    ? createPortal(
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-80 flex justify-center px-2 min-[900px]:px-4">
        <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-t-2xl border border-b-0 border-border/75 bg-popover/96 px-3 py-2 text-popover-foreground shadow-2xl shadow-black/16 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Check className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">Calendar selection</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {selectedBatchCount} selected from {selectedDate ? format(parseISO(selectedDate), "MMM d") : "calendar"}
                {selectedBatchSessions.length > 0 && selectedBatchEvents.length > 0
                  ? ` (${selectedBatchEvents.length} events, ${selectedBatchSessions.length} sessions)`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs"
              onClick={clearEventSelection}
              disabled={eventBatchSaving}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs text-destructive hover:text-destructive"
              onClick={handleDeleteSelectedEvents}
              disabled={eventBatchSaving}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs"
              onClick={handleMergeSelectedEvents}
              disabled={eventBatchSaving || !canMergeSelectedItems}
            >
              <Combine className="h-3.5 w-3.5" />
              Merge
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs text-primary-foreground"
              onClick={handleToggleSelectedEventsComplete}
              disabled={eventBatchSaving}
            >
              {allSelectedItemsComplete ? <X className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {allSelectedItemsComplete ? "Reopen" : "Complete"}
            </Button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <>
    <div className="h-full overflow-auto">
      <div className={cn(
        "px-5 pt-5 min-[1200px]:px-8 min-[1200px]:pt-7",
        selectedBatchCount > 0 ? "pb-24 min-[1200px]:pb-24" : "pb-8 min-[1200px]:pb-10",
      )}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2 min-[1200px]:mb-8 min-[1200px]:gap-3">
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
            <Button variant="outline" size="sm" onClick={() => setCopilotOpen(true)} className="h-8 gap-1.5 rounded-xl bg-background/45">
              <Brain className="h-3.5 w-3.5" />
              Assessment Copilot
            </Button>
            <Button variant="outline" size="sm" onClick={handleOpenTextPlanner} className="h-8 gap-1.5 rounded-xl bg-background/45">
              <Wand2 className="h-3.5 w-3.5" />
              Text to Events
            </Button>
            <Button variant="outline" size="sm" onClick={onNewProject} className="h-8 gap-1.5 rounded-xl bg-background/45">
              <Plus className="h-3.5 w-3.5" />
              Assessment
            </Button>
            <Button variant="outline" size="sm" onClick={() => onNewEvent(selectedCalendarDate)} className="h-8 gap-1.5 rounded-xl bg-background/45">
              <CalendarPlus className="h-3.5 w-3.5" />
              Event
            </Button>
            <Button size="sm" onClick={() => onNewSession(selectedCalendarDate)} className="h-8 gap-1.5 rounded-xl text-background bg-primary">
              <Calendar className="h-3.5 w-3.5" />
              Plan Session
            </Button>
          </div>
        </div>

        {overdueProjects.length > 0 && (
          <div className="mb-6 rounded-2xl border border-destructive/15 bg-destructive/8 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-3.5 w-3.5 text-destructive/70" />
              <span className="text-xs font-semibold text-destructive/80">
                {overdueProjects.length} overdue assessment{overdueProjects.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {overdueProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onSelectProject(p.id)}
                  className="rounded-md px-2.5 py-1 text-left text-xs font-medium transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/35"
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
            <div className="flex h-full flex-col gap-4 min-[1200px]:gap-5">
              <CalendarGrid
                currentMonth={currentMonth}
                calendarView={calendarView}
                selectedDate={selectedDate}
                deadlinesByDate={deadlinesByDate}
                sessionsByDate={sessionsByDate}
                eventsByDate={eventsByDate}
                events={events}
                projects={projects}
                onMoveEvent={onMoveEvent}
                onSetCalendarView={setCalendarView}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onToday={handleToday}
                onSelectDate={handleSelectCalendarDate}
                onSelectProject={onSelectProject}
                onSelectSession={onSelectSession}
                onSelectEvent={onSelectEvent}
              />

              {selectedDate && (
                <DayDetail
                  selectedDate={selectedDate}
                  deadlines={selectedDayDeadlines}
                  sessions={selectedDaySessions}
                  events={events}
                  projects={projects}
                  calendarSelectionMode={calendarSelectionMode}
                  selectedEventIdSet={selectedEventIdSet}
                  selectedSessionIdSet={selectedSessionIdSet}
                  onClose={() => {
                    setSelectedDate(null)
                    clearEventSelection()
                  }}
                  onToggleSelectionMode={() => setCalendarSelectionMode(true)}
                  onClearSelection={clearEventSelection}
                  onToggleEventSelection={handleToggleEventSelection}
                  onToggleSessionSelection={handleToggleSessionSelection}
                  onSelectProject={onSelectProject}
                  onSelectSession={onSelectSession}
                  onSelectEvent={onSelectEvent}
                />
              )}

              <MonthBrief
                currentMonth={currentMonth}
                items={monthBriefItems}
                previewItems={monthBriefPreview}
                monthAssessments={monthAssessments}
                monthStudyHours={monthStudyHours}
                monthBusyDays={monthBusyDays}
                onSelectItem={handleMonthBriefSelect}
                onPlanSession={() => onNewSession(selectedCalendarDate)}
              />

              <PrepBalance
                items={prepBalanceItems}
                needsAttention={prepBalanceNeedsAttention}
                onSelectItem={handlePrepBalanceSelect}
                onPlanSession={() => onNewSession(selectedCalendarDate)}
              />
            </div>
          </Card>

          <div className="space-y-3 min-[1200px]:space-y-4">
            <QuickLinks />

            {timetableConfig?.enabled && (() => {
              const dayLabel = getDayLabelForDate(new Date(), timetableConfig.day1Starts, timetableConfig.holidays)
              if (dayLabel === null) return null
              const entries = getTimetableEntriesForDay(dayLabel, timetableConfig.entries)
              if (entries.length === 0) return null
              const periods = entries
                .flatMap((e) => e.periods)
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
              const periodInfo = getCurrentPeriodInfo(periods)
              return (
                <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
                  <h3 className="mb-2.5 flex items-center gap-1.5 font-heading text-sm font-semibold">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Today&apos;s Timetable · Day {dayLabel}
                    <button
                      onClick={onGoTimetable}
                      className="ml-auto text-xs text-muted-foreground hover:underline transition-colors"
                    >
                      View timetable
                    </button>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </h3>
                  <div className="space-y-1">
                    {periods.map((period, idx) => {
                      const subject = getSubjectById(period.subject)
                      const isCurrent = periodInfo.current?.startTime === period.startTime
                        && periodInfo.current?.subject === period.subject
                      const isNext = periodInfo.next?.startTime === period.startTime
                        && periodInfo.next?.subject === period.subject
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "relative flex items-center gap-2 rounded-lg px-2.5 py-1.5",
                            isCurrent
                              ? "bg-primary/[0.06] ring-1 ring-primary/15"
                              : "bg-background/40",
                          )}
                        >
                          {/* Subject color accent bar */}
                          {subject && (
                            <div
                              className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                              style={{ backgroundColor: subject.color }}
                            />
                          )}

                          {/* Current period pulsing dot */}
                          {isCurrent && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
                          )}

                          {/* Time */}
                          <span className="w-14 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                            {formatTime12(period.startTime)}
                          </span>

                          {/* Subject name */}
                          <span className="min-w-0 truncate text-xs" style={{ color: subject?.color }}>
                            {subject ? subject.name : period.subject}
                          </span>

                          {/* End time or Up next badge */}
                          <span className="ml-auto shrink-0 text-xs tabular-nums">
                            {isNext && !isCurrent ? (
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
                                Up next
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">
                                {formatTime12(period.endTime)}
                              </span>
                            )}
                          </span>

                          {/* Location */}
                          {period.location && (
                            <span className="hidden shrink-0 items-center gap-0.5 truncate text-xs text-muted-foreground/50 sm:flex">
                              <MapPin className="h-2.5 w-2.5" />
                              {period.location}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Next period countdown */}
                  {periodInfo.current && periodInfo.remainingMinutes > 0 && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/[0.04] px-2.5 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                      <span className="text-xs text-muted-foreground">
                        {periodInfo.next ? (
                          <>
                            <span className="font-medium text-foreground">{periodInfo.remainingMinutes}m</span> remaining —{" "}
                            <span className="text-muted-foreground/70">{getSubjectById(periodInfo.next.subject)?.name ?? periodInfo.next.subject}</span> at{" "}
                            <span className="tabular-nums">{formatTime12(periodInfo.next.startTime)}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-foreground">{periodInfo.remainingMinutes}m</span> remaining
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}

            <StudyPriorities
              items={priorityItems}
              isOpen={prioritiesOpen}
              onToggle={() => setPrioritiesOpen((current) => !current)}
              onSelectItem={handlePrioritySelect}
            />

            <RecentActivity
              items={recentActivity}
              isOpen={recentActivityOpen}
              onToggle={() => setRecentActivityOpen((current) => !current)}
              onSelectSession={onSelectSession}
              onSelectEvent={onSelectEvent}
            />

            {dueThisWeek.length > 0 && (
              <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
                <h3 className="mb-2.5 font-heading text-sm font-semibold">Due This Week</h3>
                <div className="space-y-1">
                  {dueThisWeek.map((p) => {
                    const subject = getSubjectById(p.subjectId)
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelectProject(p.id)}
                        className="group w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">{p.name}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {formatDeadline(p.deadline!)}
                            </p>
                          </div>
                          {subject && (
                            <div
                              className="text-sm px-1.5 py-0.5 rounded whitespace-nowrap font-medium shrink-0"
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
              <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
                <h3 className="mb-2.5 flex items-center gap-2 font-heading text-sm font-semibold">
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
                        <p className="text-sm text-muted-foreground mt-0.5">{project?.name ?? subjects}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(parseISO(session.startTime), "MMM d, h:mm a")}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {upcomingEvents.length > 0 && (
              <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
                <h3 className="mb-2.5 flex items-center gap-2 font-heading text-sm font-semibold">
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
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {format(parseISO(event.startTime), "MMM d, h:mm a")}
                            </p>
                            {event.location && (
                              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
                                <MapPin className="h-2.5 w-2.5" />
                                <span className="truncate">{event.location}</span>
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className="text-sm px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
                              style={{
                                backgroundColor: eventInfo.color + "14",
                                color: eventInfo.color,
                              }}
                            >
                              {eventInfo.label}
                            </span>
                            {subject && (
                              <span
                                className="text-sm px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
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
              <div className="rounded-[1.25rem] border border-dashed border-border bg-background/30 p-3.5">
                <p className="text-xs text-muted-foreground">
                  Nothing due this week. Use the buttons above to add an assessment, event, or session.
                </p>
              </div>
            )}

            <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
              <h3 className="mb-2.5 font-heading text-sm font-semibold">Summary</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-semibold tabular-nums leading-none">{activeProjects.length}</p>
                  <p className="text-sm text-muted-foreground mt-1">assessments</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums leading-none">{completedSessions}</p>
                  <p className="text-sm text-muted-foreground mt-1">completed</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums leading-none">{totalStudyHours}<span className="text-xs font-normal">h</span></p>
                  <p className="text-sm text-muted-foreground mt-1">studied</p>
                </div>
              </div>

              {topSubjects.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2 flex-wrap">
                    {topSubjects.map(([subjectId, info]) => {
                      const subject = getSubjectById(subjectId)
                      return (
                        <span
                          key={subjectId}
                          className="text-sm px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: subject?.color + "14",
                            color: subject?.color,
                          }}
                        >
                          {info.icon} {info.shortCode}
                        </span>
                      )
                    })}
                    <span className="text-sm text-muted-foreground ml-auto tabular-nums">
                      {topSubjects.length > 0 && `${Math.round(topSubjects.reduce((acc, [, info]) => acc + info.minutes, 0) / 60 * 10) / 10}h total`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    <AssessmentCopilot
      open={copilotOpen}
      onOpenChange={setCopilotOpen}
      projects={projects}
      sessions={sessions}
      events={events}
      priorityItems={priorityItems}
      prepBalanceItems={prepBalanceItems}
      planningSubjects={planningSubjects}
      currentMonth={currentMonth}
      onCreateStudySessions={onCreateStudySessions}
    />

    <TextEventPlanner key={textPlannerOpen ? "planner-open" : "planner-closed"}
      open={textPlannerOpen}
      onOpenChange={setTextPlannerOpen}
      title={textPlannerTitle}
      description={textPlannerDescription}

      initialText={textPlannerInitialText}
      projects={projects}
      planningSubjects={planningSubjects}
      onCreateEvents={onCreateEvents}
      onCreateStudySessions={onCreateStudySessions}
    />

    {eventBatchToolbar}
    </>
  )
}
