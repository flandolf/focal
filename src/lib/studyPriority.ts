import type {
  CalendarEvent,
  PriorityItem,
  PriorityUrgency,
  Project,
  StudySession,
} from "@/lib/types"
import { getSessionSubjectIds } from "@/lib/utils"

const DAY_MS = 24 * 60 * 60 * 1000
const ASSESSMENT_TYPES = new Set(["sac", "exam", "assignment", "gat"])

interface PriorityInput {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
}

function getTime(value?: string): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function getDaysUntil(value?: string, now = Date.now()): number | null {
  const time = getTime(value)
  if (time === null) return null
  return Math.ceil((time - now) / DAY_MS)
}

function getProjectSubjectIds(project?: Project): string[] {
  return project?.subjectId ? [project.subjectId] : []
}

function getUrgencyForDays(days: number): PriorityUrgency {
  if (days < 0) return "critical"
  if (days <= 2) return "high"
  if (days <= 7) return "medium"
  return "low"
}

function getPressureRank(urgency: PriorityUrgency): number {
  switch (urgency) {
    case "critical":
      return 4
    case "high":
      return 3
    case "medium":
      return 2
    case "low":
      return 1
  }
}

function formatDaysReason(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return "due today"
  if (days === 1) return "due tomorrow"
  return `due in ${days}d`
}

function sortPriorityItems(items: PriorityItem[]): PriorityItem[] {
  return items.sort((a, b) => {
    const urgencyDelta = getPressureRank(b.urgency) - getPressureRank(a.urgency)
    if (urgencyDelta !== 0) return urgencyDelta
    return a.title.localeCompare(b.title)
  })
}

export function getPriorityItems({ projects, sessions, events }: PriorityInput): PriorityItem[] {
  const now = Date.now()
  const nextWeek = now + 7 * DAY_MS
  const activeProjects = projects.filter((project) => !project.isFinished && !project.isArchived)
  const activeProjectById = new Map(activeProjects.map((project) => [project.id, project]))
  const plannedProjectIds = new Set(
    sessions
      .filter((session) => {
        const start = getTime(session.startTime)
        return session.projectId && session.status === "planned" && start !== null && start >= now && start <= nextWeek
      })
      .map((session) => session.projectId!)
  )

  const items: PriorityItem[] = []

  activeProjects.forEach((project) => {
    const days = getDaysUntil(project.deadline, now)
    if (days === null) return
    if (days < 0 || days <= 7) {
      items.push({
        id: `project-${project.id}`,
        kind: days < 0 ? "overdue-project" : "upcoming-assessment",
        title: project.name,
        reason: `${project.deadlineType?.toUpperCase() ?? "Deadline"} ${formatDaysReason(days)}`,
        urgency: getUrgencyForDays(days),
        subjectIds: getProjectSubjectIds(project),
        projectId: project.id,
        action: days < 0 ? "Open and triage" : "Prep next step",
      })
    }
  })

  events.forEach((event) => {
    if (event.isFinished) return
    if (!ASSESSMENT_TYPES.has(event.eventType)) return
    const days = getDaysUntil(event.startTime, now)
    if (days === null || days < -1 || days > 14) return
    items.push({
      id: `event-${event.id}`,
      kind: "upcoming-assessment",
      title: event.title,
      reason: `${event.eventType.toUpperCase()} ${formatDaysReason(days)}`,
      urgency: getUrgencyForDays(days),
      subjectIds: event.subjectId ? [event.subjectId] : [],
      eventId: event.id,
      action: "Check details",
    })
  })

  sessions.forEach((session) => {
    if (session.status !== "planned") return
    const start = getTime(session.startTime)
    if (start === null || start < now || start > nextWeek) return
    const project = session.projectId ? activeProjectById.get(session.projectId) : undefined
    const days = Math.ceil((start - now) / DAY_MS)
    items.push({
      id: `session-${session.id}`,
      kind: "planned-session",
      title: session.title,
      reason: days <= 0 ? "planned today" : `planned in ${days}d`,
      urgency: days <= 1 ? "medium" : "low",
      subjectIds: getSessionSubjectIds(session, project),
      projectId: session.projectId,
      sessionId: session.id,
      action: "Open session",
    })
  })

  activeProjects.forEach((project) => {
    if (!project.deadline || plannedProjectIds.has(project.id)) return
    const days = getDaysUntil(project.deadline, now)
    if (days === null || days < 0 || days > 21) return
    items.push({
      id: `plan-${project.id}`,
      kind: "plan-prep",
      title: `Plan prep for ${project.name}`,
      reason: `no session scheduled before ${formatDaysReason(days)}`,
      urgency: days <= 7 ? "medium" : "low",
      subjectIds: getProjectSubjectIds(project),
      projectId: project.id,
      action: "Plan session",
    })
  })

  sessions.forEach((session) => {
    if (session.status !== "completed" || !session.confidence || session.confidence > 2) return
    const project = session.projectId ? activeProjectById.get(session.projectId) : undefined
    const topics = session.topics?.filter((topic) => topic.trim().length > 0) ?? []
    items.push({
      id: `weak-${session.id}`,
      kind: "weak-topic",
      title: topics.length > 0 ? `Revise ${topics[0]}` : `Review ${session.title}`,
      reason: `confidence ${session.confidence}/5 after last review`,
      urgency: "medium",
      subjectIds: getSessionSubjectIds(session, project),
      projectId: session.projectId,
      sessionId: session.id,
      action: "Review notes",
    })
  })

  return sortPriorityItems(items).slice(0, 7)
}


