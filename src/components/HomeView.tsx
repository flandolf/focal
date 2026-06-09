import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, AlertCircle, CalendarPlus, MapPin, ExternalLink, Link, BookOpen, GraduationCap, FileText, Globe, Video, Calculator, Palette, FlaskConical, Music, Dumbbell, Pencil, Trash2, Target, Activity, Wand2, Brain, Check, X, CheckCircle2, Combine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { formatDeadline, isOverdue, getSubjectById, getEventTypeInfo, getSessionSubjectIds } from "@/lib/utils"
import { AssessmentCopilot } from "@/components/AssessmentCopilot"
import { TextEventPlanner } from "@/components/TextEventPlanner"
import { getPriorityItems } from "@/lib/studyPriority"
import type { CalendarEvent, PriorityItem, PriorityUrgency, Project, StudySession, Subject } from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"
import { cn, getLocalDateValue } from "@/lib/utils"

interface QuickLink {
  id: string
  label: string
  url: string
  icon: string
  color: string
}

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

interface PrepBalanceItem {
  subjectId: string
  shortCode: string
  name: string
  color: string
  assessmentCount: number
  plannedMinutes: number
  nextTitle?: string
  nextDate?: Date
  projectId?: string
  event?: CalendarEvent
}

const QUICK_LINKS_KEY = "focal-quick-links"
const PREP_COMPLETED_CREDIT_WINDOW_DAYS = 7

const ICON_OPTIONS = [
  { name: "BookOpen", component: BookOpen },
  { name: "GraduationCap", component: GraduationCap },
  { name: "FileText", component: FileText },
  { name: "Globe", component: Globe },
  { name: "Video", component: Video },
  { name: "Calculator", component: Calculator },
  { name: "Palette", component: Palette },
  { name: "FlaskConical", component: FlaskConical },
  { name: "Music", component: Music },
  { name: "Dumbbell", component: Dumbbell },
  { name: "ExternalLink", component: ExternalLink },
  { name: "Link", component: Link },
]

const COLOR_OPTIONS = [
  { name: "Gray", value: "#71717a" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
]

const DEFAULT_QUICK_LINK_COLOR = "#71717a"
const CALENDAR_FALLBACK_COLOR = "var(--muted-foreground)"
const CALENDAR_SESSION_COLOR = "var(--primary)"

function getIconComponent(name: string) {
  return ICON_OPTIONS.find((o) => o.name === name)?.component ?? Link
}

function getQuickLinkDestination(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url.replace(/^https?:\/\//, "").split(/[/?#]/)[0] || url
  }
}


function getUrgencyLabel(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical": return "Critical"
    case "high": return "High"
    case "medium": return "Medium"
    case "low": return "Low"
  }
}

function getUrgencyClassName(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical": return "bg-destructive/12 text-destructive"
    case "high": return "bg-amber-500/14 text-amber-700 dark:text-amber-300"
    case "medium": return "bg-primary/12 text-primary"
    case "low": return "bg-muted text-muted-foreground"
  }
}

function formatTimeRange(startTime: string, endTime?: string) {
  const startLabel = format(parseISO(startTime), "h:mm a")
  if (!endTime) return startLabel
  return `${startLabel} - ${format(parseISO(endTime), "h:mm a")}`
}


function getPlanningSubjects(projects: Project[]): Subject[] {
  const subjectsById = new Map(VCE_SUBJECTS.map((subject) => [subject.id, subject]))
  projects.forEach((project) => {
    if (!project.subjectId || subjectsById.has(project.subjectId)) return
    const subject = getSubjectById(project.subjectId)
    if (subject) subjectsById.set(subject.id, subject)
  })
  return Array.from(subjectsById.values())
}








function getRelativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  if (Number.isNaN(then)) return ""
  const diffMs = now - then
  if (diffMs < 0) return "just now"
  const minutes = Math.floor(diffMs / (1000 * 60))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  if (days < 7) return `${days}d ago`
  return format(new Date(timestamp), "MMM d")
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
}: HomeViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(() => getLocalDateValue(new Date()))
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() => {
    const stored = localStorage.getItem(QUICK_LINKS_KEY)
    return stored ? (JSON.parse(stored) as QuickLink[]) : []
  })
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null)
  const [linkLabel, setLinkLabel] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [linkIcon, setLinkIcon] = useState("Link")
  const [linkColor, setLinkColor] = useState(DEFAULT_QUICK_LINK_COLOR)
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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; link: QuickLink } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, link: QuickLink) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, link })
  }, [setContextMenu])

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null)
    }
    document.addEventListener("click", handleClick)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("click", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [contextMenu])

  useEffect(() => {
    localStorage.setItem(QUICK_LINKS_KEY, JSON.stringify(quickLinks))
  }, [quickLinks])

  const handleSaveLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) return
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`
    if (editingLink) {
      setQuickLinks((prev) =>
        prev.map((l) => (l.id === editingLink.id ? { ...l, label: linkLabel.trim(), url, icon: linkIcon, color: linkColor } : l))
      )
    } else {
      setQuickLinks((prev) => [...prev, { id: crypto.randomUUID(), label: linkLabel.trim(), url, icon: linkIcon, color: linkColor }])
    }
    setLinkDialogOpen(false)
    setEditingLink(null)
    setLinkLabel("")
    setLinkUrl("")
    setLinkIcon("Link")
    setLinkColor(DEFAULT_QUICK_LINK_COLOR)
  }

  const handleDeleteLink = (id: string) => {
    setQuickLinks((prev) => prev.filter((l) => l.id !== id))
  }

  const handleEditLink = (link: QuickLink) => {
    setEditingLink(link)
    setLinkLabel(link.label)
    setLinkUrl(link.url)
    setLinkIcon(link.icon)
    setLinkColor(link.color)
    setLinkDialogOpen(true)
  }

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
  const selectedEventIdSet = useMemo(() => new Set(selectedEventIds), [selectedEventIds])
  const selectedSessionIdSet = useMemo(() => new Set(selectedSessionIds), [selectedSessionIds])
  const selectedDayDeadlines = selectedDate ? deadlinesByDate[selectedDate] ?? [] : []
  const selectedDaySessions = selectedDate ? sessionsByDate[selectedDate] ?? [] : []
  const selectedDayEvents = selectedDate ? eventsByDate[selectedDate] ?? [] : []
  const selectedDayHasItems = selectedDayDeadlines.length > 0 || selectedDaySessions.length > 0 || selectedDayEvents.length > 0
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
    : monthStart
  const isMonthItemVisible = (date: Date) => date >= monthAgendaStart && date <= monthEnd
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
    ...sessions
      .filter((session) => session.status === "planned" && isMonthItemVisible(parseISO(session.startTime)))
      .map((session) => {
        const project = session.projectId ? projects.find((candidate) => candidate.id === session.projectId) : undefined
        const subjectIds = getSessionSubjectIds(session, project)
        const subject = getSubjectById(subjectIds[0])
        const durationMinutes = Math.max(0, Math.round((parseISO(session.endTime).getTime() - parseISO(session.startTime).getTime()) / (1000 * 60)))
        const subjectContext = subjectIds.map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId).join(", ")
        const sessionContext = project?.name ?? (subjectContext || "Study session")
        return {
          id: `session-${session.id}`,
          title: session.title,
          meta: `${durationMinutes} min · ${sessionContext}`,
          date: parseISO(session.startTime),
          color: subject?.color ?? CALENDAR_SESSION_COLOR,
          kind: "session" as const,
          session,
        }
      }),
    ...events
      .filter((event) => !event.isFinished && isMonthItemVisible(parseISO(event.startTime)))
      .map((event) => {
        const subject = getSubjectById(event.subjectId)
        const eventInfo = getEventTypeInfo(event.eventType)
        return {
          id: `event-${event.id}`,
          title: event.title,
          meta: `${eventInfo.label} · ${format(parseISO(event.startTime), "MMM d, h:mm a")}`,
          date: parseISO(event.startTime),
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
      const minutes = Math.max(0, Math.round((parseISO(session.endTime).getTime() - parseISO(session.startTime).getTime()) / (1000 * 60)))
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
    if (creditedSubjectIds.length === 0) return
    const minutes = Math.max(0, Math.round((parseISO(session.endTime).getTime() - sessionStart.getTime()) / (1000 * 60)))
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
    }
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
              <p className="text-micro text-muted-foreground tabular-nums">
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
              className="h-8 gap-1.5 rounded-xl px-2.5 text-xs"
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

        {/* Overdue banner — not a card, a compact callout */}
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-sm text-foreground/90">{format(currentMonth, "MMMM yyyy")}</h3>
                  <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
                    <span className="rounded-md bg-muted/65 px-1.5 py-0.5 tabular-nums">{monthAssessments} assessments</span>
                    <span className="rounded-md bg-muted/65 px-1.5 py-0.5 tabular-nums">{monthBusyDays} busy days</span>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="flex h-6 items-center justify-center text-micro font-medium uppercase text-muted-foreground/70">
                      {day}
                    </div>
                  ))}
                  {calendarPad.map((_, i) => (
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
                        onClick={() => handleSelectCalendarDate(dateKey)}
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

                {selectedDate && (
                    <div className="rounded-2xl border border-border/70 bg-muted/18 p-3 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {format(parseISO(selectedDate), "EEEE")}
                          </p>
                          <p className="mt-0.5 text-caption text-muted-foreground">
                            {format(parseISO(selectedDate), "MMMM d")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {(selectedDayEvents.length > 0 || selectedDaySessions.length > 0) && (
                            <Button
                              variant={calendarSelectionMode ? "secondary" : "ghost"}
                              size="sm"
                              className="h-7 rounded-lg px-2 text-xs"
                              onClick={() => {
                                if (calendarSelectionMode) {
                                  clearEventSelection()
                                  return
                                }
                                setCalendarSelectionMode(true)
                              }}
                            >
                              {calendarSelectionMode ? "Cancel" : "Select"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 rounded-lg p-0"
                            onClick={() => {
                              setSelectedDate(null)
                              clearEventSelection()
                            }}
                            aria-label="Close selected day"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
                        <div className="rounded-lg bg-background/42 px-2 py-1.5">
                          <p className="text-xs font-semibold tabular-nums">{selectedDayDeadlines.length}</p>
                          <p className="text-micro leading-3 text-muted-foreground">due</p>
                        </div>
                        <div className="rounded-lg bg-background/42 px-2 py-1.5">
                          <p className="text-xs font-semibold tabular-nums">{selectedDayEvents.length}</p>
                          <p className="text-micro leading-3 text-muted-foreground">events</p>
                        </div>
                        <div className="rounded-lg bg-background/42 px-2 py-1.5">
                          <p className="text-xs font-semibold tabular-nums">{selectedDaySessions.length}</p>
                          <p className="text-micro leading-3 text-muted-foreground">sessions</p>
                        </div>
                      </div>
                      {calendarSelectionMode && (
                        <div className="mb-2 rounded-xl border border-primary/20 bg-primary/8 px-2.5 py-2">
                          <p className="text-micro font-medium text-primary">
                            Pick events or sessions below. Actions appear at the bottom of the window.
                          </p>
                        </div>
                      )}
                      {selectedDayHasItems ? (
                        <div className="space-y-2">
                          {selectedDayDeadlines.map((p) => {
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
                          {selectedDaySessions.map((s) => {
                            const project = projects.find((p) => p.id === s.projectId)
                            const subjects = getSessionSubjectIds(s, project)
                              .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
                              .join(", ")
                            const selected = selectedSessionIdSet.has(s.id)
                            return (
                              <button
                                key={s.id}
                                onClick={() => {
                                  if (calendarSelectionMode) {
                                    handleToggleSessionSelection(s.id)
                                    return
                                  }
                                  onSelectSession(s)
                                }}
                                className={cn(
                                  "w-full rounded-xl border p-2 text-left transition-colors",
                                  selected
                                    ? "border-primary/65 bg-primary/10 ring-1 ring-primary/25"
                                    : "border-blue-200/40 bg-blue-50/20 hover:border-blue-400/60 dark:border-blue-900/40 dark:bg-blue-950/20"
                                )}
                              >
                                <div className="flex items-start gap-2">
                                  {calendarSelectionMode && (
                                    <span
                                      className={cn(
                                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                                        selected
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-border bg-background/50"
                                      )}
                                      aria-hidden="true"
                                    >
                                      {selected && <Check className="h-3 w-3" />}
                                    </span>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="min-w-0 truncate text-xs font-medium">{s.title}</p>
                                      {s.status === "completed" && (
                                        <span className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                                          Done
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-micro text-muted-foreground mt-0.5">
                                      {project?.name ?? subjects}
                                    </p>
                                    <p className="text-micro text-muted-foreground mt-1">
                                      {formatTimeRange(s.startTime, s.endTime)}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                          {selectedDayEvents.map((event) => {
                            const subject = getSubjectById(event.subjectId)
                            const eventInfo = getEventTypeInfo(event.eventType)
                            const selected = selectedEventIdSet.has(event.id)
                            return (
                              <button
                                key={event.id}
                                onClick={() => {
                                  if (calendarSelectionMode) {
                                    handleToggleEventSelection(event.id)
                                    return
                                  }
                                  onSelectEvent(event)
                                }}
                                className={cn(
                                  "w-full rounded-xl border p-2 text-left transition-colors",
                                  selected
                                    ? "border-primary/65 bg-primary/10 ring-1 ring-primary/25"
                                    : "border-border/70 bg-background/30 hover:border-primary/50 hover:bg-accent/30"
                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex min-w-0 items-start gap-2">
                                    {calendarSelectionMode && (
                                      <span
                                        className={cn(
                                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                                          selected
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border bg-background/50"
                                        )}
                                        aria-hidden="true"
                                      >
                                        {selected && <Check className="h-3 w-3" />}
                                      </span>
                                    )}
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium">{event.title}</p>
                                      <p className="text-micro text-muted-foreground mt-0.5">
                                        {formatTimeRange(event.startTime, event.endTime)}
                                        {event.location ? ` · ${event.location}` : ""}
                                      </p>
                                    </div>
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
                                    {event.isFinished && (
                                      <span className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                                        Done
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border bg-background/24 px-3 py-3">
                          <p className="text-xs text-muted-foreground">No calendar items scheduled.</p>
                        </div>
                      )}
                    </div>
                )}

                <div className="border-t border-border/70 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-sm font-semibold">Month Brief</h3>
                      <p className="mt-0.5 text-caption text-muted-foreground">
                        {monthBriefItems.length > 0
                          ? `${monthBriefItems.length} scheduled item${monthBriefItems.length === 1 ? "" : "s"} in ${format(currentMonth, "MMMM")}`
                          : `No scheduled items left in ${format(currentMonth, "MMMM")}`}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-right">
                      <div>
                        <p className="text-sm font-semibold tabular-nums leading-none">{monthAssessments}</p>
                        <p className="mt-1 text-micro text-muted-foreground">assessments</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums leading-none">{monthStudyHours}<span className="text-micro font-normal">h</span></p>
                        <p className="mt-1 text-micro text-muted-foreground">planned</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold tabular-nums leading-none">{monthBusyDays}</p>
                        <p className="mt-1 text-micro text-muted-foreground">busy days</p>
                      </div>
                    </div>
                  </div>

                  {monthBriefPreview.length > 0 ? (
                    <div className="mt-3 grid gap-2 min-[1350px]:grid-cols-2">
                      {monthBriefPreview.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleMonthBriefSelect(item)}
                          className="flex min-w-0 items-center gap-3 rounded-xl border border-border/55 bg-background/24 px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                        >
                          <div className="flex h-9 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/55 text-center">
                            <span className="text-micro font-medium uppercase leading-none text-muted-foreground">{format(item.date, "MMM")}</span>
                            <span className="mt-0.5 text-sm font-semibold leading-none tabular-nums">{format(item.date, "d")}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                              <p className="truncate text-xs font-medium">{item.title}</p>
                            </div>
                            <p className="mt-0.5 truncate text-micro text-muted-foreground">{item.meta}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-background/24 px-3 py-3">
                      <p className="text-xs text-muted-foreground">Use this month to get ahead before the next assessment cluster.</p>
                      <Button variant="outline" size="sm" onClick={() => onNewSession(selectedCalendarDate)} className="h-7 rounded-xl px-2.5 text-xs">
                        <Calendar className="mr-1.5 h-3 w-3" />
                        Plan session
                      </Button>
                    </div>
                  )}

                  <div className="mt-4 border-t border-border/55 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-heading text-sm font-semibold">Prep Balance</h3>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          {prepBalanceItems.length > 0
                            ? `${prepBalanceNeedsAttention} subject${prepBalanceNeedsAttention === 1 ? "" : "s"} need more planned time`
                            : "No assessment pressure to balance this month"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => onNewSession(selectedCalendarDate)} className="h-7 rounded-xl px-2.5 text-xs">
                          <Calendar className="mr-1.5 h-3 w-3" />
                          Plan
                        </Button>
                      </div>
                    </div>

                    {prepBalanceItems.length > 0 ? (
                      <div className="mt-3 grid gap-2 min-[1350px]:grid-cols-2">
                        {prepBalanceItems.map((item) => {
                          const targetMinutes = item.assessmentCount * 90
                          const plannedHours = Math.round(item.plannedMinutes / 60 * 10) / 10
                          const targetHours = Math.round(targetMinutes / 60 * 10) / 10
                          const progress = targetMinutes > 0 ? Math.min(100, Math.round(item.plannedMinutes / targetMinutes * 100)) : 100
                          const nextDateLabel = item.nextDate ? format(item.nextDate, "MMM d") : "No date"
                          return (
                            <button
                              key={item.subjectId}
                              type="button"
                              onClick={() => handlePrepBalanceSelect(item)}
                              className="min-w-0 rounded-xl border border-border/55 bg-background/24 px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                    <p className="truncate text-xs font-medium">
                                      {item.shortCode}
                                      <span className="ml-1.5 text-muted-foreground">/ {item.name}</span>
                                    </p>
                                  </div>
                                  <p className="mt-0.5 truncate text-micro text-muted-foreground">
                                    {item.nextTitle ? `${item.nextTitle} · ${nextDateLabel}` : "Assessment prep"}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-xs font-semibold tabular-nums">{plannedHours}<span className="text-micro font-normal">h</span></p>
                                  <p className="mt-0.5 text-micro leading-3 text-muted-foreground">of {targetHours}h</p>
                                </div>
                              </div>
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/65">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${progress}%`,
                                    backgroundColor: item.color,
                                  }}
                                />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-border bg-background/24 px-3 py-3">
                        <p className="text-xs text-muted-foreground">Add assessments or planned sessions to see subject prep balance here.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-3 min-[1200px]:space-y-4">
            <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading text-sm font-semibold flex items-center gap-2">
                  <Link className="h-3.5 w-3.5 text-muted-foreground" />
                  Quick Links
                </h3>
                {quickLinks.length < 6 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setEditingLink(null)
                      setLinkLabel("")
                      setLinkUrl("")
                      setLinkIcon("Link")
                      setLinkColor(DEFAULT_QUICK_LINK_COLOR)
                      setLinkDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>
              {quickLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add shortcuts to subject resources, VCAA pages, or anything you use often.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {quickLinks.slice(0, 6).map((link) => {
                    const IconComp = getIconComponent(link.icon)
                    const destination = getQuickLinkDestination(link.url)
                    return (
                      <div key={link.id} className="group relative min-w-0">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onContextMenu={(e) => handleContextMenu(e, link)}
                          className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border/60 p-3 text-center transition-all hover:border-border hover:shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                          style={{ backgroundColor: link.color + "18" }}
                          aria-label={`Open ${link.label}: ${destination}`}
                        >
                          <IconComp className="h-5 w-5 transition-colors" style={{ color: link.color }} />
                          <span className="text-micro w-full truncate transition-colors" style={{ color: link.color }}>
                            {link.label}
                          </span>
                          <span className="w-full truncate text-micro leading-none text-muted-foreground/70">
                            {destination}
                          </span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleEditLink(link)}
                          onContextMenu={(e) => handleContextMenu(e, link)}
                          className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/80 backdrop-blur transition-all hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 group-hover:opacity-100"
                          aria-label={`Edit ${link.label}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={() => setPrioritiesOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              >
                <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  Study Priorities
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-micro leading-3 text-muted-foreground tabular-nums">{priorityItems.length}/7</span>
                  <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", prioritiesOpen && "rotate-90")} />
                </div>
              </button>
              {prioritiesOpen && (
                <div className="mt-2.5">
                  {priorityItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No urgent study actions. Add an assessment, plan a session, or review a completed one to sharpen the queue.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {priorityItems.map((item) => {
                        const subjectLabels = item.subjectIds
                          .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
                          .slice(0, 2)
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handlePrioritySelect(item)}
                            className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-medium">{item.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-micro text-muted-foreground">{item.reason}</p>
                              </div>
                              <span className={cn("shrink-0 rounded px-1 py-0 text-micro font-medium leading-3", getUrgencyClassName(item.urgency))}>
                                {getUrgencyLabel(item.urgency)}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1">
                              <span className="text-micro font-medium text-primary">{item.action}</span>
                              {subjectLabels.map((label) => (
                                <span key={label} className="rounded bg-muted/70 px-1 py-0 text-micro leading-3 text-muted-foreground">
                                  {label}
                                </span>
                              ))}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={() => setRecentActivityOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              >
                <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Recent Activity
                </h3>
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", recentActivityOpen && "rotate-90")} />
              </button>
              {recentActivityOpen && (
                <div className="mt-2.5 space-y-1">
                  {recentActivity.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Completed sessions and finished events will appear here.
                    </p>
                  ) : (
                    recentActivity.map((item) => (
                      <button
                        key={`${item.kind}-${item.id}`}
                        type="button"
                        onClick={() => item.session ? onSelectSession(item.session) : item.event ? onSelectEvent(item.event) : undefined}
                        className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{item.title}</p>
                            <p className="mt-0.5 truncate text-micro text-muted-foreground">{item.subtitle}</p>
                          </div>
                          <span className="shrink-0 text-micro leading-3 text-muted-foreground tabular-nums">
                            {getRelativeTime(item.timestamp)}
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

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
                  <p className="text-micro text-muted-foreground mt-1">assessments</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums leading-none">{completedSessions}</p>
                  <p className="text-micro text-muted-foreground mt-1">completed</p>
                </div>
                <div>
                  <p className="text-lg font-semibold tabular-nums leading-none">{totalStudyHours}<span className="text-xs font-normal">h</span></p>
                  <p className="text-micro text-muted-foreground mt-1">studied</p>
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
                          className="text-micro px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: subject?.color + "14",
                            color: subject?.color,
                          }}
                        >
                          {info.icon} {info.shortCode}
                        </span>
                      )
                    })}
                    <span className="text-micro text-muted-foreground ml-auto tabular-nums">
                      {topSubjects.length > 0 && `${Math.round(topSubjects.reduce((acc, [, info]) => acc + info.minutes, 0) / 60 * 10) / 10}h total`}
                    </span>
                  </div>
                </div>
              )}
            </div>

          
          </div>

          {contextMenu && (
            <div
              ref={contextMenuRef}
              className="fixed z-50 min-w-35 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{ top: contextMenu.y, left: contextMenu.x }}
            >
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => {
                  handleEditLink(contextMenu.link)
                  setContextMenu(null)
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => {
                  handleDeleteLink(contextMenu.link.id)
                  setContextMenu(null)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          )}

          <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingLink ? "Edit Link" : "Add Quick Link"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-1">
                <div className="grid gap-2">
                  <label className="text-control font-medium text-muted-foreground">Icon</label>
                  <div className="grid grid-cols-6 gap-2">
                    {ICON_OPTIONS.map((opt) => {
                      const IconComp = opt.component
                      return (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => setLinkIcon(opt.name)}
                          className={cn(
                            "flex h-10 w-full items-center justify-center rounded-lg border transition-colors",
                            linkIcon === opt.name
                              ? "border-primary/35 bg-primary/10 text-primary"
                              : "border-border/60 bg-background/40 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                          )}
                          aria-label={opt.name}
                          aria-pressed={linkIcon === opt.name}
                        >
                          <IconComp className="h-4 w-4" />
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-control font-medium text-muted-foreground">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLinkColor(opt.value)}
                        className={cn(
                          "h-8 w-8 rounded-full border-2 transition-transform",
                          linkColor === opt.value ? "scale-105 border-foreground" : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: opt.value }}
                        title={opt.name}
                        aria-label={opt.name}
                        aria-pressed={linkColor === opt.value}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-control font-medium text-muted-foreground">Label</label>
                  <Input
                    placeholder="e.g. VCAA English"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveLink()}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-control font-medium text-muted-foreground">URL</label>
                  <Input
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveLink()}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setLinkDialogOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveLink} disabled={!linkLabel.trim() || !linkUrl.trim()}>
                  {editingLink ? "Save" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
        </div>
      </div>
    </div>
    {eventBatchToolbar}
    </>
  )
}
