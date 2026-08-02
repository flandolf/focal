/// <reference types="bun-types" />

import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Database } from "bun:sqlite"
import {
  type RateLimitBucket,
  type StoredSession,
} from "@opencoredev/loginwithchatgpt-server"
import { createChatGPTAuth, handleChatGPTRequest } from "./chatgpt"
import { SqliteKeyValueStore } from "./local-store"

const DEFAULT_PORT = 41_731
const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:1420",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
].join(",")

function localPort(): number {
  const value = Number(process.env.FOCAL_CHATGPT_PORT ?? DEFAULT_PORT)
  if (!Number.isInteger(value) || value < 1024 || value > 65_535) {
    throw new Error("FOCAL_CHATGPT_PORT must be an integer between 1024 and 65535")
  }
  return value
}

async function loadOrCreateSecret(dataDirectory: string): Promise<string> {
  const path = join(dataDirectory, "chatgpt.secret")
  try {
    const existing = (await readFile(path, "utf8")).trim()
    if (/^[a-f0-9]{64}$/i.test(existing)) return existing
  } catch {
    // Create the per-installation secret below.
  }

  const secret = randomBytes(32).toString("hex")
  await writeFile(path, secret, { encoding: "utf8", flag: "w" })
  return secret
}

const dataDirectory = process.env.FOCAL_CHATGPT_DATA_DIR ?? join(process.cwd(), ".focal-chatgpt")
await mkdir(dataDirectory, { recursive: true })
process.env.NODE_ENV = "production"
process.env.LWC_SECRET = await loadOrCreateSecret(dataDirectory)
process.env.LWC_ALLOWED_ORIGINS ??= LOCAL_ALLOWED_ORIGINS

const database = new Database(join(dataDirectory, "chatgpt.sqlite"))
database.run("PRAGMA busy_timeout = 5000")
database.run("PRAGMA journal_mode = WAL")
const sessionStore = new SqliteKeyValueStore<StoredSession>(database, "session")
const rateLimitStore = new SqliteKeyValueStore<RateLimitBucket>(database, "rate")
const auth = createChatGPTAuth({ sessionStore, rateLimitStore })
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: localPort(),
  fetch: (request) => {
    if (new URL(request.url).pathname === "/health") {
      return new Response("ok", { headers: { "cache-control": "no-store" } })
    }
    return handleChatGPTRequest(request, auth)
  },
})

console.warn(`[focal-chatgpt] listening on http://localhost:${server.port}`)

async function shutdown(): Promise<void> {
  await server.stop()
  database.close()
}

process.on("SIGINT", () => { void shutdown() })
process.on("SIGTERM", () => { void shutdown() })
