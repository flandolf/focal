import {
  getConsistencyData,
  getConsistencyForTimeTrends,
  getSubjectBreakdown,
  getSubjectCompletion,
  getTimeOfDayBySubject,
  getTimeTrends,
} from "../src/lib/analytics"
import { createStudySession, updateStudySession } from "../src/lib/studySessions"

function session(id: string, start: string) {
  return createStudySession(id, {
    subjectIds: ["eng"],
    title: id,
    schedule: { blocks: [{ start, end: new Date(new Date(start).getTime() + 3_600_000).toISOString() }] },
    createdVia: "manual",
  })
}

const completed = updateStudySession(session("completed", "2020-01-01T08:00:00Z"), {
  status: "completed",
  subjectIds: ["eng", "mm"],
  activeDurations: [{ start: "2020-01-01T08:00:00Z", end: "2020-01-01T09:01:00Z" }],
})
const overdue = session("overdue", "2020-01-02T08:00:00Z")
const future = session("future", "2100-01-01T08:00:00Z")

const completion = getSubjectCompletion([completed, overdue, future], [], 0)
  .find((item) => item.subjectId === "eng")
if (!completion) throw new Error("English completion result is missing")
if (completion.completed !== 1 || completion.total !== 2 || completion.rate !== 50) {
  throw new Error(`Future session changed completion rate: ${JSON.stringify(completion)}`)
}

const breakdown = getSubjectBreakdown([completed, overdue, future], [], 0)
const allocatedMinutes = breakdown.reduce((total, item) => total + item.minutes, 0)
if (allocatedMinutes !== 61) {
  throw new Error(`Planned time leaked into actual study: ${JSON.stringify(breakdown)}`)
}
const shares = breakdown.map((item) => item.minutes).sort((a, b) => a - b)
if (shares[0] !== 30 || shares[1] !== 31) {
  throw new Error(`Expected whole-minute shares, got ${JSON.stringify(shares)}`)
}
const methodsTrend = getTimeTrends([completed], [], 0)
  .filter((point) => point.subjectId === "mm")
const methodsConsistency = getConsistencyForTimeTrends(
  getConsistencyData([completed], 0).days,
  methodsTrend,
)
if (methodsConsistency.stats.totalMinutes !== 30) {
  throw new Error(`Subject filter did not reach consistency data: ${methodsConsistency.stats.totalMinutes}`)
}
const methodsTimeOfDay = getTimeOfDayBySubject([completed], [], 0)
  .find((bucket) => bucket.subjectId === "mm")
if (methodsTimeOfDay?.minutes !== 30) {
  throw new Error(`Subject filter did not reach time-of-day data: ${JSON.stringify(methodsTimeOfDay)}`)
}

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)
yesterday.setHours(8, 0, 0, 0)
const yesterdayEnd = new Date(yesterday.getTime() + 3_600_000)
const yesterdayCompleted = updateStudySession(session("yesterday", yesterday.toISOString()), {
  status: "completed",
  activeDurations: [{ start: yesterday.toISOString(), end: yesterdayEnd.toISOString() }],
})
const streak = getConsistencyData([yesterdayCompleted], 7).stats.currentStreak
if (streak !== 1) throw new Error(`Yesterday's active streak was lost: ${streak}`)
const sevenDayRange = getConsistencyData([], 7).days
if (sevenDayRange.length !== 7) {
  throw new Error(`7d range rendered ${sevenDayRange.length} calendar days`)
}

const shifted = updateStudySession(session("shifted", "2020-01-01T08:00:00Z"), {
  status: "completed",
  activeDurations: [{ start: yesterday.toISOString(), end: yesterdayEnd.toISOString() }],
})
const shiftedBreakdown = getSubjectBreakdown([shifted], [], 7)
if (shiftedBreakdown[0]?.minutes !== 60) {
  throw new Error(`Actual interval was excluded by its old planned date: ${JSON.stringify(shiftedBreakdown)}`)
}

console.warn("analytics completion check passed")
