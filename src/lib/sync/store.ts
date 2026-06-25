import { appDataDir } from "@tauri-apps/api/path"
import { exists, mkdir, readTextFile } from "@tauri-apps/plugin-fs"
import { isSyncTable } from "@/lib/sync/core"
import type { SyncMeta, SyncQueueItem } from "@/lib/sync/types"

const DB_NAME = "focal-sync"
const DB_VERSION = 1
const OUTBOX_STORE = "outbox"
const META_STORE = "meta"
const SYNC_META_KEY = "sync-meta"
const MIGRATION_KEY = "legacy-json-migrated-v1"
const QUEUE_FILE = "sync-queue.json"
const META_FILE = "sync-meta.json"

let dbPromise: Promise<IDBDatabase> | null = null
let migrationPromise: Promise<void> | null = null

export async function readStoredOutbox(): Promise<SyncQueueItem[]> {
  await ensureLegacyMigration()
  const db = await openDb()
  const tx = db.transaction(OUTBOX_STORE, "readonly")
  return parseOutboxItems(await requestToPromise(tx.objectStore(OUTBOX_STORE).getAll()))
}

export async function writeStoredOutbox(items: SyncQueueItem[]): Promise<void> {
  await ensureLegacyMigration()
  const db = await openDb()
  const tx = db.transaction(OUTBOX_STORE, "readwrite")
  const store = tx.objectStore(OUTBOX_STORE)
  store.clear()
  for (const item of items) store.put(item)
  await transactionDone(tx)
}

export async function readStoredMeta(): Promise<Partial<SyncMeta> | null> {
  await ensureLegacyMigration()
  const db = await openDb()
  const tx = db.transaction(META_STORE, "readonly")
  return parseMetaRecord<Partial<SyncMeta>>(await requestToPromise(tx.objectStore(META_STORE).get(SYNC_META_KEY)))
}

export async function writeStoredMeta(meta: SyncMeta): Promise<void> {
  await ensureLegacyMigration()
  const db = await openDb()
  const tx = db.transaction(META_STORE, "readwrite")
  tx.objectStore(META_STORE).put({ key: SYNC_META_KEY, value: meta })
  await transactionDone(tx)
}

async function ensureLegacyMigration(): Promise<void> {
  migrationPromise ??= migrateLegacyJson()
  return migrationPromise
}

async function migrateLegacyJson(): Promise<void> {
  const db = await openDb()
  const migrated = await readMetaRecord<boolean>(db, MIGRATION_KEY)
  if (migrated) return

  const [legacyQueue, legacyMeta] = await Promise.all([readLegacyQueue(), readLegacyMeta()])
  const existingOutbox = await readStoredOutboxWithoutMigration(db)
  const existingMeta = await readMetaRecord<Partial<SyncMeta>>(db, SYNC_META_KEY)

  const tx = db.transaction([OUTBOX_STORE, META_STORE], "readwrite")
  const outbox = tx.objectStore(OUTBOX_STORE)
  const meta = tx.objectStore(META_STORE)
  if (existingOutbox.length === 0) {
    for (const item of legacyQueue) outbox.put(item)
  }
  if (!existingMeta && legacyMeta) {
    meta.put({ key: SYNC_META_KEY, value: legacyMeta })
  }
  meta.put({ key: MIGRATION_KEY, value: true })
  await transactionDone(tx)
}

async function readStoredOutboxWithoutMigration(db: IDBDatabase): Promise<SyncQueueItem[]> {
  const tx = db.transaction(OUTBOX_STORE, "readonly")
  return parseOutboxItems(await requestToPromise(tx.objectStore(OUTBOX_STORE).getAll()))
}

async function readMetaRecord<T>(db: IDBDatabase, key: string): Promise<T | null> {
  const tx = db.transaction(META_STORE, "readonly")
  return parseMetaRecord<T>(await requestToPromise(tx.objectStore(META_STORE).get(key)))
}

async function readLegacyQueue(): Promise<SyncQueueItem[]> {
  try {
    const path = await appDataPath(QUEUE_FILE)
    if (!(await exists(path))) return []
    const parsed: unknown = JSON.parse(await readTextFile(path))
    if (!Array.isArray(parsed)) return []
    const byRow = new Map<string, SyncQueueItem>()
    for (const item of parsed.filter(isSyncQueueItem)) {
      byRow.set(`${item.table}:${item.rowId}`, { ...item, updatedAt: item.updatedAt ?? item.createdAt })
    }
    return Array.from(byRow.values())
  } catch (e) {
    console.error("[sync] failed to migrate sync-queue.json:", e)
    return []
  }
}

async function readLegacyMeta(): Promise<Partial<SyncMeta> | null> {
  try {
    const path = await appDataPath(META_FILE)
    if (!(await exists(path))) return null
    const parsed: unknown = JSON.parse(await readTextFile(path))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch (e) {
    console.error("[sync] failed to migrate sync-meta.json:", e)
    return null
  }
}

function isSyncQueueItem(item: unknown): item is SyncQueueItem {
  const record = item as Partial<SyncQueueItem>
  return (
    typeof record?.id === "string" &&
    isSyncTable(record.table) &&
    (record.operation === "upsert" || record.operation === "soft_delete") &&
    typeof record.rowId === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.retryCount === "number"
  )
}

async function appDataPath(fileName: string): Promise<string> {
  const baseDir = await appDataDir()
  if (!(await exists(baseDir))) {
    await mkdir(baseDir, { recursive: true })
  }
  return `${baseDir}/${fileName}`
}

function openDb(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis)) {
    throw new Error("IndexedDB is not available for sync storage")
  }
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" })
        outbox.createIndex("row", ["table", "rowId"], { unique: true })
        outbox.createIndex("nextAttemptAt", "nextAttemptAt")
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(toError(request.error, "Failed to open sync store"))
  })
  return dbPromise
}

function requestToPromise(request: IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(toError(request.error, "IndexedDB request failed"))
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(toError(tx.error, "IndexedDB transaction failed"))
    tx.onabort = () => reject(toError(tx.error, "IndexedDB transaction aborted"))
  })
}

function parseOutboxItems(value: unknown): SyncQueueItem[] {
  return Array.isArray(value)
    ? value.filter(isSyncQueueItem).map((item) => ({ ...item, updatedAt: item.updatedAt ?? item.createdAt }))
    : []
}

function parseMetaRecord<T>(value: unknown): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("value" in value)) return null
  return value.value as T
}

function toError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback)
}
