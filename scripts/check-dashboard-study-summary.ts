import { getCompletedStudyMinutesBySubject } from "../src/lib/planning"
import { createStudySession, updateStudySession } from "../src/lib/studySessions"

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

console.warn("dashboard study summary check passed")
