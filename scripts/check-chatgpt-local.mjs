import assert from "node:assert/strict"
import { Database } from "bun:sqlite"
import { SqliteKeyValueStore } from "../server/local-store.ts"

const database = new Database(":memory:")
const store = new SqliteKeyValueStore(database, "check")
store.set("session", { value: "persisted" }, { ttlMs: 60_000 })
assert.deepEqual(store.get("session"), { value: "persisted" })
store.delete("session")
assert.equal(store.get("session"), undefined)
database.close()
