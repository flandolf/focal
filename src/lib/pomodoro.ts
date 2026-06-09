import type { StudySession } from "@/lib/types"
import { getSubjectById } from "@/lib/utils"

export const POMODORO_MERGE_WINDOW_MS = 15 * 60 * 1000
export const POMODORO_DESCRIPTION_PREFIX = "Pomodoro —"
const LEGACY_POMODORO_DESCRIPTION = "Started from the Pomodoro timer."
const LEGACY_POMODORO_NOTES = "Focus block logged from the sidebar timer."

export function isPomodoroSession(session: StudySession) {
  return (typeof session.description === "string" && (
    session.description.startsWith(POMODORO_DESCRIPTION_PREFIX)
    || session.description === LEGACY_POMODORO_DESCRIPTION
  )) || session.notes === LEGACY_POMODORO_NOTES
}

export function getPomodoroDescription(durationMinutes: number, cycleNumber: number) {
  const startedAt = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  return `${POMODORO_DESCRIPTION_PREFIX} ${durationMinutes}m focus block #${cycleNumber} · started ${startedAt}`
}

export function getPomodoroNotes(cycleNumber: number) {
  const stored = typeof window !== "undefined" ? localStorage.getItem("focal-pomodoro-settings") : null
  let work = 25, brk = 5, long = 15
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Record<string, unknown>
      if (typeof parsed.workMinutes === "number") work = parsed.workMinutes
      if (typeof parsed.breakMinutes === "number") brk = parsed.breakMinutes
      if (typeof parsed.longBreakMinutes === "number") long = parsed.longBreakMinutes
    } catch { /* use defaults */ }
  }
  return `Timer: ${work}m work / ${brk}m break / ${long}m long break. Focus block #${cycleNumber} of current run.`
}

export function getPomodoroTitle(subjectIds: string[], cycleNumber: number, projectName?: string) {
  const labels = subjectIds
    .map((id) => getSubjectById(id)?.shortCode ?? getSubjectById(id)?.name)
    .filter((label): label is string => Boolean(label))

  const subjectPart = labels.length === 0
    ? "Pomodoro"
    : labels.length === 1
      ? labels[0]
      : labels.slice(0, 2).join(" + ")

  const prefix = projectName ? `${projectName} — ` : ""
  return `${prefix}${subjectPart} · Focus #${cycleNumber}`
}

function haveSameSubjects(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, index) => id === sortedB[index])
}

export function isMergeablePomodoroSession(session: StudySession, data: { projectId?: string; subjectIds: string[] }) {
  return isPomodoroSession(session)
    && session.projectId === data.projectId
    && haveSameSubjects(session.subjectIds, data.subjectIds)
}

export function getAdjacentPomodoroSession(
  sessions: StudySession[],
  data: { projectId?: string; subjectIds: string[] },
  start: Date,
  end: Date,
) {
  const startMs = start.getTime()
  const endMs = end.getTime()

  const adjacentSessions = sessions
    .filter((session) => isMergeablePomodoroSession(session, data))
    .map((session) => ({
      session,
      startMs: new Date(session.startTime).getTime(),
      endMs: new Date(session.endTime).getTime(),
    }))
    .filter(({ startMs: candidateStartMs, endMs: candidateEndMs }) => (
      Number.isFinite(candidateStartMs)
      && Number.isFinite(candidateEndMs)
      && (
        Math.abs(startMs - candidateEndMs) <= POMODORO_MERGE_WINDOW_MS
        || Math.abs(candidateStartMs - endMs) <= POMODORO_MERGE_WINDOW_MS
      )
    ))
    .sort((a, b) => Math.min(Math.abs(startMs - a.endMs), Math.abs(endMs - a.startMs)) - Math.min(Math.abs(startMs - b.endMs), Math.abs(endMs - b.startMs)))

  return adjacentSessions[0]?.session
}

export function getUniqueStrings(items: (string | undefined)[]) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))))
}

export function getUniqueArrayItems(items: (string[] | undefined)[]) {
  return Array.from(new Set(items.flatMap((item) => item ?? []).map((item) => item.trim()).filter(Boolean)))
}
