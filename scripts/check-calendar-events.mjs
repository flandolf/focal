import { strict as assert } from "node:assert"
import { dedupeCalendarEvents } from "../src/lib/calendarEvents.ts"

const base = {
  id: "old",
  title: "PE SAC 3",
  startTime: "2026-07-31T01:37:00Z",
  endTime: "2026-07-31T02:52:00Z",
  eventType: "practice-sac",
  subjectId: "pe",
  isFinished: false,
  created_at: "2026-07-16T00:00:00Z",
  updated_at: "2026-07-16T00:00:00Z",
}

const result = dedupeCalendarEvents([
  base,
  {
    ...base,
    id: "new",
    startTime: "2026-07-31T11:37:00+10:00",
    endTime: "2026-07-31T12:52:00+10:00",
    updated_at: "2026-07-20T00:00:00Z",
  },
])

assert.deepEqual(result.events.map((event) => event.id), ["new"])
assert.deepEqual(result.duplicateIds, ["old"])
console.log("calendar event deduplication check passed")
