type BackupRecord = Record<string, unknown>

export interface BackupData {
  projects?: unknown[]
  sessions?: unknown[]
  events?: unknown[]
}

function isRecord(value: unknown): value is BackupRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasStrings(value: unknown, fields: string[]): boolean {
  return isRecord(value) && fields.every((field) => typeof value[field] === "string")
}

function readArray(data: BackupRecord, key: string): unknown[] | undefined {
  const value = data[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`Backup field "${key}" must be an array`)
  return value as unknown[]
}

export function parseBackup(text: string): BackupData {
  const parsed = JSON.parse(text) as unknown
  if (!isRecord(parsed)) throw new Error("Backup must be a JSON object")

  const assessments = readArray(parsed, "assessments")
  const legacyProjects = readArray(parsed, "projects")
  const projects = assessments ?? legacyProjects
  const sessions = readArray(parsed, "sessions")
  const events = readArray(parsed, "events")

  if (!projects && !sessions && !events) throw new Error("No Focal data found in backup")
  if (projects?.some((item) => !hasStrings(item, ["id", "name", "folder_path"]))) {
    throw new Error("Backup contains an invalid assessment")
  }
  if (sessions?.some((item) => !hasStrings(item, ["id", "title", "startTime", "endTime"]))) {
    throw new Error("Backup contains an invalid session")
  }
  if (events?.some((item) => !hasStrings(item, ["id", "title", "startTime", "eventType"]))) {
    throw new Error("Backup contains an invalid event")
  }

  return { projects, sessions, events }
}
