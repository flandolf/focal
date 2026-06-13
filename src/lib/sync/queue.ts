import { appDataDir } from "@tauri-apps/api/path"
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import type { SyncQueueItem } from "@/lib/sync/types"

const QUEUE_FILE = "sync-queue.json"

// Serialize all queue writes to prevent concurrent corruption.
let writeLock: Promise<void> = Promise.resolve()

async function getQueuePath(): Promise<string> {
  const baseDir = await appDataDir()
  if (!(await exists(baseDir))) {
    await mkdir(baseDir, { recursive: true })
  }
  return `${baseDir}/${QUEUE_FILE}`
}

export async function readSyncQueue(): Promise<SyncQueueItem[]> {
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
        typeof record.table === "string" &&
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

export async function writeSyncQueue(items: SyncQueueItem[]): Promise<void> {
  const path = await getQueuePath()
  await writeTextFile(path, JSON.stringify(items, null, 2))
}

export async function enqueueSyncItem(item: Omit<SyncQueueItem, "id" | "createdAt" | "retryCount">): Promise<SyncQueueItem[]> {
  // Serialize through the write lock so concurrent enqueueSyncItem calls
  // cannot read stale data and overwrite each other's writes.
  const result = new Promise<SyncQueueItem[]>((resolve, reject) => {
    writeLock = writeLock.catch(() => {}).then(async () => {
      try {
        const queue = await readSyncQueue()
        const existingIndex = queue.findIndex((queued) => queued.table === item.table && queued.rowId === item.rowId)
        const nextItem: SyncQueueItem = {
          ...item,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          retryCount: 0,
        }

        const updated = [...queue]
        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...nextItem,
            id: updated[existingIndex].id,
            createdAt: updated[existingIndex].createdAt,
            retryCount: updated[existingIndex].retryCount,
          }
        } else {
          updated.push(nextItem)
        }

        await writeSyncQueue(updated)
        resolve(updated)
      } catch (e) {
        reject(e)
      }
    })
  })
  return result
}
