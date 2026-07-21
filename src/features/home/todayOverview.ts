import { addDays, format, parseISO } from "date-fns"
import { getCompletedStudyMinutesBySubject } from "@/lib/planning"
import { getPriorityItems } from "@/lib/studyPriority"
import {
  getSessionEffectiveMinutes,
  getSessionSubjectIds,
  getSubjectById,
} from "@/lib/utils"
import { VCE_SUBJECTS } from "@/lib/types"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"

export interface RecentActivityItem {
  id: string
  title: string
  subtitle: string
  timestamp: string
  kind: "session" | "event"
  session?: StudySession
  event?: CalendarEvent
}

export function buildTodayOverview(
  projects: Project[],
  sessions: StudySession[],
  events: CalendarEvent[],
  now = new Date(),
) {
  const activeProjects = projects.filter((project) => !project.isFinished)
  const projectsWithDeadlines = activeProjects.filter((project) => project.deadline)
  const isPastDeadline = (project: Project) => (
    project.deadline ? parseISO(project.deadline).getTime() < now.getTime() : false
  )
  const overdueProjects = projectsWithDeadlines.filter(
    isPastDeadline,
  )
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const dueThisWeek = projectsWithDeadlines
    .filter(
      (project) => project.deadline && !isPastDeadline(project) && parseISO(project.deadline) <= nextWeek,
    )
    .sort((a, b) => parseISO(a.deadline!).getTime() - parseISO(b.deadline!).getTime())

  const completedSessionItems = sessions.filter((session) => session.status === "completed")
  const totalStudyMinutes = completedSessionItems.reduce(
    (total, session) => total + getSessionEffectiveMinutes(session),
    0,
  )

  const subjectsById = new Map(VCE_SUBJECTS.map((subject) => [subject.id, subject]))
  for (const project of projects) {
    if (!project.subjectId || subjectsById.has(project.subjectId)) continue
    const subject = getSubjectById(project.subjectId)
    if (subject) subjectsById.set(subject.id, subject)
  }

  const recentSessions: RecentActivityItem[] = sessions
    .filter((session) => session.status === "completed" && session.completedAt)
    .map((session) => {
      const project = session.projectId
        ? projects.find((candidate) => candidate.id === session.projectId)
        : undefined
      const subjectLabels = getSessionSubjectIds(session, project)
        .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
        .join(", ")
      return {
        id: session.id,
        title: session.title,
        subtitle: project?.name ?? (subjectLabels || "Study session"),
        timestamp: session.completedAt!,
        kind: "session",
        session,
      }
    })
  const recentEvents: RecentActivityItem[] = events
    .filter((event) => event.isFinished && event.finishedAt)
    .map((event) => ({
      id: event.id,
      title: event.title,
      subtitle: getSubjectById(event.subjectId)?.shortCode ?? event.eventType,
      timestamp: event.finishedAt!,
      kind: "event",
      event,
    }))

  const studyBySubject = Object.entries(getCompletedStudyMinutesBySubject(sessions, projects))
    .map(([subjectId, minutes]) => {
      const subject = getSubjectById(subjectId)
      return [subjectId, {
        minutes,
        icon: subject?.icon ?? "",
        shortCode: subject?.shortCode ?? subjectId,
      }] as const
    })

  const deadlinesByDate: Record<string, Project[]> = {}
  for (const project of projectsWithDeadlines) {
    if (!project.deadline) continue
    const dateKey = format(parseISO(project.deadline), "yyyy-MM-dd")
    ;(deadlinesByDate[dateKey] ??= []).push(project)
  }

  const sessionsByDate: Record<string, StudySession[]> = {}
  for (const session of sessions) {
    const dateKey = format(parseISO(session.startTime), "yyyy-MM-dd")
    ;(sessionsByDate[dateKey] ??= []).push(session)
  }

  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const event of events) {
    const startKey = format(parseISO(event.startTime), "yyyy-MM-dd")
    ;(eventsByDate[startKey] ??= []).push(event)
    if (!event.endTime) continue
    const endKey = format(parseISO(event.endTime), "yyyy-MM-dd")
    let current = parseISO(event.startTime)
    while (format(current, "yyyy-MM-dd") < endKey) {
      current = addDays(current, 1)
      ;(eventsByDate[format(current, "yyyy-MM-dd")] ??= []).push(event)
    }
  }

  return {
    now,
    nextWeek,
    activeProjects,
    projectsWithDeadlines,
    overdueProjects,
    dueThisWeek,
    completedSessions: completedSessionItems.length,
    totalStudyHours: Math.round((totalStudyMinutes / 60) * 10) / 10,
    priorityItems: getPriorityItems({ projects, sessions, events }),
    planningSubjects: Array.from(subjectsById.values()),
    recentActivity: [...recentSessions, ...recentEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 7),
    topSubjects: studyBySubject
      .filter(([, info]) => info.minutes > 0)
      .sort(([, a], [, b]) => b.minutes - a.minutes)
      .slice(0, 3),
    upcomingSessions: sessions
      .filter((session) => {
        const start = new Date(session.startTime)
        return start >= now && start <= nextWeek && session.status === "planned"
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    upcomingEvents: events
      .filter((event) => {
        const start = new Date(event.startTime)
        return !event.isFinished && start >= now && start <= nextWeek
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    deadlinesByDate,
    sessionsByDate,
    eventsByDate,
  }
}
