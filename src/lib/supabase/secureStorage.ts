import { invoke, isTauri } from "@tauri-apps/api/core"
import type { SupportedStorage } from "@supabase/supabase-js"

const CREDENTIAL_KEY = "supabase_auth_session"
let cachedValue: string | null | undefined

export const secureSupabaseStorage: SupportedStorage = {
  async getItem(key) {
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
  },

  async setItem(key, value) {
    if (!isTauri()) {
      localStorage.setItem(key, value)
      return
    }
    if (cachedValue === value) return
    await invoke("set_secret", { key: CREDENTIAL_KEY, value })
    cachedValue = value
  },

  async removeItem(key) {
    if (!isTauri()) {
      localStorage.removeItem(key)
      return
    }
    if (cachedValue !== null) {
      await invoke("set_secret", { key: CREDENTIAL_KEY, value: "" })
      cachedValue = null
    }
    localStorage.removeItem(key)
  },
}
