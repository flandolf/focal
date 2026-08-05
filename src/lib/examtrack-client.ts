import { createClient } from "@supabase/supabase-js"
import { examTrackSessionStorage } from "@/lib/supabase/sessionStorage"

const url = import.meta.env.VITE_EXAMTRACK_SUPABASE_URL
const key = import.meta.env.VITE_EXAMTRACK_SUPABASE_PUBLISHABLE_KEY

function isSecureEndpoint(value: string | undefined): boolean {
  if (!value) return false
  try {
    const endpoint = new URL(value)
    return endpoint.protocol === "https:" || (
      endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
    )
  } catch {
    return false
  }
}

export const isExamTrackSupabaseConfigured = Boolean(isSecureEndpoint(url) && key)

export const examTrackSupabase = isExamTrackSupabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        storageKey: "focal-examtrack-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: examTrackSessionStorage,
      },
    })
  : null
