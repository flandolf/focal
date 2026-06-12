import { useCallback, useEffect, useMemo, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { isSupabaseConfigured } from "@/lib/supabase/client"
import {
  getSupabaseSession,
  onSupabaseAuthStateChange,
  signInWithEmailPassword,
  signOutSupabase,
  signUpWithEmailPassword,
} from "@/lib/supabase/auth"

export function useSupabaseAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      if (!isSupabaseConfigured) {
        setLoading(false)
        return
      }

      try {
        const restored = await getSupabaseSession()
        if (!cancelled) {
          setSession(restored)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void restoreSession()

    const unsubscribe = onSupabaseAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
      setError(null)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const nextSession = await signInWithEmailPassword(email, password)
      setSession(nextSession)
      return nextSession
    } catch (e) {
      const message = String(e)
      setError(message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const nextSession = await signUpWithEmailPassword(email, password)
      setSession(nextSession)
      return nextSession
    } catch (e) {
      const message = String(e)
      setError(message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await signOutSupabase()
      setSession(null)
    } catch (e) {
      const message = String(e)
      setError(message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  return useMemo(() => ({
    configured: isSupabaseConfigured,
    session,
    user: session?.user ?? null as User | null,
    loading,
    error,
    signIn,
    signUp,
    signOut,
  }), [session, loading, error, signIn, signUp, signOut])
}

