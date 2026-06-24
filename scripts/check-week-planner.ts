import { buildAvailableStudyIntervals, sumAvailableStudyMinutes, type AvailableStudyInterval } from "../src/lib/planning"
import type { StudySession } from "../src/lib/types"

const intervals: AvailableStudyInterval[] = [
  { date: "2026-06-24", startTime: "2026-06-24T06:00:00.000Z", endTime: "2026-06-24T08:00:00.000Z", availableMinutes: 120, dailyRemainingMinutes: 180 },
  { date: "2026-06-24", startTime: "2026-06-24T09:00:00.000Z", endTime: "2026-06-24T11:00:00.000Z", availableMinutes: 120, dailyRemainingMinutes: 180 },
  { date: "2026-06-25", startTime: "2026-06-25T06:00:00.000Z", endTime: "2026-06-25T07:00:00.000Z", availableMinutes: 60, dailyRemainingMinutes: 120 },
]

if (sumAvailableStudyMinutes(intervals) !== 240) {
  throw new Error("Daily caps should limit the displayed weekly capacity")
}

const mergedSession: StudySession = {
  id: "merged",
  title: "Merged study",
  subjectIds: ["eng"],
  startTime: "2026-06-24T07:00:00.000Z",
  endTime: "2026-06-25T11:00:00.000Z",
  activeDurations: [{ start: "2026-06-24T07:00:00.000Z", end: "2026-06-24T08:00:00.000Z" }],
  status: "planned",
  created_at: "2026-06-24T00:00:00.000Z",
}
const mergedIntervals = buildAvailableStudyIntervals({
  preferences: {
    windows: [
      { weekday: 3, startTime: "17:00", endTime: "21:00" },
      { weekday: 4, startTime: "17:00", endTime: "21:00" },
    ],
    dailyCapMinutes: 180,
  },
  sessions: [mergedSession],
  events: [],
  now: new Date(2026, 5, 24, 12),
  days: 2,
})

if (!mergedIntervals.some((interval) => interval.date === "2026-06-25")) {
  throw new Error("Merged session envelopes must not block time outside their active durations")
}
