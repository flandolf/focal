import type { ThemeId } from "@/lib/themes"
import { SETTINGS_SECTION_CLASS, getSettingsOptionClassName } from "./constants"
import { cn } from "@/lib/utils"

interface AppearanceSectionProps {
  theme: ThemeId
  mode: "light" | "dark" | "system"
  setTheme: (theme: ThemeId) => void
  setMode: (mode: "light" | "dark" | "system") => void
}

const THEME_OPTIONS = [
  { id: "focal" as ThemeId, name: "Focal", lightBg: "bg-slate-100", accent: "bg-blue-500" },
  { id: "codex" as ThemeId, name: "Codex", lightBg: "bg-violet-50", accent: "bg-violet-500" },
  { id: "claude" as ThemeId, name: "Claude", lightBg: "bg-amber-50", accent: "bg-orange-400" },
  { id: "github" as ThemeId, name: "GitHub", lightBg: "bg-gray-100", accent: "bg-blue-600" },
  { id: "linear" as ThemeId, name: "Linear", lightBg: "bg-purple-50", accent: "bg-indigo-500" },
  { id: "notion" as ThemeId, name: "Notion", lightBg: "bg-stone-100", accent: "bg-stone-700" },
]

export function AppearanceSection({ theme, mode, setTheme, setMode }: AppearanceSectionProps) {
  return (
    <section className={SETTINGS_SECTION_CLASS}>
      <h2 className="text-sm font-medium">Theme</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setTheme(t.id)}
            aria-pressed={theme === t.id}
            className={getSettingsOptionClassName(theme === t.id, "flex flex-col items-center gap-1.5 p-3 text-foreground")}
          >
            <div className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-background/60">
              <div className={cn("h-3 w-3 rounded-sm", t.lightBg)} />
              <div className={cn("h-3 w-3 rounded-sm", t.accent)} />
            </div>
            <span className="text-caption font-medium">{t.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("light")}
          aria-pressed={mode === "light"}
          className={getSettingsOptionClassName(mode === "light", "flex-1 px-3 py-2")}
        >
          Light
        </button>
        <button
          type="button"
          onClick={() => setMode("dark")}
          aria-pressed={mode === "dark"}
          className={getSettingsOptionClassName(mode === "dark", "flex-1 px-3 py-2")}
        >
          Dark
        </button>
        <button
          type="button"
          onClick={() => setMode("system")}
          aria-pressed={mode === "system"}
          className={getSettingsOptionClassName(mode === "system", "flex-1 px-3 py-2")}
        >
          System
        </button>
      </div>
    </section>
  )
}
