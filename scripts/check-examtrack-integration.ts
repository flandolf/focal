import {
  getActiveExamTrackTimer,
  getExamTrackElapsedSeconds,
  getExamTrackTimerUrl,
  getExamTrackUrl,
  matchFocalSubjectId,
  summariseExamTrackData,
} from "../src/lib/examtrack"
import { normalizeStudySession } from "../src/lib/studySessions"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const snapshot = summariseExamTrackData([
  { id: "one", subject: "Chemistry", title: "Paper 1", provider: "VCAA", completedAt: "2026-08-01", rawScore: 70, rawMax: 100 },
  { id: "two", subject: "Chemistry", title: "Paper 2", provider: "VCAA", completedAt: "2026-08-02", rawScore: 80, rawMax: 100 },
  { id: "three", subject: "Physics", title: "Paper 3", provider: "VCAA", completedAt: "2026-08-03", rawScore: 90, rawMax: 100 },
  { id: "invalid", subject: "Physics", completedAt: "not-a-date", rawScore: 120, rawMax: 100 },
], [
  { createdAt: "2026-08-01", suspended: false },
  { dueAt: "2026-08-06", createdAt: "2026-08-01", suspended: false },
  { createdAt: "2026-08-01", suspended: true },
  { createdAt: "2026-08-01", resolved: true },
], new Date("2026-08-05T12:00:00Z"))

assert(snapshot.attempts.length === 3, "invalid attempts must not cross the integration boundary")
assert(snapshot.attempts[0].id === "three", "attempts must be newest first")
assert(snapshot.averagePercentage === 80, "overall average must use valid attempts")
assert(snapshot.subjects[0].subject === "Chemistry", "weakest subject must be first")
assert(snapshot.subjects[0].averagePercentage === 75, "subject average is incorrect")
assert(snapshot.totalMistakes === 4 && snapshot.dueMistakes === 1, "mistake due state is incorrect")
assert(matchFocalSubjectId("Chemistry", [{ id: "chem", name: "Chemistry", shortCode: "CHE", color: "#000" }]) === "chem", "subject names must map into Focal")
assert(getExamTrackUrl("exam-one", "http://examtrack.example") === null, "production links must reject plaintext HTTP")
assert(getExamTrackUrl("exam-one", "https://examtrack.example") === "https://examtrack.example/#exam-one", "HTTPS drill-through URL is incorrect")
assert(getExamTrackTimerUrl("sac", "https://examtrack.example") === "https://examtrack.example/?timer=sac", "SAC timer URL is incorrect")

const integratedSession = normalizeStudySession({
  id: "timer",
  title: "Timed exam · Chemistry",
  schedule: { blocks: [{ start: "2026-08-05T10:00:00Z", end: "2026-08-05T11:00:00Z" }] },
  execution: { state: "in-progress", intervals: [
    { start: "2026-08-05T10:00:00Z", end: "2026-08-05T10:20:00Z", source: "imported" },
    { start: "2026-08-05T10:25:00Z", source: "imported" },
  ] },
  createdVia: "examtrack",
  integrations: { examtrack: { type: "examtrack", id: "timer", kind: "exam", subject: "Chemistry" } },
})
assert(getActiveExamTrackTimer([integratedSession]) === integratedSession, "active ExamTrack timer was not detected")
assert(getExamTrackElapsedSeconds(integratedSession, new Date("2026-08-05T10:35:00Z")) === 1800, "active timer intervals were double-counted")
assert(integratedSession.subjectIds[0] === "chem", "ExamTrack subjects must map into Focal analytics")
assert(integratedSession.createdVia === "examtrack", "ExamTrack provenance must survive normalization")

process.stdout.write("ExamTrack integration self-check passed\n")
