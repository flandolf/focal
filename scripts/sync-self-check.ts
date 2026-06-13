import {
  addChangedRowId,
  addDeletedRowId,
  removeDeletedRowId,
  shouldEnqueueFileRow,
  shouldEnqueueLocalTable,
  shouldKeepLocalRow,
} from "../src/lib/sync/core"

const lastSyncAt = "2026-06-13T08:00:00.000Z"

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function assertJsonEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`)
  }
}

assertEqual(
  shouldEnqueueFileRow(
    "study_sessions",
    { id: "session-1", updated_at: "2026-06-13T07:00:00.000Z" },
    { study_sessions: "2026-06-13T09:00:00.000Z" },
    {},
    lastSyncAt,
  ),
  true,
  "offline-created study sessions must enqueue even when their row timestamp is older than the last sync",
)

assertEqual(
  shouldEnqueueFileRow(
    "events",
    { id: "event-1", updated_at: "2026-06-13T07:00:00.000Z" },
    {},
    {},
    lastSyncAt,
  ),
  false,
  "unchanged old rows should not be re-queued forever",
)

assertEqual(
  shouldEnqueueLocalTable("custom_subjects", { custom_subjects: "2026-06-13T09:00:00.000Z" }, lastSyncAt),
  true,
  "localStorage-backed tables use the same durable dirty-table rule",
)

assertJsonEqual(
  addDeletedRowId(addDeletedRowId({}, "events", "event-1"), "events", "event-1"),
  { events: ["event-1"] },
  "offline delete tombstones should be stable and deduplicated",
)

assertJsonEqual(
  removeDeletedRowId({ events: ["event-1"] }, "events", "event-1"),
  { events: [] },
  "local upsert should clear a stale local delete tombstone for the same row",
)

assertJsonEqual(
  addChangedRowId(addChangedRowId({}, "study_sessions", "session-1"), "study_sessions", "session-1"),
  { study_sessions: ["session-1"] },
  "dirty study session row ids should be stable and deduplicated",
)

assertEqual(
  shouldEnqueueFileRow(
    "study_sessions",
    { id: "session-1", updated_at: "2026-06-13T07:00:00.000Z" },
    {},
    { study_sessions: ["session-1"] },
    lastSyncAt,
  ),
  true,
  "dirty study session row ids must enqueue even without a table-wide dirty timestamp",
)

assertEqual(
  shouldKeepLocalRow("events", "event-1", { events: ["event-1"] }, {}),
  true,
  "remote soft-delete must not remove an unpushed local event edit",
)

assertEqual(
  shouldKeepLocalRow("study_sessions", "session-1", {}, { study_sessions: ["session-1"] }),
  true,
  "remote rows must not resurrect over an unpushed local study-session delete",
)
