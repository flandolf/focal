import {
  addChangedRowId,
  addDeletedRowId,
  clearQueueItemsFromMeta,
  coalesceQueueItem,
  isQueueItemDue,
  isRowInPullWindow,
  mergeRemoteRecords,
  removeDeletedRowId,
  retryQueueItem,
  scrubUserSettingsSecrets,
  shouldBackfillCalendarTable,
  shouldEnqueueFileRow,
  shouldEnqueueLocalTable,
  shouldKeepLocalRow,
} from "../src/lib/sync/core"
import type { SyncQueueItem } from "../src/lib/sync/types"

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
  shouldBackfillCalendarTable("study_sessions", null),
  true,
  "study sessions need a one-time backfill so stale local rows that never uploaded still reach Supabase",
)

assertEqual(
  shouldBackfillCalendarTable("projects", null),
  false,
  "calendar backfill should stay scoped to events and study sessions",
)

assertEqual(
  shouldBackfillCalendarTable("events", "2026-06-13T12:00:00.000Z"),
  false,
  "calendar backfill must stop after a clean successful flush",
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

const dirtyLocalEvent = {
  id: "event-1",
  title: "Local edit",
  updated_at: "2026-06-13T09:00:00.000Z",
  deleted_at: null,
  last_modified_device_id: "device-local",
}

assertJsonEqual(
  mergeRemoteRecords({
    table: "events",
    local: [dirtyLocalEvent],
    remote: [{
      id: "event-1",
      title: "Newer remote edit",
      updated_at: "2026-06-13T10:00:00.000Z",
      deleted_at: null,
      last_modified_device_id: "device-remote",
    }],
    remoteToLocal: (row) => row,
    currentDeviceId: "device-local",
    changedRowIds: { events: ["event-1"] },
  }),
  [dirtyLocalEvent],
  "unflushed local event edit must survive a newer remote pull",
)

const dirtyLocalSession = {
  id: "session-1",
  title: "Local study plan",
  updated_at: "2026-06-13T09:00:00.000Z",
  deleted_at: null,
  last_modified_device_id: "device-local",
}

assertJsonEqual(
  mergeRemoteRecords({
    table: "study_sessions",
    local: [dirtyLocalSession],
    remote: [{
      id: "session-1",
      updated_at: "2026-06-13T10:00:00.000Z",
      deleted_at: "2026-06-13T10:00:00.000Z",
      last_modified_device_id: "device-remote",
    }],
    remoteToLocal: () => null,
    currentDeviceId: "device-local",
    changedRowIds: { study_sessions: ["session-1"] },
  }),
  [dirtyLocalSession],
  "unflushed local study session must survive a remote tombstone",
)

assertJsonEqual(
  mergeRemoteRecords({
    table: "events",
    local: [{
      id: "event-2",
      title: "Old local",
      updated_at: "2026-06-13T07:00:00.000Z",
      deleted_at: null,
      last_modified_device_id: "device-local",
    }],
    remote: [{
      id: "event-2",
      title: "Fresh remote",
      updated_at: "2026-06-13T10:00:00.000Z",
      deleted_at: null,
      last_modified_device_id: "device-remote",
    }],
    remoteToLocal: (row) => row,
    currentDeviceId: "device-local",
  }).map((event) => event.title),
  ["Fresh remote"],
  "clean local event should still accept a newer remote update",
)

const pendingEventUpsert: SyncQueueItem = {
  id: "queue-1",
  table: "events",
  operation: "upsert",
  rowId: "event-1",
  payload: { id: "event-1", title: "Draft" },
  createdAt: "2026-06-13T09:00:00.000Z",
  updatedAt: "2026-06-13T09:00:00.000Z",
  retryCount: 3,
}

const deleteReplacesUpsert = coalesceQueueItem(
  [pendingEventUpsert],
  { table: "events", operation: "soft_delete", rowId: "event-1", payload: { id: "event-1", deleted_at: "2026-06-13T10:00:00.000Z" } },
  "queue-2",
  "2026-06-13T10:00:00.000Z",
)

assertJsonEqual(
  deleteReplacesUpsert.map((item) => ({ operation: item.operation, retryCount: item.retryCount })),
  [{ operation: "soft_delete", retryCount: 0 }],
  "delete must replace a stale pending upsert and reset retries",
)

const restoreReplacesDelete = coalesceQueueItem(
  deleteReplacesUpsert,
  { table: "events", operation: "upsert", rowId: "event-1", payload: { id: "event-1", title: "Restored" } },
  "queue-3",
  "2026-06-13T11:00:00.000Z",
)

assertJsonEqual(
  restoreReplacesDelete.map((item) => ({ operation: item.operation, rowId: item.rowId })),
  [{ operation: "upsert", rowId: "event-1" }],
  "restore/upsert must replace a stale pending delete for the same event",
)

assertEqual(
  isQueueItemDue({ nextAttemptAt: "2026-06-13T09:59:59.000Z" }, "2026-06-13T10:00:00.000Z"),
  true,
  "queued retries should run once their next attempt time has passed",
)

assertEqual(
  isQueueItemDue({ nextAttemptAt: "2026-06-13T10:00:01.000Z" }, "2026-06-13T10:00:00.000Z"),
  false,
  "queued retries should wait until their backoff has elapsed",
)

assertJsonEqual(
  (({ retryCount, lastError, nextAttemptAt }) => ({ retryCount, lastError, nextAttemptAt }))(
    retryQueueItem(pendingEventUpsert, "network down", "2026-06-13T10:00:00.000Z"),
  ),
  {
    retryCount: 4,
    lastError: "network down",
    nextAttemptAt: "2026-06-13T10:00:40.000Z",
  },
  "retry scheduling should increment retries and set capped exponential backoff",
)

assertEqual(
  isRowInPullWindow(
    { updated_at: "2026-06-13T10:00:00.000Z" },
    "2026-06-13T09:00:00.000Z",
    "2026-06-13T10:00:00.000Z",
  ),
  true,
  "incremental pulls should include rows up to the pull high-water mark",
)

assertEqual(
  isRowInPullWindow(
    { updated_at: "2026-06-13T10:00:01.000Z" },
    "2026-06-13T09:00:00.000Z",
    "2026-06-13T10:00:00.000Z",
  ),
  false,
  "incremental pulls should leave rows after the high-water mark for the next pull",
)

assertEqual(
  isRowInPullWindow(
    { updated_at: "2026-06-13T09:00:00.000Z" },
    "2026-06-13T09:00:00.000Z",
    "2026-06-13T10:00:00.000Z",
  ),
  false,
  "incremental pulls should not refetch rows at the previous lastPulledAt boundary",
)

assertJsonEqual(
  clearQueueItemsFromMeta(
    {
      deviceId: "device-1",
      lastSuccessfulSyncAt: null,
      localChangedAt: {
        events: "2026-06-13T09:00:00.000Z",
        study_sessions: "2026-06-13T09:00:00.000Z",
      },
      localChangedRowIds: {
        events: ["event-1"],
        study_sessions: ["session-1"],
      },
      deletedRowIds: {
        events: ["event-1"],
      },
    },
    [{ table: "events", rowId: "event-1" }],
  ),
  {
    deviceId: "device-1",
    lastSuccessfulSyncAt: null,
    localChangedAt: {
      study_sessions: "2026-06-13T09:00:00.000Z",
    },
    localChangedRowIds: {
      events: [],
      study_sessions: ["session-1"],
    },
    deletedRowIds: {
      events: [],
    },
  },
  "max-retry cleanup should stop requeueing dropped rows without clearing unrelated dirty study sessions",
)

assertJsonEqual(
  scrubUserSettingsSecrets({
    openrouter_api_key: "sk-or-secret",
    openrouter_model: "openai/gpt-4o-mini",
    reasoning_effort: "medium",
    reasoning_max_tokens: 8000,
    reasoning_exclude: false,
    notion_token: "secret_notion",
    notion_data_source_id: "database-id",
    notion_title_property: "Name",
    notion_date_property: "Date",
    notion_type_property: "Type",
    notion_completed_property: "Complete",
    notion_subject_property: "Subject",
  }),
  {
    openrouter_api_key: "",
    openrouter_model: "openai/gpt-4o-mini",
    reasoning_effort: "medium",
    reasoning_max_tokens: 8000,
    reasoning_exclude: false,
    notion_token: "",
    notion_data_source_id: "database-id",
    notion_title_property: "Name",
    notion_date_property: "Date",
    notion_type_property: "Type",
    notion_completed_property: "Complete",
    notion_subject_property: "Subject",
  },
  "user settings sync payload must keep bearer secrets blank",
)
