import { useState, useEffect, useCallback } from "react"
import { isRecord } from "@/lib/utils"

export type ThemeId = "focal" | "codex" | "claude" | "github" | "linear" | "notion" | "sprout" | "ember"
export type ThemeMode = "light" | "dark" | "system"

export interface ThemeDef {
  id: ThemeId
  name: string
}

export const THEMES: ThemeDef[] = [
  { id: "focal", name: "Focal" },
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude" },
  { id: "github", name: "GitHub" },
  { id: "linear", name: "Linear" },
  { id: "notion", name: "Notion" },
  { id: "sprout", name: "Sprout" },
  { id: "ember", name: "Ember" },
]

const STORAGE_KEY = "focal-theme"

interface ThemeSelection {
  theme: ThemeId
  mode: ThemeMode
}

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((theme) => theme.id === value)
}

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

function getInitialTheme(): ThemeSelection {
  if (typeof window === "undefined") return { theme: "focal", mode: "system" }
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown
      if (isRecord(parsed)) {
        // Migrate old format: { theme, dark: boolean }
        if (typeof parsed.dark === "boolean" && isThemeId(parsed.theme)) {
          return { theme: parsed.theme, mode: parsed.dark ? "dark" : "light" }
        }
        // New format: { theme, mode }
        if (isThemeId(parsed.theme) && isThemeMode(parsed.mode)) {
          return { theme: parsed.theme, mode: parsed.mode }
        }
      }
    } catch {
      // fall through
    }
  }
  // Migrate from old focal-dark key
  const oldDark = localStorage.getItem("focal-dark")
  if (oldDark !== null) {
    return { theme: "focal", mode: oldDark === "true" ? "dark" : "light" }
  }
  return { theme: "focal", mode: "system" }
}

export function useTheme() {
  const [selection, setSelection] = useState<ThemeSelection>(getInitialTheme)
  const resolvedDark = resolveDark(selection.mode)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
    const root = document.documentElement
    root.classList.remove("focal", "codex", "claude", "github", "linear", "notion", "sprout", "ember")
    if (selection.theme !== "focal") {
      root.classList.add(selection.theme)
    }
    root.classList.toggle("dark", resolvedDark)
  }, [selection, resolvedDark])

  useEffect(() => {
    if (selection.mode !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      const root = document.documentElement
      root.classList.toggle("dark", mq.matches)
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [selection.mode])

  const setTheme = useCallback((theme: ThemeId) => {
    setSelection((prev) => ({ ...prev, theme }))
  }, [])

  const setMode = useCallback((mode: ThemeMode) => {
    setSelection((prev) => ({ ...prev, mode }))
  }, [])

  return {
    theme: selection.theme,
    mode: selection.mode,
    resolvedDark,
    setTheme,
    setMode,
  }
}
