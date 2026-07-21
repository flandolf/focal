import { latestChanges, repairDuplicateSessions, retryChange } from "../src/lib/sync/protocol"
import type { RemoteSyncChange, SyncChange } from "../src/lib/sync/types"

interface BunSqliteDatabase {
  exec(sql: string): void
  run(sql: string, values: unknown[]): void
  query(sql: string): { all(): unknown[] }
  close(): void
}

interface BunSqliteModule {
  Database: new (path: string) => BunSqliteDatabase
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`)
}

function remote(overrides: Partial<RemoteSyncChange>): RemoteSyncChange {
  return {
    user_id: "user-1",
    change_id: crypto.randomUUID(),
    device_id: "device-1",
    entity: "events",
    row_id: "event-1",
    operation: "put",
    payload: { id: "event-1", title: "Event" },
    revision: 1,
    created_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  }
}

assertEqual(
  latestChanges([
    remote({ revision: 1, payload: { title: "old" } }),
    remote({ revision: 3, payload: null, operation: "delete" }),
    remote({ row_id: "event-2", revision: 2, payload: { title: "other" } }),
  ]).map((change) => [change.row_id, change.operation, change.revision]),
  [["event-2", "put", 2], ["event-1", "delete", 3]],
  "server revision order must deterministically reduce each entity row",
)

const queued: SyncChange = {
  changeId: "change-1",
  entity: "events",
  rowId: "event-1",
  operation: "put",
  payload: { id: "event-1" },
  createdAt: "2026-07-20T00:00:00.000Z",
  retryCount: 0,
}
assertEqual(
  retryChange(queued, "offline", "2026-07-20T00:00:00.000Z"),
  { ...queued, retryCount: 1, lastError: "offline", nextAttemptAt: "2026-07-20T00:00:05.000Z" },
  "failed immutable changes must remain queued with bounded backoff",
)

const duplicateBase = {
  schemaVersion: 2 as const,
  subjectIds: ["mm"],
  title: "Focus",
  topics: [],
  schedule: { blocks: [{ start: "2026-07-20T01:00:00.000Z", end: "2026-07-20T01:30:00.000Z" }] },
  execution: { state: "completed" as const, intervals: [], completedAt: "2026-07-20T01:30:00.000Z" },
  createdVia: "notion" as const,
  created_at: "2026-07-20T02:00:00.000Z",
}
const repaired = repairDuplicateSessions([
  { ...duplicateBase, id: "session-b", integrations: { notion: { type: "notion", id: "page-b", kind: "session" } } },
  { ...duplicateBase, id: "session-a", integrations: { notion: { type: "notion", id: "page-a", kind: "session" } } },
])
assertEqual(repaired.sessions.map((session) => session.id), ["session-a"], "duplicate repair must choose one stable canonical session")
assertEqual(repaired.duplicateIds, ["session-b"], "duplicate repair must emit durable deletion ids")
assertEqual(repaired.duplicateNotionPageIds, ["page-b"], "duplicate repair must retain orphan Notion pages for cleanup")

const remoteMigration = await fetch(new URL("../supabase/migrations/0004_rebuild_sync_as_change_log.sql", import.meta.url)).then((response) => response.text())
for (const required of [
  "drop table if exists public.study_sessions",
  "create table public.sync_changes",
  "create table public.sync_change_receipts",
  "reject_replayed_focal_sync_change_before_insert",
  "compact_focal_sync_changes_after_insert",
  "enable row level security",
  "alter publication supabase_realtime add table public.sync_changes",
]) {
  if (!remoteMigration.includes(required)) throw new Error(`Supabase sync rebuild is missing: ${required}`)
}

const finalMigration = await fetch(new URL("../supabase/migrations/0005_finalize_sync_rebuild.sql", import.meta.url)).then((response) => response.text())
for (const required of [
  "drop function if exists public.set_updated_at() cascade",
  "revoke all on public.sync_change_receipts",
  "Legacy Focal sync tables still exist",
  "Focal sync idempotency or compaction trigger is missing",
  "sync_changes is missing from the Realtime publication",
  "append-only security model",
]) {
  if (!finalMigration.includes(required)) throw new Error(`Supabase sync finalization is missing: ${required}`)
}

const localMigration = await fetch(new URL("../src-tauri/migrations/0002_rebuild_sync_outbox.sql", import.meta.url)).then((response) => response.text())
for (const required of [
  "drop table if exists sync_outbox",
  "operation in ('put', 'delete')",
  "account_id text not null default ''",
  "sync_outbox_delete_local_record_after_insert",
  "sync_outbox_delete_local_record_after_update",
  "create table sync_state",
]) {
  if (!localMigration.includes(required)) throw new Error(`Local sync rebuild is missing: ${required}`)
}

// @ts-expect-error Bun provides this test-only module; the browser app deliberately omits Bun types.
const sqliteModule = await import("bun:sqlite") as unknown as BunSqliteModule
const localDatabase = new sqliteModule.Database(":memory:")
localDatabase.exec(await fetch(new URL("../src-tauri/migrations/0001_local_database.sql", import.meta.url)).then((response) => response.text()))
localDatabase.run(
  "insert into records (kind, id, payload, position) values (?, ?, ?, ?)",
  ["events", "deleted-event", JSON.stringify({ id: "deleted-event" }), 0],
)
localDatabase.exec(localMigration)
localDatabase.run(
  `insert into sync_outbox (change_id, entity, row_id, operation, payload, created_at)
   values (?, ?, ?, ?, ?, ?)`,
  ["delete-change", "events", "deleted-event", "delete", null, "2026-07-20T00:00:00.000Z"],
)
assertEqual(
  localDatabase.query("select id from records where id = 'deleted-event'").all(),
  [],
  "persisting a delete must atomically remove its local record",
)
localDatabase.run(
  `insert into sync_outbox (change_id, account_id, entity, row_id, operation, payload, created_at)
   values (?, ?, ?, ?, ?, ?, ?)`,
  ["account-a-change", "account-a", "events", "shared-row", "put", JSON.stringify({ id: "shared-row" }), "2026-07-20T00:00:01.000Z"],
)
localDatabase.run(
  `insert into sync_outbox (change_id, account_id, entity, row_id, operation, payload, created_at)
   values (?, ?, ?, ?, ?, ?, ?)`,
  ["account-b-change", "account-b", "events", "shared-row", "put", JSON.stringify({ id: "shared-row" }), "2026-07-20T00:00:02.000Z"],
)
assertEqual(
  localDatabase.query("select account_id from sync_outbox where row_id = 'shared-row' order by account_id").all(),
  [{ account_id: "account-a" }, { account_id: "account-b" }],
  "pending changes for different Supabase accounts must remain isolated",
)
localDatabase.close()

console.warn("sync change-log self-check passed")
