import { invoke, isTauri } from "@tauri-apps/api/core"
import type { SupportedStorage } from "@supabase/supabase-js"

const CREDENTIAL_KEY = "supabase_auth_session"

export const secureSupabaseStorage: SupportedStorage = {
  async getItem(key) {
    if (!isTauri()) return localStorage.getItem(key)
    const stored = await invoke<string | null>("get_secret", { key: CREDENTIAL_KEY })
    if (stored !== null) return stored

    const legacy = localStorage.getItem(key)
    if (legacy !== null) {
      await invoke("set_secret", { key: CREDENTIAL_KEY, value: legacy })
      localStorage.removeItem(key)
    }
    return legacy
  },

  async setItem(key, value) {
    if (!isTauri()) {
      localStorage.setItem(key, value)
      return
    }
    await invoke("set_secret", { key: CREDENTIAL_KEY, value })
  },

  async removeItem(key) {
    if (!isTauri()) {
      localStorage.removeItem(key)
      return
    }
    await invoke("set_secret", { key: CREDENTIAL_KEY, value: "" })
    localStorage.removeItem(key)
  },
}
