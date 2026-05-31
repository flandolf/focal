import { useState, useEffect } from "react"

export type ThemeId = "focal" | "codex" | "claude"

export interface ThemeDef {
  id: ThemeId
  name: string
  label: string
  dark: boolean
}

export const THEMES: ThemeDef[] = [
  { id: "focal", name: "Focal Light", label: "Light", dark: false },
  { id: "focal", name: "Focal Dark", label: "Dark", dark: true },
  { id: "codex", name: "Codex Light", label: "Light", dark: false },
  { id: "codex", name: "Codex Dark", label: "Dark", dark: true },
  { id: "claude", name: "Claude Light", label: "Light", dark: false },
  { id: "claude", name: "Claude Dark", label: "Dark", dark: true },
]

export interface ThemeSelection {
  theme: ThemeId
  dark: boolean
}

const STORAGE_KEY = "focal-theme"

function getInitialTheme(): ThemeSelection {
  if (typeof window === "undefined") return { theme: "focal", dark: false }
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as ThemeSelection
      if (THEMES.some((t) => t.id === parsed.theme)) return parsed
    } catch {
      // fall through
    }
  }
  // Migrate from old focal-dark key
  const oldDark = localStorage.getItem("focal-dark")
  if (oldDark !== null) {
    return { theme: "focal", dark: oldDark === "true" }
  }
  return {
    theme: "focal",
    dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  }
}

export function useTheme() {
  const [selection, setSelection] = useState<ThemeSelection>(getInitialTheme)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
    const root = document.documentElement
    // Remove all theme classes
    root.classList.remove("focal", "codex", "claude")
    // Add the current theme class (if not focal, which is the default)
    if (selection.theme !== "focal") {
      root.classList.add(selection.theme)
    }
    // Toggle dark mode
    root.classList.toggle("dark", selection.dark)
  }, [selection])

  const setTheme = (theme: ThemeId) => {
    setSelection((prev) => ({ ...prev, theme }))
  }

  const toggleDark = () => {
    setSelection((prev) => ({ ...prev, dark: !prev.dark }))
  }

  return {
    theme: selection.theme,
    dark: selection.dark,
    setTheme,
    toggleDark,
  }
}
