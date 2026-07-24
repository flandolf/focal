import { isTauri } from "@tauri-apps/api/core"
import type { SupportedStorage } from "@supabase/supabase-js"
import {
  hydratePreferences,
  persistPreference,
  removePreference,
} from "@/lib/storage/preferences"

const CREDENTIAL_KEY = "focal-supabase-auth-session"
let cachedValue: string | null | undefined

// Promise queue to serialize all operations and prevent race conditions
let operationQueue = Promise.resolve()

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation)
  operationQueue = result.then(() => undefined, () => undefined)
  return result
}

export const supabaseSessionStorage: SupportedStorage = {
  async getItem(key) {
    return enqueue(async () => {
      if (!isTauri()) return localStorage.getItem(key)
      if (cachedValue !== undefined) return cachedValue
      const legacy = localStorage.getItem(key)
      const stored = await hydratePreferences([{
        key: CREDENTIAL_KEY,
        legacyValue: legacy,
        syncable: false,
      }])
      localStorage.removeItem(key)
      cachedValue = stored.get(CREDENTIAL_KEY) ?? null
      return cachedValue
    })
  },

  async setItem(key, value) {
    return enqueue(async () => {
      if (!isTauri()) {
        localStorage.setItem(key, value)
        return
      }
      if (cachedValue === value) return
      await persistPreference(CREDENTIAL_KEY, value, false)
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
        await removePreference(CREDENTIAL_KEY)
        cachedValue = null
      }
      localStorage.removeItem(key)
    })
  },
}
