import { getCompletedStudyMinutesBySubject } from "../src/lib/planning"
import { createStudySession, updateStudySession } from "../src/lib/studySessions"
import { buildTodayOverview } from "../src/features/home/todayOverview"

const planned = createStudySession("planned", {
  subjectIds: ["eng"],
  title: "Planned",
  schedule: { blocks: [{ start: "2026-07-13T08:00:00Z", end: "2026-07-13T09:00:00Z" }] },
  createdVia: "manual",
})
const completed = updateStudySession(planned, {
  status: "completed",
  subjectIds: ["eng", "mm"],
  activeDurations: [{ start: "2026-07-13T08:00:00Z", end: "2026-07-13T09:00:00Z" }],
})
const minutes = getCompletedStudyMinutesBySubject([planned, completed], [])

if (minutes.eng !== 30 || minutes.mm !== 30) {
  throw new Error(`Expected 30 minutes per subject, got ${JSON.stringify(minutes)}`)
}

const overview = buildTodayOverview([{
  id: "assessment-1",
  name: "English SAC",
  folder_path: "English SAC",
  subjectId: "eng",
  deadline: "2026-07-14T09:00:00Z",
  created_at: "2026-07-01T00:00:00Z",
}], [planned, completed], [], new Date("2026-07-13T00:00:00Z"))

if (overview.completedSessions !== 1 || overview.totalStudyHours !== 1) {
  throw new Error(`Today overview counted study incorrectly: ${JSON.stringify(overview)}`)
}
if (overview.dueThisWeek[0]?.id !== "assessment-1") {
  throw new Error("Today overview lost the next assessment")
}

console.warn("dashboard study summary check passed")
