export type CoreDataFile = "projects.json" | "events.json" | "sessions.json"

export type CoreRecordKind = "projects" | "events" | "study_sessions"

export interface StoredRecordInput {
  id: string
  payload: string
  position: number
}

export interface StoredPayloadRow {
  payload: string
}

const KIND_BY_FILE: Record<CoreDataFile, CoreRecordKind> = {
  "projects.json": "projects",
  "events.json": "events",
  "sessions.json": "study_sessions",
}

export function isCoreDataFile(fileName: string): fileName is CoreDataFile {
  return fileName in KIND_BY_FILE
}

export function coreRecordKind(fileName: CoreDataFile): CoreRecordKind {
  return KIND_BY_FILE[fileName]
}

export function prepareStoredRecords(items: unknown[]): StoredRecordInput[] {
  return items.map((item, position) => {
    const record = typeof item === "object" && item !== null && !Array.isArray(item)
      ? item as Record<string, unknown>
      : null
    const id = typeof record?.id === "string" && record.id.trim()
      ? record.id
      : `legacy:${position}`
    return {
      id,
      payload: JSON.stringify(item) ?? "null",
      position,
    }
  })
}

export function parseStoredPayloads(rows: StoredPayloadRow[]): unknown[] {
  const parsed: unknown[] = []
  for (const row of rows) {
    try {
      parsed.push(JSON.parse(row.payload) as unknown)
    } catch {
      // A database constraint prevents new invalid JSON. Ignore a corrupted row
      // so one record cannot make every assessment, event, or session disappear.
    }
  }
  return parsed
}
