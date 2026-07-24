import { invoke, isTauri } from "@tauri-apps/api/core"
import type { SupportedStorage } from "@supabase/supabase-js"

const CREDENTIAL_KEY = "supabase_auth_session"
let cachedValue: string | null | undefined

// Promise queue to serialize all operations and prevent race conditions
let operationQueue = Promise.resolve()

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation)
  operationQueue = result.then(() => undefined, () => undefined)
  return result
}

export const secureSupabaseStorage: SupportedStorage = {
  async getItem(key) {
    return enqueue(async () => {
      if (!isTauri()) return localStorage.getItem(key)
      if (cachedValue !== undefined) return cachedValue
      const stored = await invoke<string | null>("get_secret", { key: CREDENTIAL_KEY })
      if (stored !== null) {
        cachedValue = stored
        return stored
      }

      const legacy = localStorage.getItem(key)
      if (legacy !== null) {
        await invoke("set_secret", { key: CREDENTIAL_KEY, value: legacy })
        localStorage.removeItem(key)
      }
      cachedValue = legacy
      return legacy
    })
  },

  async setItem(key, value) {
    return enqueue(async () => {
      if (!isTauri()) {
        localStorage.setItem(key, value)
        return
      }
      if (cachedValue === value) return
      await invoke("set_secret", { key: CREDENTIAL_KEY, value })
      cachedValue = value
    })
  },

  async removeItem(key) {
    return enqueue(async () => {
      if (!isTauri()) {
        localStorage.removeItem(key)
        return
      }
      if (cachedValue !== null) {
        await invoke("set_secret", { key: CREDENTIAL_KEY, value: "" })
        cachedValue = null
      }
      localStorage.removeItem(key)
    })
  },
}
