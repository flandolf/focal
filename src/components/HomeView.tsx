import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { addMinutes, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, AlertCircle, CalendarPlus, MapPin, ExternalLink, Link, BookOpen, GraduationCap, FileText, Globe, Video, Calculator, Palette, FlaskConical, Music, Dumbbell, Pencil, Trash2, Target, Activity, Wand2, Loader2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { getApiKey, getModel, getReasoningConfig } from "@/lib/settings"
import { formatDeadline, isOverdue, getSubjectById, getEventTypeInfo, getSessionSubjectIds } from "@/lib/utils"
import { getPriorityItems, getSubjectReadiness } from "@/lib/studyPriority"
import type { CalendarEvent, EventType, PriorityItem, PriorityUrgency, Project, StudySession, Subject, SubjectReadiness } from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"
import { cn } from "@/lib/utils"

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

interface TextEventDraft {
  kind: "event" | "session"
  title: string
  description?: string
  date: string
  startTime: string
  durationMinutes: number
  eventType: EventType
  subjectId?: string
  subjectIds: string[]
  projectId?: string
  location?: string
  topics?: string[]
  approved: boolean
}

type TextPlannerMode = "mixed" | "sessions"

const QUICK_LINKS_KEY = "focal-quick-links"
const VALID_EVENT_TYPES = new Set<EventType>(["sac", "exam", "assignment", "gat", "event"])
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
    case "critical":
      return "Critical"
    case "high":
      return "High"
    case "medium":
      return "Medium"
    case "low":
      return "Low"
  }
}

function getUrgencyClassName(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical":
      return "bg-destructive/12 text-destructive"
    case "high":
      return "bg-amber-500/14 text-amber-700 dark:text-amber-300"
    case "medium":
      return "bg-primary/12 text-primary"
    case "low":
      return "bg-muted text-muted-foreground"
  }
}

function getLocalDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function combineDateAndTime(dateValue: string, timeValue: string): Date | null {
  const dateParts = dateValue.split("-").map(Number)
  const timeParts = timeValue.split(":").map(Number)
  if (dateParts.length !== 3 || timeParts.length < 2) return null

  const [year, month, day] = dateParts
  const [hours, minutes] = timeParts
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
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

function parseTextEventResponse(content: string, subjectIds: string[], projectIds: string[]): TextEventDraft[] {
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid planner response")
  }

  const items = (parsed as { events?: unknown }).events
  if (!Array.isArray(items)) {
    throw new Error("Planner response missing events array")
  }

  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const record = item as Record<string, unknown>
    const title = typeof record.title === "string" ? record.title.trim() : ""
    const date = typeof record.date === "string" ? record.date.trim() : ""
    const startTime = typeof record.start_time === "string" ? record.start_time.trim() : ""
    const durationMinutes = typeof record.duration_minutes === "number" ? record.duration_minutes : 60
    const kind = record.item_type === "session" ? "session" : "event"
    const eventType = VALID_EVENT_TYPES.has(record.event_type as EventType) ? (record.event_type as EventType) : "event"
    const subjectId = typeof record.subject_id === "string" && subjectIds.includes(record.subject_id)
      ? record.subject_id
      : undefined
    const subjectIdsForDraft = Array.isArray(record.subject_ids)
      ? record.subject_ids.filter((id): id is string => typeof id === "string" && subjectIds.includes(id))
      : subjectId ? [subjectId] : []
    const projectId = typeof record.project_id === "string" && projectIds.includes(record.project_id)
      ? record.project_id
      : undefined

    if (!title || !date || !startTime) return []
    if (kind === "session" && subjectIdsForDraft.length === 0) return []

    return [{
      kind,
      title,
      description: typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : undefined,
      date,
      startTime,
      durationMinutes: Math.min(180, Math.max(15, Math.round(durationMinutes / 15) * 15)),
      eventType,
      subjectId,
      subjectIds: subjectIdsForDraft,
      projectId,
      location: typeof record.location === "string" && record.location.trim()
        ? record.location.trim()
        : undefined,
      topics: Array.isArray(record.topics)
        ? record.topics.filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0).map((topic) => topic.trim())
        : undefined,
      approved: true,
    }]
  })
}

