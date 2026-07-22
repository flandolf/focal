import { openFocalDatabase } from "@/lib/storage/database"
import { isSyncTable } from "@/lib/sync/protocol"
import type { RemoteSyncChange, SyncChange, SyncOperation, SyncTable } from "@/lib/sync/types"

interface OutboxRow {
  change_id: string
  account_id: string
  entity: string
  row_id: string
  operation: string
  payload: string | null
  created_at: string
  retry_count: number
  last_error: string | null
  next_attempt_at: string | null
  blocked_at: string | null
}

interface InboxRow {
  account_id: string
  entity: string
  row_id: string
  change_id: string
  device_id: string
  operation: string
  payload: string | null
  revision: number
  created_at: string
}

interface StateRow {
  value: string
}

interface ContextRow {
  account_id: string
  last_account_id: string
}

let lock: Promise<unknown> = Promise.resolve()

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = lock.then(operation, operation)
  lock = result.catch((error: unknown) => console.error("Failed to persist sync state:", error))
  return result
}

export async function readOutbox(accountId?: string): Promise<SyncChange[]> {
  await lock
  const database = await openFocalDatabase()
  const rows = await database.select<OutboxRow[]>(
    `select change_id, account_id, entity, row_id, operation, payload, created_at,
            retry_count, last_error, next_attempt_at, blocked_at
       from sync_outbox
      ${accountId === undefined ? "" : "where account_id = $1"}
      order by created_at asc`,
    accountId === undefined ? [] : [accountId],
  )
  return rows.flatMap(parseOutboxRow)
}

export function enqueueChange(
  accountId: string,
  entity: SyncTable,
  rowId: string,
  operation: SyncOperation,
  payload: unknown,
): Promise<SyncChange[]> {
  return serialized(async () => {
    const changeId = crypto.randomUUID()
    const now = new Date().toISOString()
    const database = await openFocalDatabase()
    const context = accountId === ""
      ? await database.select<ContextRow[]>(
        "select account_id, last_account_id from sync_local_context where singleton = 1",
      )
      : []
    const ownerAccountId = accountId || context[0]?.account_id || ""
    await database.execute(
      `insert into sync_outbox (
         change_id, account_id, entity, row_id, operation, payload, created_at,
         retry_count, last_error, next_attempt_at, blocked_at
       ) values ($1, $2, $3, $4, $5, $6, $7, 0, null, null, null)
       on conflict (account_id, entity, row_id) do update set
         change_id = excluded.change_id,
         operation = excluded.operation,
         payload = excluded.payload,
         created_at = excluded.created_at,
         retry_count = 0,
         last_error = null,
         next_attempt_at = null,
         blocked_at = null`,
      [changeId, ownerAccountId, entity, rowId, operation, payload === null ? null : JSON.stringify(payload), now],
    )
    return readOutboxUnlocked(database, ownerAccountId)
  })
}

export function activateOutboxAccount(accountId: string): Promise<void> {
  return serialized(async () => {
    const database = await openFocalDatabase()
    const context = await database.select<ContextRow[]>(
      "select account_id, last_account_id from sync_local_context where singleton = 1",
    )
    const lastAccountId = context[0]?.last_account_id ?? ""
    const canClaimUnowned = accountId.length > 0 && (lastAccountId === "" || lastAccountId === accountId)
    if (canClaimUnowned) {
      const unowned = await database.select<OutboxRow[]>(
        `select change_id, account_id, entity, row_id, operation, payload, created_at,
                retry_count, last_error, next_attempt_at, blocked_at
           from sync_outbox
          where account_id = ''
          order by created_at asc`,
      )
      for (const change of unowned) {
        await database.execute(
          `delete from sync_outbox
            where account_id = $1 and entity = $2 and row_id = $3 and created_at <= $4`,
          [accountId, change.entity, change.row_id, change.created_at],
        )
        await database.execute(
          `update or ignore sync_outbox
              set account_id = $1
            where change_id = $2 and account_id = ''`,
          [accountId, change.change_id],
        )
        await database.execute(
          "delete from sync_outbox where change_id = $1 and account_id = ''",
          [change.change_id],
        )
      }
    }
    await database.execute(
      `update sync_local_context
          set account_id = case when $1 = '' then last_account_id else $1 end,
              last_account_id = case when $1 = '' then last_account_id else $1 end
        where singleton = 1`,
      [accountId],
    )
  })
}

export function finishFlush(accountId: string, processedIds: string[], retries: SyncChange[]): Promise<SyncChange[]> {
  return serialized(async () => {
    const database = await openFocalDatabase()
    for (const changeId of processedIds) {
      await database.execute("delete from sync_outbox where change_id = $1", [changeId])
    }
    for (const change of retries) {
      await database.execute(
        `update sync_outbox
            set retry_count = $2, last_error = $3, next_attempt_at = $4, blocked_at = $5
          where change_id = $1`,
        [
          change.changeId,
          change.retryCount,
          change.lastError ?? null,
          change.nextAttemptAt ?? null,
          change.blockedAt ?? null,
        ],
      )
    }
    return readOutboxUnlocked(database, accountId)
  })
}

export function removeOutboxChange(accountId: string, entity: SyncTable, rowId: string): Promise<void> {
  return serialized(async () => {
    await (await openFocalDatabase()).execute(
      "delete from sync_outbox where account_id = $1 and entity = $2 and row_id = $3",
      [accountId, entity, rowId],
    )
  })
}

