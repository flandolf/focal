import { useState, useEffect, useCallback } from "react"
import { setCachedPreference } from "@/lib/storage/preferences"

export type ThemeMode = "light" | "dark" | "system"

interface ThemeSelection {
  mode: ThemeMode
}

const STORAGE_KEY = "focal-theme"

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

function getSystemDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "system") return getSystemDark()
  return mode === "dark"
}

function getInitialSelection(): ThemeSelection {
  if (typeof window === "undefined") return { mode: "system" }
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>
        const direct = record.mode
        if (isThemeMode(direct)) return { mode: direct }
        const legacyDark = record.dark
        if (typeof legacyDark === "boolean") {
          return { mode: legacyDark ? "dark" : "light" }
        }
      }
    } catch {
      /* fall through */
    }
  }
  const oldDark = localStorage.getItem("focal-dark")
  if (oldDark !== null) {
    return { mode: oldDark === "true" ? "dark" : "light" }
  }
  return { mode: "system" }
}

export function useTheme() {
  const [selection, setSelection] = useState<ThemeSelection>(getInitialSelection)
  const resolvedDark = resolveDark(selection.mode)

  useEffect(() => {
    setCachedPreference(STORAGE_KEY, JSON.stringify(selection), true)
    document.documentElement.classList.toggle("dark", resolvedDark)
  }, [selection, resolvedDark])

  useEffect(() => {
    if (selection.mode !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      document.documentElement.classList.toggle("dark", mq.matches)
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [selection.mode])

  const setMode = useCallback((mode: ThemeMode) => {
    setSelection((prev) => ({ ...prev, mode }))
  }, [])

  return {
    mode: selection.mode,
    resolvedDark,
    setMode,
  }
}
