import { createStudySession, normalizeStudySession, updateStudySession } from "../src/lib/studySessions.ts"

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const planned = normalizeStudySession({
  id: "legacy-planned",
  subjectIds: ["mm"],
  title: "Legacy planned session",
  startTime: "2026-06-24T08:00:00.000Z",
  endTime: "2026-06-24T10:00:00.000Z",
  activeDurations: [
    { start: "2026-06-24T08:00:00.000Z", end: "2026-06-24T08:45:00.000Z" },
    { start: "2026-06-24T09:00:00.000Z", end: "2026-06-24T10:00:00.000Z" },
  ],
  status: "planned",
  created_at: "2026-06-20T00:00:00.000Z",
})

check(planned.schemaVersion === 2, "legacy session was not migrated to V2")
check(planned.schedule.blocks.length === 2, "legacy planned blocks were not preserved")
check(planned.execution.state === "planned" && planned.execution.intervals.length === 0, "planned session gained execution intervals")
check(planned.startTime === "2026-06-24T08:00:00.000Z", "legacy schedule compatibility view is wrong")

const stored = JSON.parse(JSON.stringify(planned)) as Record<string, unknown>
check(stored.schemaVersion === 2, "stored session lost its schema version")
check(Boolean(stored.schedule), "stored session lost its schedule")
check(Boolean(stored.execution), "stored session lost its execution")
check(!("startTime" in stored), "legacy startTime leaked into canonical storage")
check(!("status" in stored), "legacy status leaked into canonical storage")

const created = createStudySession("new-session", {
  subjectIds: ["eng"],
  title: "Essay plan",
  schedule: { blocks: [{ start: "2026-06-25T07:00:00.000Z", end: "2026-06-25T08:00:00.000Z" }] },
  reflection: { confidence: 3, blockers: "Introduction" },
}, "2026-06-24T00:00:00.000Z")

check(created.confidence === 3, "create dropped confidence")
check(created.blockers === "Introduction", "create dropped blockers")

const completed = updateStudySession(created, {
  status: "completed",
  activeDurations: [{ start: "2026-06-25T07:05:00.000Z", end: "2026-06-25T07:50:00.000Z" }],
  completedAt: "2026-06-25T07:50:00.000Z",
  notes: "Drafted the outline",
}, "2026-06-25T07:50:00.000Z")

check(completed.execution.state === "completed", "completion transition did not update state")
check(completed.execution.intervals.length === 1, "completion transition lost actual intervals")
check(completed.completedAt === "2026-06-25T07:50:00.000Z", "completion timestamp was not preserved")
check(completed.reflection?.notes === "Drafted the outline", "completion transition lost reflection")

const cleared = updateStudySession(completed, { notes: undefined, confidence: undefined })
check(cleared.reflection?.notes === undefined, "explicitly cleared notes were restored")
check(cleared.reflection?.confidence === undefined, "explicitly cleared confidence was restored")

const repaired = normalizeStudySession({
  id: "corrupt-time",
  subjectIds: [],
  title: "Corrupt import",
  startTime: "not-a-date",
  status: "planned",
})
check(Number.isFinite(new Date(repaired.startTime).getTime()), "invalid imported schedule was not repaired")