export function suppressRecordOutbox(
  records: { entity: "projects" | "events" | "study_sessions"; rowId: string; payload: unknown }[],
): Promise<void> {
  if (records.length === 0) return Promise.resolve()
  return serialized(async () => {
    const database = await openFocalDatabase()
    for (const record of records) {
      await database.execute(
        `insert into sync_record_suppress (entity, row_id, payload)
         values ($1, $2, $3)
         on conflict (entity, row_id) do update set payload = excluded.payload`,
        [record.entity, record.rowId, JSON.stringify(record.payload)],
      )
    }
  })
}

export function clearRecordOutboxSuppressions(
  records: { entity: "projects" | "events" | "study_sessions"; rowId: string; payload: unknown }[],
): Promise<void> {
  if (records.length === 0) return Promise.resolve()
  return serialized(async () => {
    const database = await openFocalDatabase()
    for (const record of records) {
      await database.execute(
        "delete from sync_record_suppress where entity = $1 and row_id = $2 and payload = $3",
        [record.entity, record.rowId, JSON.stringify(record.payload)],
      )
    }
  })
}

export async function readInbox(accountId: string): Promise<RemoteSyncChange[]> {
  await lock
  const rows = await (await openFocalDatabase()).select<InboxRow[]>(
    `select account_id, entity, row_id, change_id, device_id, operation, payload, revision, created_at
       from sync_inbox
      where account_id = $1
      order by revision asc`,
    [accountId],
  )
  return rows.flatMap(parseInboxRow)
}

export function deferInboxChanges(accountId: string, changes: RemoteSyncChange[]): Promise<void> {
  if (changes.length === 0) return Promise.resolve()
  return serialized(async () => {
    const database = await openFocalDatabase()
    for (const change of changes) {
      await database.execute(
        `insert into sync_inbox (
           account_id, entity, row_id, change_id, device_id, operation, payload, revision, created_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (account_id, entity, row_id) do update set
           change_id = excluded.change_id,
           device_id = excluded.device_id,
           operation = excluded.operation,
           payload = excluded.payload,
           revision = excluded.revision,
           created_at = excluded.created_at
         where excluded.revision > sync_inbox.revision`,
        [
          accountId,
          change.entity,
          change.row_id,
          change.change_id,
          change.device_id,
          change.operation,
          change.payload == null ? null : JSON.stringify(change.payload),
          change.revision,
          change.created_at,
        ],
      )
    }
  })
}

export function removeInboxChanges(accountId: string, changes: RemoteSyncChange[]): Promise<void> {
  if (changes.length === 0) return Promise.resolve()
  return serialized(async () => {
    const database = await openFocalDatabase()
    for (const change of changes) {
      await database.execute(
        `delete from sync_inbox
          where account_id = $1 and entity = $2 and row_id = $3 and revision <= $4`,
        [accountId, change.entity, change.row_id, change.revision],
      )
    }
  })
}

export async function readState<T>(key: string): Promise<T | null> {
  await lock
  const rows = await (await openFocalDatabase()).select<StateRow[]>(
    "select value from sync_state where key = $1",
    [key],
  )
  if (!rows[0]) return null
  try {
    return JSON.parse(rows[0].value) as T
  } catch {
    return null
  }
}

export function writeState(key: string, value: unknown): Promise<void> {
  return serialized(async () => {
    await (await openFocalDatabase()).execute(
      `insert into sync_state (key, value, updated_at)
       values ($1, $2, $3)
       on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), new Date().toISOString()],
    )
  })
}

async function readOutboxUnlocked(database: Awaited<ReturnType<typeof openFocalDatabase>>, accountId: string): Promise<SyncChange[]> {
  const rows = await database.select<OutboxRow[]>(
    `select change_id, account_id, entity, row_id, operation, payload, created_at,
            retry_count, last_error, next_attempt_at, blocked_at
       from sync_outbox
      where account_id = $1
      order by created_at asc`,
    [accountId],
  )
  return rows.flatMap(parseOutboxRow)
}

function parseOutboxRow(row: OutboxRow): SyncChange[] {
  if (!isSyncTable(row.entity)) return []
  if (row.operation !== "put" && row.operation !== "delete") return []
  try {
    return [{
      changeId: row.change_id,
      entity: row.entity,
      rowId: row.row_id,
      operation: row.operation,
      payload: row.payload === null ? null : JSON.parse(row.payload) as unknown,
      createdAt: row.created_at,
      retryCount: row.retry_count,
      lastError: row.last_error ?? undefined,
      nextAttemptAt: row.next_attempt_at ?? undefined,
      blockedAt: row.blocked_at ?? undefined,
    }]
  } catch {
    return []
  }
}

function parseInboxRow(row: InboxRow): RemoteSyncChange[] {
  if (!isSyncTable(row.entity)) return []
  if (row.operation !== "put" && row.operation !== "delete") return []
  try {
    return [{
      user_id: row.account_id,
      change_id: row.change_id,
      device_id: row.device_id,
      entity: row.entity,
      row_id: row.row_id,
      operation: row.operation,
      payload: row.payload === null ? null : JSON.parse(row.payload) as unknown,
      revision: row.revision,
      created_at: row.created_at,
    }]
  } catch {
    return []
  }
}
