import type { Project, StudySession } from "@/lib/types"
import { getSessionSubjectIds } from "@/lib/utils"

const DAY_MS = 24 * 60 * 60 * 1000

export type AnalyticsRange = 7 | 30 | 90 | 365 | 0

export interface StudyTimePoint {
  date: string
  minutes: number
  subjectId?: string
}

export interface SubjectMinutes {
  subjectId: string
  minutes: number
  percentage: number
}

export interface ConsistencyDay {
  date: string
  minutes: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface ConsistencyStats {
  currentStreak: number
  longestStreak: number
  totalStudyDays: number
  totalMinutes: number
  averageMinutesPerDay: number
}

export interface TimeOfDayBucket {
  hour: number
  minutes: number
}

export interface SubjectCompletion {
  subjectId: string
  completed: number
  total: number
  rate: number
}

export interface EfficiencyPoint {
  subjectId: string
  minutes: number
  averageConfidence: number
  sessionCount: number
}

export interface AnalyticsData {
  timeTrends: StudyTimePoint[]
  subjectBreakdown: SubjectMinutes[]
  consistency: { days: ConsistencyDay[]; stats: ConsistencyStats }
  timeOfDay: TimeOfDayBucket[]
  subjectCompletion: SubjectCompletion[]
  efficiency: EfficiencyPoint[]
  hasData: boolean
}

function getSessionMinutes(session: StudySession): number {
  const start = new Date(session.startTime).getTime()
  const end = new Date(session.endTime).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0
  return Math.round((end - start) / (1000 * 60))
}

function toDateString(timestamp: number): string {
  const d = new Date(timestamp)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getRangeCutoff(range: AnalyticsRange): number {
  if (range === 0) return 0
  return Date.now() - range * DAY_MS
}

function getCompletedSessions(sessions: StudySession[], range: AnalyticsRange): StudySession[] {
  const cutoff = getRangeCutoff(range)
  return sessions.filter((s) => {
    if (s.status !== "completed") return false
    const start = new Date(s.startTime).getTime()
    if (Number.isNaN(start)) return false
    if (cutoff > 0 && start < cutoff) return false
    return true
  })
}

function splitMinutesAcrossSubjects(minutes: number, subjectIds: string[]): number {
  if (subjectIds.length <= 1) return minutes
  return Math.round(minutes / subjectIds.length)
}

export function getTimeTrends(
  sessions: StudySession[],
  projects: Project[],
  range: AnalyticsRange,
): StudyTimePoint[] {
  const completed = getCompletedSessions(sessions, range)
  const dayMap = new Map<string, Map<string, number>>()

  completed.forEach((session) => {
    const dateStr = toDateString(new Date(session.startTime).getTime())
    const minutes = getSessionMinutes(session)
    if (minutes <= 0) return

    const project = projects.find((p) => p.id === session.projectId)
    const subjectIds = getSessionSubjectIds(session, project)
    const subjectMap = dayMap.get(dateStr) ?? new Map<string, number>()

    if (subjectIds.length > 0) {
      const minutesPerSubject = splitMinutesAcrossSubjects(minutes, subjectIds)
      subjectIds.forEach((subjectId) => {
        subjectMap.set(subjectId, (subjectMap.get(subjectId) ?? 0) + minutesPerSubject)
      })
    } else {
      subjectMap.set("_unassigned", (subjectMap.get("_unassigned") ?? 0) + minutes)
    }
    dayMap.set(dateStr, subjectMap)
  })

  const points: StudyTimePoint[] = []
  dayMap.forEach((subjectMap, dateStr) => {
    subjectMap.forEach((minutes, subjectId) => {
      points.push({
        date: dateStr,
        minutes,
        subjectId: subjectId === "_unassigned" ? undefined : subjectId,
      })
    })
  })

  points.sort((a, b) => a.date.localeCompare(b.date))
  return points
}

export function getSubjectBreakdown(
  sessions: StudySession[],
  projects: Project[],
  range: AnalyticsRange,
): SubjectMinutes[] {
  const completed = getCompletedSessions(sessions, range)
  const subjectMinutes = new Map<string, number>()
  let total = 0

  completed.forEach((session) => {
    const minutes = getSessionMinutes(session)
    if (minutes <= 0) return
    const project = projects.find((p) => p.id === session.projectId)
    const subjectIds = getSessionSubjectIds(session, project)
    if (subjectIds.length === 0) {
      subjectMinutes.set("_unassigned", (subjectMinutes.get("_unassigned") ?? 0) + minutes)
    } else {
      const minutesPerSubject = splitMinutesAcrossSubjects(minutes, subjectIds)
      subjectIds.forEach((id) => {
        subjectMinutes.set(id, (subjectMinutes.get(id) ?? 0) + minutesPerSubject)
      })
    }
    total += minutes
  })

  return Array.from(subjectMinutes.entries())
    .map(([subjectId, minutes]) => ({
      subjectId,
      minutes,
      percentage: total > 0 ? Math.round((minutes / total) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
}

export function getConsistencyData(
  sessions: StudySession[],
  range: AnalyticsRange,
): { days: ConsistencyDay[]; stats: ConsistencyStats } {
  const completed = getCompletedSessions(sessions, range)
  const minutesByDay = new Map<string, number>()

  completed.forEach((session) => {
    const dateStr = toDateString(new Date(session.startTime).getTime())
    const minutes = getSessionMinutes(session)
    if (minutes > 0) {
      minutesByDay.set(dateStr, (minutesByDay.get(dateStr) ?? 0) + minutes)
    }
  })

  const endDate = new Date()
  const earliestCompletedStart = completed.reduce<number | null>((earliest, session) => {
    const start = new Date(session.startTime).getTime()
    if (Number.isNaN(start)) return earliest
    return earliest == null ? start : Math.min(earliest, start)
  }, null)
  const startDate = range === 0 && earliestCompletedStart != null
    ? new Date(earliestCompletedStart)
    : new Date(Date.now() - range * DAY_MS)
  startDate.setHours(0, 0, 0, 0)

  const days: ConsistencyDay[] = []
  const current = new Date(startDate)
  while (current <= endDate) {
    const dateStr = toDateString(current.getTime())
    const minutes = minutesByDay.get(dateStr) ?? 0
    days.push({ date: dateStr, minutes, level: getHeatLevel(minutes) })
    current.setDate(current.getDate() + 1)
  }

  const stats = computeStreaks(days)
  return { days, stats }
}

function getHeatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes === 0) return 0
  if (minutes <= 30) return 1
  if (minutes <= 60) return 2
  if (minutes <= 120) return 3
  return 4
}

function computeStreaks(days: ConsistencyDay[]): ConsistencyStats {
  let currentStreak = 0
  let longestStreak = 0
  let streak = 0
  let totalStudyDays = 0
  let totalMinutes = 0

  for (let i = days.length - 1; i >= 0; i--) {
    totalMinutes += days[i].minutes
    if (days[i].minutes > 0) {
      totalStudyDays++
    }
  }

  const todayStr = toDateString(Date.now())
  let checkingCurrent = true
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].minutes > 0) {
      streak++
      if (checkingCurrent && (days[i].date === todayStr || days[i].date < todayStr)) {
        currentStreak = streak
      }
    } else {
      if (checkingCurrent) {
        checkingCurrent = false
        currentStreak = streak
      }
      streak = 0
    }
    if (streak > longestStreak) longestStreak = streak
  }
  if (checkingCurrent) currentStreak = streak

  const averageMinutesPerDay = days.length > 0 ? Math.round(totalMinutes / days.length) : 0

  return { currentStreak, longestStreak, totalStudyDays, totalMinutes, averageMinutesPerDay }
}

export function getTimeOfDayAnalysis(
  sessions: StudySession[],
  range: AnalyticsRange,
): TimeOfDayBucket[] {
  const completed = getCompletedSessions(sessions, range)
  const buckets: TimeOfDayBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: 0 }))

  completed.forEach((session) => {
    const minutes = getSessionMinutes(session)
    if (minutes <= 0) return
    const hour = new Date(session.startTime).getHours()
    if (!Number.isNaN(hour) && hour >= 0 && hour < 24) {
      buckets[hour].minutes += minutes
    }
  })

  return buckets
}

