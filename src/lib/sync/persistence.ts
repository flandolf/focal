import { openFocalDatabase } from "@/lib/storage/database"
import { isSyncTable } from "@/lib/sync/protocol"
import type { SyncChange, SyncOperation, SyncTable } from "@/lib/sync/types"

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
}

interface StateRow {
  value: string
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
            retry_count, last_error, next_attempt_at
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
    await database.execute(
      `insert into sync_outbox (
         change_id, account_id, entity, row_id, operation, payload, created_at,
         retry_count, last_error, next_attempt_at
       ) values ($1, $2, $3, $4, $5, $6, $7, 0, null, null)
       on conflict (account_id, entity, row_id) do update set
         change_id = excluded.change_id,
         operation = excluded.operation,
         payload = excluded.payload,
         created_at = excluded.created_at,
         retry_count = 0,
         last_error = null,
         next_attempt_at = null`,
      [changeId, accountId, entity, rowId, operation, payload === null ? null : JSON.stringify(payload), now],
    )
    return readOutboxUnlocked(database, accountId)
  })
}

export function claimUnownedOutbox(accountId: string): Promise<void> {
  return serialized(async () => {
    const database = await openFocalDatabase()
    const unowned = await database.select<OutboxRow[]>(
      `select change_id, account_id, entity, row_id, operation, payload, created_at,
              retry_count, last_error, next_attempt_at
         from sync_outbox
        where account_id = ''
        order by created_at asc`,
    )
    for (const change of unowned) {
      await database.execute(
        "delete from sync_outbox where account_id = $1 and entity = $2 and row_id = $3",
        [accountId, change.entity, change.row_id],
      )
      await database.execute(
        "update sync_outbox set account_id = $1 where change_id = $2 and account_id = ''",
        [accountId, change.change_id],
      )
    }
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
            set retry_count = $2, last_error = $3, next_attempt_at = $4
          where change_id = $1`,
        [change.changeId, change.retryCount, change.lastError ?? null, change.nextAttemptAt ?? null],
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
            retry_count, last_error, next_attempt_at
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
    }]
  } catch {
    return []
  }
}
