/**
 * Persistent on-disk sync queue stored in the Tauri app-data directory.
 * All writes are serialised behind a single promise lock so concurrent
 * flush / enqueue paths cannot overwrite each other.
 */
import { appDataDir } from "@tauri-apps/api/path"
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { coalesceQueueItem, isSyncTable } from "@/lib/sync/core"
import type { SyncQueueItem } from "@/lib/sync/types"

const QUEUE_FILE = "sync-queue.json"

// Serialize queue writes so concurrent flush/enqueue paths cannot overwrite
// each other's changes.
let writeLock: Promise<unknown> = Promise.resolve()

async function getQueuePath(): Promise<string> {
  const baseDir = await appDataDir()
  if (!(await exists(baseDir))) {
    await mkdir(baseDir, { recursive: true })
  }
  return `${baseDir}/${QUEUE_FILE}`
}

async function readSyncQueueUnlocked(): Promise<SyncQueueItem[]> {
  try {
    const path = await getQueuePath()
    if (!(await exists(path))) return []
    const raw = await readTextFile(path)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (parseErr) {
      // Corrupted file (e.g. from a concurrent write race). Return empty
      // so the caller overwrites it with valid JSON on the next write.
      console.error("[sync] corrupt sync-queue.json, resetting:", parseErr)
      return []
    }
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SyncQueueItem => {
      const record = item as Partial<SyncQueueItem>
      return (
        typeof record.id === "string" &&
        isSyncTable(record.table) &&
        (record.operation === "upsert" || record.operation === "soft_delete") &&
        typeof record.rowId === "string" &&
        typeof record.createdAt === "string" &&
        typeof record.retryCount === "number"
      )
    })
  } catch (e) {
    console.error("Failed to read sync queue:", e)
    return []
  }
}

async function writeSyncQueueUnlocked(items: SyncQueueItem[]): Promise<void> {
  const path = await getQueuePath()
  await writeTextFile(path, JSON.stringify(items, null, 2))
}

async function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeLock.then(operation, operation)
  writeLock = result.catch((e: unknown) => {
    console.error("Failed to write sync queue:", e)
  })
  return result
}

export async function readSyncQueue(): Promise<SyncQueueItem[]> {
  return readSyncQueueUnlocked()
}

export async function writeSyncQueue(items: SyncQueueItem[]): Promise<void> {
  await withQueueLock(async () => {
    await writeSyncQueueUnlocked(items)
  })
}

export async function enqueueSyncItem(item: Omit<SyncQueueItem, "id" | "createdAt" | "retryCount">): Promise<SyncQueueItem[]> {
  return withQueueLock(async () => {
    const queue = await readSyncQueueUnlocked()
    const updated = coalesceQueueItem(queue, item, crypto.randomUUID(), new Date().toISOString())

    await writeSyncQueueUnlocked(updated)
    return updated
  })
}

export async function finishSyncQueueFlush(processedIds: string[], remainingProcessedItems: SyncQueueItem[]): Promise<SyncQueueItem[]> {
  return withQueueLock(async () => {
    const processed = new Set(processedIds)
    const latest = await readSyncQueueUnlocked()
    const next = latest.filter((item) => !processed.has(item.id))

    for (const item of remainingProcessedItems) {
      const newerSameRow = next.some((queued) => queued.table === item.table && queued.rowId === item.rowId)
      if (!newerSameRow) next.push(item)
    }

    await writeSyncQueueUnlocked(next)
    return next
  })
}
