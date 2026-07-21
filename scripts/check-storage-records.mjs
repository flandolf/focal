import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import {
  coreRecordKind,
  parseStoredPayloads,
  prepareStoredRecords,
} from "../src/lib/storage/records.ts"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const prepared = prepareStoredRecords([
  { id: "project-1", name: "Methods SAC" },
  { title: "Legacy row without an id" },
])
assert(prepared[0]?.id === "project-1", "record ids must be preserved")
assert(prepared[1]?.id === "legacy:1", "legacy rows need deterministic fallback ids")
assert(coreRecordKind("sessions.json") === "study_sessions", "session storage mapping changed")

const parsed = parseStoredPayloads([
  { payload: prepared[0].payload },
  { payload: "not-json" },
])
assert(parsed.length === 1, "one corrupt payload must not hide valid records")

const migrationSource = readFileSync("src-tauri/migrations/0001_local_database.sql", "utf8")
const migrationChecksum = createHash("sha384").update(`${migrationSource}        `).digest("hex")
assert(
  migrationChecksum === "d0cdde6e2ac639e0f491d2115fa805c22cfc79246991ab98a51058c6187ca96ffbe35a886ed3eb3e53f32029dc6a7cb7",
  "migration 1 is immutable; add a new migration version instead",
)

const database = new Database(":memory:")
database.exec(migrationSource)
database.query("insert into records (kind, id, payload, position) values (?, ?, ?, ?)")
  .run("projects", "project-1", JSON.stringify({
    id: "project-1",
    deadline: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
  }), 0)
const indexed = database.query("select deadline, updated_at from records where kind = ? and id = ?")
  .get("projects", "project-1")
assert(indexed?.deadline === "2026-08-01T00:00:00.000Z", "deadline generated column is incorrect")
assert(indexed.updated_at === "2026-07-20T00:00:00.000Z", "updated_at generated column is incorrect")

let rejectedInvalidJson = false
try {
  database.query("insert into records (kind, id, payload, position) values (?, ?, ?, ?)")
    .run("events", "invalid", "not-json", 0)
} catch {
  rejectedInvalidJson = true
}
assert(rejectedInvalidJson, "database accepted an invalid JSON payload")

// eslint-disable-next-line no-console
console.log("storage record checks passed")
