/**
 * Persistent sync outbox. The public functions keep the old queue API while
 * storage lives in IndexedDB instead of fragile app-data JSON.
 */
import { coalesceQueueItem } from "@/lib/sync/core"
import { readStoredOutbox, writeStoredOutbox } from "@/lib/sync/store"
import type { SyncQueueItem } from "@/lib/sync/types"

let writeLock: Promise<unknown> = Promise.resolve()

async function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeLock.then(operation, operation)
  writeLock = result.catch((e: unknown) => {
    console.error("Failed to write sync queue:", e)
  })
  return result
}

export async function readSyncQueue(): Promise<SyncQueueItem[]> {
  return readStoredOutbox()
}

export async function writeSyncQueue(items: SyncQueueItem[]): Promise<void> {
  await withQueueLock(async () => {
    await writeStoredOutbox(items)
  })
}

export async function enqueueSyncItem(item: Omit<SyncQueueItem, "id" | "createdAt" | "updatedAt" | "retryCount">): Promise<SyncQueueItem[]> {
  return withQueueLock(async () => {
    const queue = await readStoredOutbox()
    const now = new Date().toISOString()
    const updated = coalesceQueueItem(queue, item, crypto.randomUUID(), now)

    await writeStoredOutbox(updated)
    return updated
  })
}

export async function finishSyncQueueFlush(processedIds: string[], remainingProcessedItems: SyncQueueItem[]): Promise<SyncQueueItem[]> {
  return withQueueLock(async () => {
    const processed = new Set(processedIds)
    const latest = await readStoredOutbox()
    const next = latest.filter((item) => !processed.has(item.id))

    for (const item of remainingProcessedItems) {
      const newerSameRow = next.some((queued) => queued.table === item.table && queued.rowId === item.rowId)
      if (!newerSameRow) next.push(item)
    }

    await writeStoredOutbox(next)
    return next
  })
}