async function generateEventsFromText(
  sourceText: string,
  projects: Project[],
  subjects: Subject[],
  apiKey: string,
  model: string,
  mode: TextPlannerMode,
): Promise<TextEventDraft[]> {
  const today = getLocalDateValue(new Date())
  const subjectIds = subjects.map((subject) => subject.id)
  const subjectEnum = ["none", ...subjectIds]
  const activeProjects = projects.filter((project) => !project.isFinished).slice(0, 40)
  const projectIds = activeProjects.map((project) => project.id)
  const projectEnum = ["none", ...projectIds]
  const itemTypeEnum = mode === "sessions" ? ["session"] : ["event", "session"]
  const modeRules = mode === "sessions"
    ? `- Return only item_type "session"; do not create calendar events, reminders, deadlines, SACs, exams, assignments, or GAT items.
- Every returned item must be a planned study session with at least one concrete subject id in subject_ids.
- Use event_type "event" for every returned item because study sessions are not assessment events.`
    : `- Use item_type "session" for study blocks, revision plans, homework blocks, practice tasks, or prep work.
- Use item_type "event" for real calendar events, due dates, SACs, exams, assignments, GAT dates, meetings, or reminders.
- Use event_type "sac", "exam", "assignment", or "gat" only for real assessment items; use "event" for reminders, study blocks, meetings, or admin tasks.`
  const subjectLines = subjects
    .map((subject) => `${subject.id}: ${subject.name} (${subject.shortCode})`)
    .join("\n")
  const assessmentLines = activeProjects
    .map((project) => {
      const subject = getSubjectById(project.subjectId)
      return [
        `id ${project.id}`,
        project.name,
        project.deadline ? `due ${project.deadline}` : null,
        project.deadlineType ? `type ${project.deadlineType}` : null,
        subject ? `subject ${subject.id}` : null,
      ].filter(Boolean).join(" / ")
    })
    .join("\n")

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You convert pasted school notices, teacher messages, planner notes, and rough text into practical calendar events and study sessions for a VCE student.

Rules:
- Today is ${today}; use this date to resolve relative dates.
- Return 1 to 8 useful items.
${modeRules}
- Use 24-hour start_time in HH:mm format.
- Use durations from 15 to 180 minutes in 15-minute increments.
- If the source text has no time, choose a reasonable after-school time.
- Use subject_id "none" when the subject is unclear for an event.
- Study sessions must include at least one concrete subject id in subject_ids.
- Use project_id when a study session clearly supports an existing active assessment; otherwise use "none".
- Prefer concise titles that fit in a calendar cell.`,
        },
        {
          role: "user",
          content: `Available subjects:
${subjectLines}

Existing active assessments for context:
${assessmentLines || "None"}

Text to convert:
"""
${sourceText}
"""`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "text_calendar_events",
          strict: true,
          schema: {
            type: "object",
            properties: {
              events: {
                type: "array",
                minItems: 1,
                maxItems: 8,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    item_type: {
                      type: "string",
                      enum: itemTypeEnum,
                    },
                    date: { type: "string", description: "YYYY-MM-DD" },
                    start_time: { type: "string", description: "HH:mm in 24-hour time" },
                    duration_minutes: { type: "number" },
                    event_type: {
                      type: "string",
                      enum: ["sac", "exam", "assignment", "gat", "event"],
                    },
                    subject_id: {
                      type: "string",
                      enum: subjectEnum,
                    },
                    subject_ids: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: subjectIds,
                      },
                    },
                    project_id: {
                      type: "string",
                      enum: projectEnum,
                    },
                    location: { type: "string" },
                    topics: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["title", "description", "item_type", "date", "start_time", "duration_minutes", "event_type", "subject_id", "subject_ids", "project_id", "location", "topics"],
                  additionalProperties: false,
                },
              },
            },
            required: ["events"],
            additionalProperties: false,
          },
        },
      },
      provider: {
        require_parameters: true,
      },
      temperature: 0.2,
      max_tokens: 1800,
      ...getReasoningConfig(),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${text}`)
  }

  const data = await response.json() as { choices?: { message?: { content?: unknown } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("No structured content in OpenRouter response")
  }

  const drafts = parseTextEventResponse(content, subjectIds, projectIds)
    .filter((draft) => mode === "mixed" || draft.kind === "session")
  if (drafts.length === 0) {
    throw new Error("Planner did not return usable events")
  }
  return drafts
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
}

