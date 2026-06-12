import type { AuthChangeEvent, Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase/client"

export async function getSupabaseSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

export async function signInWithEmailPassword(email: string, password: string): Promise<Session | null> {
  if (!supabase) throw new Error("Supabase is not configured")
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

export async function signUpWithEmailPassword(email: string, password: string): Promise<Session | null> {
  if (!supabase) throw new Error("Supabase is not configured")
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data.session
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export function onSupabaseAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  if (!supabase) return () => undefined
  const { data } = supabase.auth.onAuthStateChange(callback)
  return () => data.subscription.unsubscribe()
}