export function getSubjectCompletion(
  sessions: StudySession[],
  projects: Project[],
  range: AnalyticsRange,
): SubjectCompletion[] {
  const cutoff = getRangeCutoff(range)
  const subjectStats = new Map<string, { completed: number; total: number }>()

  sessions.forEach((session) => {
    const start = new Date(session.startTime).getTime()
    if (Number.isNaN(start)) return
    if (cutoff > 0 && start < cutoff) return

    const project = projects.find((p) => p.id === session.projectId)
    const subjectIds = getSessionSubjectIds(session, project)
    if (subjectIds.length === 0) return

    subjectIds.forEach((subjectId) => {
      const stats = subjectStats.get(subjectId) ?? { completed: 0, total: 0 }
      stats.total++
      if (session.status === "completed") stats.completed++
      subjectStats.set(subjectId, stats)
    })
  })

  return Array.from(subjectStats.entries())
    .map(([subjectId, stats]) => ({
      subjectId,
      completed: stats.completed,
      total: stats.total,
      rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.rate - a.rate)
}

export function getStudyEfficiency(
  sessions: StudySession[],
  projects: Project[],
  range: AnalyticsRange,
): EfficiencyPoint[] {
  const completed = getCompletedSessions(sessions, range)
  const subjectData = new Map<string, { totalMinutes: number; totalConfidence: number; count: number }>()

  completed.forEach((session) => {
    const minutes = getSessionMinutes(session)
    if (minutes <= 0) return

    const project = projects.find((p) => p.id === session.projectId)
    const subjectIds = getSessionSubjectIds(session, project)
    const confidence = session.confidence ?? 3

    const minutesPerSubject = splitMinutesAcrossSubjects(minutes, subjectIds.length > 0 ? subjectIds : ["_unassigned"])
    const subjects = subjectIds.length > 0 ? subjectIds : ["_unassigned"]

    subjects.forEach((subjectId) => {
      const data = subjectData.get(subjectId) ?? { totalMinutes: 0, totalConfidence: 0, count: 0 }
      data.totalMinutes += minutesPerSubject
      data.totalConfidence += confidence
      data.count++
      subjectData.set(subjectId, data)
    })
  })

  return Array.from(subjectData.entries())
    .map(([subjectId, data]) => ({
      subjectId,
      minutes: data.totalMinutes,
      averageConfidence: data.count > 0 ? Math.round((data.totalConfidence / data.count) * 10) / 10 : 0,
      sessionCount: data.count,
    }))
    .filter((s) => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}

export function getAnalyticsData(
  sessions: StudySession[],
  projects: Project[],
  range: AnalyticsRange,
): AnalyticsData {
  const timeTrends = getTimeTrends(sessions, projects, range)
  const subjectBreakdown = getSubjectBreakdown(sessions, projects, range)
  const consistency = getConsistencyData(sessions, range)
  const timeOfDay = getTimeOfDayAnalysis(sessions, range)
  const subjectCompletion = getSubjectCompletion(sessions, projects, range)
  const efficiency = getStudyEfficiency(sessions, projects, range)

  const hasData = sessions.some((s) => s.status === "completed")

  return { timeTrends, subjectBreakdown, consistency, timeOfDay, subjectCompletion, efficiency, hasData }
}