function ReadinessRow({ item }: { item: SubjectReadiness }) {
  const subject = getSubjectById(item.subjectId)
  const studied7d = Math.round(item.studyMinutes7d / 60 * 10) / 10
  const studied14d = Math.round(item.studyMinutes14d / 60 * 10) / 10

  return (
    <div className="rounded-xl px-3 py-2 transition-colors hover:bg-accent/25">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">
            {subject?.shortCode ?? item.subjectId}
            {subject?.name ? <span className="ml-1.5 text-muted-foreground">/ {subject.name}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-micro text-muted-foreground">{item.nextAction}</p>
        </div>
        <span className={cn("shrink-0 rounded px-1 py-0 text-[9px] font-medium leading-3", getUrgencyClassName(item.assessmentPressure))}>
          {getUrgencyLabel(item.assessmentPressure)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9px] leading-3 text-muted-foreground">
        <span className="rounded bg-muted/70 px-1 py-0 tabular-nums">{studied7d}h / 7d</span>
        <span className="rounded bg-muted/70 px-1 py-0 tabular-nums">{studied14d}h / 14d</span>
        {item.upcomingCount > 0 && (
          <span className="rounded bg-muted/70 px-1 py-0">{item.upcomingCount} upcoming</span>
        )}
        {item.weakTopics.length > 0 && (
          <span className="min-w-0 truncate rounded bg-muted/70 px-1 py-0">
            weak: {item.weakTopics.slice(0, 2).join(", ")}
          </span>
        )}
      </div>
    </div>
  )
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
}: HomeViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() => {
    const stored = localStorage.getItem(QUICK_LINKS_KEY)
    return stored ? (JSON.parse(stored) as QuickLink[]) : []
  })
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<QuickLink | null>(null)
  const [linkLabel, setLinkLabel] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [linkIcon, setLinkIcon] = useState("Link")
  const [linkColor, setLinkColor] = useState("#71717a")
  const [prioritiesOpen, setPrioritiesOpen] = useState(true)
  const [readinessOpen, setReadinessOpen] = useState(true)
  const [textPlannerOpen, setTextPlannerOpen] = useState(false)
  const [plannerTitle, setPlannerTitle] = useState("Text to Events")
  const [plannerDescription, setPlannerDescription] = useState("Paste a notice, rough plan, or teacher message. Review drafts before adding them.")
  const [plannerMode, setPlannerMode] = useState<TextPlannerMode>("mixed")
  const [plannerText, setPlannerText] = useState("")
  const [plannerDrafts, setPlannerDrafts] = useState<TextEventDraft[]>([])
  const [plannerLoading, setPlannerLoading] = useState(false)
  const [plannerApplying, setPlannerApplying] = useState(false)

  const selectedCalendarDate = selectedDate ? parseISO(selectedDate) : undefined
  const [plannerError, setPlannerError] = useState<string | null>(null)

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
    setLinkColor("#71717a")
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
  const subjectReadiness = useMemo(() => getSubjectReadiness({ projects, sessions, events }), [projects, sessions, events])
  const planningSubjects = useMemo(() => getPlanningSubjects(projects), [projects])

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
          color: subject?.color ?? "#3b82f6",
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
  const handleToday = () => setCurrentMonth(new Date())

  const handleOpenTextPlanner = useCallback(() => {
    setPlannerTitle("Text to Events")
    setPlannerDescription("Paste a notice, rough plan, or teacher message. Review drafts before adding them.")
    setPlannerMode("mixed")
    setPlannerDrafts([])
    setPlannerError(null)
    setTextPlannerOpen(true)
  }, [])

  const handleOpenPrepBalancePlanner = () => {
    const prepLines = prepBalanceItems.map((item) => {
      const targetMinutes = item.assessmentCount * 90
      const remainingMinutes = Math.max(0, Math.round(targetMinutes - item.plannedMinutes))
      const nextDate = item.nextDate ? format(item.nextDate, "yyyy-MM-dd") : "no date"
      return [
        `${item.shortCode} (${item.name})`,
        `${item.assessmentCount} upcoming assessment${item.assessmentCount === 1 ? "" : "s"}`,
        `${Math.round(item.plannedMinutes)} planned minutes`,
        `${remainingMinutes} minutes still needed`,
        item.nextTitle ? `next: ${item.nextTitle} on ${nextDate}` : null,
      ].filter(Boolean).join(" / ")
    })

    setPlannerTitle("AI Study Plan")
    setPlannerDescription("Generate study-session drafts from the current prep balance. Review drafts before adding them.")
    setPlannerMode("sessions")
    setPlannerText(`Create practical study sessions for these prep gaps in ${format(currentMonth, "MMMM yyyy")}:

${prepLines.length > 0 ? prepLines.join("\n") : "No current prep balance items. Create general study sessions for active assessments."}

Return only study sessions. Do not create normal calendar events. Prefer study blocks that reduce the largest remaining gaps first.`)
    setPlannerDrafts([])
    setPlannerError(null)
    setTextPlannerOpen(true)
  }

  const handleGenerateTextEvents = useCallback(async () => {
    const key = getApiKey()
    if (!key) {
      setPlannerError("OpenRouter API key not configured. Set it in Settings.")
      return
    }
    if (!plannerText.trim()) {
      setPlannerError("Paste text to convert into events.")
      return
    }

    setPlannerLoading(true)
    setPlannerError(null)
    try {
      const drafts = await generateEventsFromText(plannerText.trim(), projects, planningSubjects, key, getModel(), plannerMode)
      setPlannerDrafts(drafts)
    } catch (e) {
      setPlannerError(e instanceof Error ? e.message : String(e))
    } finally {
      setPlannerLoading(false)
    }
  }, [plannerText, projects, planningSubjects, plannerMode])

  const togglePlannerDraft = useCallback((index: number) => {
    setPlannerDrafts((current) => current.map((draft, idx) => (
      idx === index ? { ...draft, approved: !draft.approved } : draft
    )))
  }, [])

  const handleApplyTextEvents = useCallback(async () => {
    const approvedDrafts = plannerDrafts.filter((draft) => draft.approved)
    if (approvedDrafts.length === 0) return

    const eventItems = approvedDrafts.flatMap((draft) => {
      if (draft.kind !== "event") return []
      const start = combineDateAndTime(draft.date, draft.startTime)
      if (!start) return []
      const end = addMinutes(start, draft.durationMinutes)
      return [{
        title: draft.title,
        description: draft.description,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        eventType: draft.eventType,
        subjectId: draft.subjectId,
        location: draft.location,
      }]
    })
    const sessionItems = approvedDrafts.flatMap((draft) => {
      if (draft.kind !== "session") return []
      const start = combineDateAndTime(draft.date, draft.startTime)
      if (!start) return []
      const end = addMinutes(start, draft.durationMinutes)
      return [{
        projectId: draft.projectId,
        subjectIds: draft.subjectIds,
        title: draft.title,
        description: draft.description,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        topics: draft.topics,
        notes: draft.location ? `Location: ${draft.location}` : undefined,
      }]
    })

    if (eventItems.length === 0 && sessionItems.length === 0) {
      setPlannerError("The generated dates could not be converted into calendar items.")
      return
    }

    setPlannerApplying(true)
    setPlannerError(null)
    try {
      if (eventItems.length > 0) {
        await onCreateEvents(eventItems)
      }
      if (sessionItems.length > 0) {
        await onCreateStudySessions(sessionItems)
      }
      setTextPlannerOpen(false)
      setPlannerDrafts([])
      setPlannerText("")
    } catch (e) {
      setPlannerError(e instanceof Error ? e.message : String(e))
    } finally {
      setPlannerApplying(false)
    }
  }, [onCreateEvents, onCreateStudySessions, plannerDrafts])

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

  return (
    <div className="h-full overflow-auto">
      <div className="px-5 pb-8 pt-5 min-[1200px]:px-8 min-[1200px]:pb-10 min-[1200px]:pt-7">
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
            <Button size="sm" onClick={() => onNewSession(selectedCalendarDate)} className="h-8 gap-1.5 rounded-xl">
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
                <h3 className="font-medium text-sm text-foreground/90">{format(currentMonth, "MMMM yyyy")}</h3>

                <div className="grid grid-cols-7 gap-0.5">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="h-6 flex items-center justify-center text-micro font-medium text-muted-foreground/70 uppercase tracking-wider">
                      {day}
                    </div>
                  ))}
                  {calendarPad.map((_, i) => (
                    <div key={`pad-${i}`} className="h-21 rounded-lg border border-transparent" />
                  ))}
                  {daysInMonth.map((date) => {
                    const dateKey = format(date, "yyyy-MM-dd")
                    const dayDeadlines = deadlinesByDate[dateKey] || []
                    const daySessions = sessionsByDate[dateKey] || []
                    const dayEvents = eventsByDate[dateKey] || []
                    const isCurrentMonth = isSameMonth(date, currentMonth)
                    const isTodayDate = isToday(date)
                    const allItems = [
                      ...dayDeadlines.map((p) => ({ type: "deadline" as const, name: p.name, color: getSubjectById(p.subjectId)?.color ?? "#888" })),
                      ...daySessions.map((s) => ({ type: "session" as const, name: s.title, color: "#3b82f6" })),
                      ...dayEvents.map((e) => ({ type: "event" as const, name: e.title, color: getEventTypeInfo(e.eventType).color })),
                    ]
                    const visibleItems = allItems.slice(0, 3)
                    const overflow = allItems.length - 3

                    return (
                      <div
                        key={dateKey}
                        onClick={() => setSelectedDate(selectedDate === dateKey ? null : dateKey)}
                        className={cn(
                          "relative h-21 cursor-pointer rounded-lg border p-1 transition-colors",
                          selectedDate === dateKey
                            ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                            : "border-border/30 bg-background/10 hover:border-border hover:bg-accent/25",
                          isTodayDate && selectedDate !== dateKey && "border-primary/40 bg-primary/5",
                          !isCurrentMonth && "opacity-30"
                        )}
                      >
                        <div className={cn(
                          "text-micro font-semibold leading-none",
                          isTodayDate ? "text-primary" : "text-foreground/80"
                        )}>
                          {date.getDate()}
                        </div>
                        <div className="mt-1 space-y-0.5">
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
                    <div className="border-t border-border/70 pt-4 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2">
                      <div className="flex items-center justify-between mb-2.5">
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
                    </div>
                  )
                })()}

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
                            <span className="text-[9px] font-medium uppercase leading-none text-muted-foreground">{format(item.date, "MMM")}</span>
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
                        <Button variant="ghost" size="sm" onClick={handleOpenPrepBalancePlanner} className="h-7 rounded-xl px-2.5 text-xs">
                          <Wand2 className="mr-1.5 h-3 w-3" />
                          AI Plan
                        </Button>
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
                                  <p className="mt-0.5 text-[9px] leading-3 text-muted-foreground">of {targetHours}h</p>
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
                      setLinkColor("#71717a")
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
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
                  <Target className="h-3.5 w-3.5 text-muted-foreground" />
                  Study Priorities
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] leading-3 text-muted-foreground tabular-nums">{priorityItems.length}/7</span>
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
                              <span className={cn("shrink-0 rounded px-1 py-0 text-[9px] font-medium leading-3", getUrgencyClassName(item.urgency))}>
                                {getUrgencyLabel(item.urgency)}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1">
                              <span className="text-micro font-medium text-primary">{item.action}</span>
                              {subjectLabels.map((label) => (
                                <span key={label} className="rounded bg-muted/70 px-1 py-0 text-[9px] leading-3 text-muted-foreground">
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
                onClick={() => setReadinessOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  Subject Readiness
                </h3>
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", readinessOpen && "rotate-90")} />
              </button>
              {readinessOpen && (
                <div className="mt-2.5 space-y-1">
                  {subjectReadiness.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Complete study sessions with subjects to build readiness signals.
                    </p>
                  ) : (
                    subjectReadiness.map((item) => (
                      <ReadinessRow key={item.subjectId} item={item} />
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
              <div className="space-y-5 py-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Icon</label>
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
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border/60 bg-background/40 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                          )}
                        >
                          <IconComp className="h-4 w-4" />
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLinkColor(opt.value)}
                        className={cn(
                          "h-8 w-8 rounded-full border-2 transition-all",
                          linkColor === opt.value ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                        )}
                        style={{ backgroundColor: opt.value }}
                        title={opt.name}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Label</label>
                  <Input
                    placeholder="e.g. VCAA English"
                    value={linkLabel}
                    onChange={(e) => setLinkLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveLink()}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">URL</label>
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

          <Dialog open={textPlannerOpen} onOpenChange={setTextPlannerOpen}>
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>{plannerTitle}</DialogTitle>
                <DialogDescription>
                  {plannerDescription}
                </DialogDescription>
              </DialogHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-4">
                {plannerError && (
                  <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {plannerError}
                  </p>
                )}

                {!getApiKey() && (
                  <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    OpenRouter API key not configured. Go to Settings to set it up.
                  </p>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="text-event-planner-input">Source text</label>
                  <textarea
                    id="text-event-planner-input"
                    value={plannerText}
                    onChange={(event) => setPlannerText(event.target.value)}
                    placeholder="Paste dates, tasks, teacher notes, or a weekly plan..."
                    rows={7}
                    className="w-full resize-none rounded-xl border border-input bg-background/55 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <p className="text-caption text-muted-foreground">
                    Subjects are inferred from your current subject list where possible.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleGenerateTextEvents}
                    disabled={plannerLoading || !plannerText.trim() || !getApiKey()}
                    size="sm"
                    className="gap-1.5"
                  >
                    {plannerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    {plannerLoading ? "Generating..." : "Generate Drafts"}
                  </Button>
                  {plannerDrafts.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {plannerDrafts.filter((draft) => draft.approved).length} of {plannerDrafts.length} approved
                    </span>
                  )}
                </div>

                {plannerDrafts.length > 0 && (
                  <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70">
                    <div className="divide-y divide-border/60">
                      {plannerDrafts.map((draft, index) => {
                        const subject = getSubjectById(draft.subjectId)
                        const sessionSubjects = draft.subjectIds.map((subjectId) => getSubjectById(subjectId)).filter((item): item is Subject => Boolean(item))
                        const project = draft.projectId ? projects.find((item) => item.id === draft.projectId) : undefined
                        return (
                          <div
                            key={`${draft.title}-${draft.date}-${draft.startTime}`}
                            className={cn(
                              "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-3 bg-background/40 px-3 py-3",
                              !draft.approved && "opacity-55",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => togglePlannerDraft(index)}
                              className={cn(
                                "mt-0.5 flex h-4 w-4 items-center justify-center rounded border transition-colors",
                                draft.approved
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground/30 hover:border-muted-foreground/60",
                              )}
                              aria-label={draft.approved ? "Reject event draft" : "Approve event draft"}
                            >
                              {draft.approved && <Check className="h-3 w-3" />}
                            </button>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{draft.title}</p>
                              {draft.description && (
                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{draft.description}</p>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="rounded-md bg-muted px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
                                  {draft.kind === "session" ? "Study session" : "Event"}
                                </span>
                                {draft.kind === "event" && subject && (
                                  <span
                                    className="rounded-md px-1.5 py-0.5 text-micro font-medium"
                                    style={{ backgroundColor: subject.color + "18", color: subject.color }}
                                  >
                                    {subject.shortCode}
                                  </span>
                                )}
                                {draft.kind === "session" && sessionSubjects.slice(0, 2).map((sessionSubject) => (
                                  <span
                                    key={sessionSubject.id}
                                    className="rounded-md px-1.5 py-0.5 text-micro font-medium"
                                    style={{ backgroundColor: sessionSubject.color + "18", color: sessionSubject.color }}
                                  >
                                    {sessionSubject.shortCode}
                                  </span>
                                ))}
                                {project && (
                                  <span className="max-w-40 truncate rounded-md bg-muted/65 px-1.5 py-0.5 text-micro text-muted-foreground">
                                    {project.name}
                                  </span>
                                )}
                                {draft.location && (
                                  <span className="max-w-40 truncate rounded-md bg-muted/65 px-1.5 py-0.5 text-micro text-muted-foreground">
                                    {draft.location}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-medium tabular-nums">{draft.date}</p>
                              <p className="mt-0.5 text-micro text-muted-foreground tabular-nums">
                                {draft.startTime} / {draft.durationMinutes}m
                              </p>
                              <span className="mt-1 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">
                                {draft.kind === "session" ? "session" : draft.eventType}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setTextPlannerOpen(false)}>
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyTextEvents}
                  disabled={plannerApplying || plannerDrafts.filter((draft) => draft.approved).length === 0}
                  className="gap-1.5"
                >
                  {plannerApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                  {plannerApplying ? "Adding..." : `Add ${plannerDrafts.filter((draft) => draft.approved).length} Item${plannerDrafts.filter((draft) => draft.approved).length !== 1 ? "s" : ""}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
