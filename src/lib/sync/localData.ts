import { readPersistedArray, writePersistedArray } from "@/lib/storage/database"
import type { CoreDataFile } from "@/lib/storage/records"
import type { SyncTable } from "@/lib/sync/types"

export const SYNC_DATA_FILES: Partial<Record<SyncTable, CoreDataFile>> = {
  projects: "projects.json",
  events: "events.json",
  study_sessions: "sessions.json",
}

export async function readLocalDataArray<T>(fileName: CoreDataFile): Promise<T[]> {
  return await readPersistedArray(fileName) as T[]
}

export async function writeLocalDataArray(fileName: CoreDataFile, items: unknown[]): Promise<void> {
  await writePersistedArray(fileName, items)
}

export function readLocalStorageArray<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

export function emitLocalDataChanged(table: SyncTable): void {
  window.dispatchEvent(new CustomEvent("focal-sync-data-changed", {
    detail: { table, fileName: SYNC_DATA_FILES[table] },
  }))
  if (table === "timetable_config") {
    window.dispatchEvent(new CustomEvent("focal-timetable-updated"))
  }
}
