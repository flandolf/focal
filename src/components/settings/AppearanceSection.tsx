import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Moon, Sun, Monitor, Sparkles } from "lucide-react"
import type { ThemeId, ThemeMode } from "@/lib/themes"
import { cn } from "@/lib/utils"

interface AppearanceSectionProps {
  theme: ThemeId
  mode: ThemeMode
  setTheme: (theme: ThemeId) => void
  setMode: (mode: ThemeMode) => void
}

interface ThemeSwatch {
  bg: string
  surface: string
  ink: string
  mutedInk: string
  primary: string
  accent: string
  ring: string
}

// OKLCH values pulled verbatim from index.css per theme. Light-mode swatches
// are used for the previews so the same shape reads in both modes; the
// picker itself sits above the mode toggle.
const THEME_SWATCHES: Record<ThemeId, ThemeSwatch> = {
  focal: {
    bg: "oklch(0.978 0.005 250)",
    surface: "oklch(0.985 0.004 250 / 0.65)",
    ink: "oklch(0.170 0.018 255)",
    mutedInk: "oklch(0.380 0.025 245)",
    primary: "oklch(0.480 0.085 242)",
    accent: "oklch(0.700 0.080 160)",
    ring: "oklch(0.480 0.085 242 / 0.35)",
  },
  codex: {
    bg: "oklch(0.964 0.008 300)",
    surface: "oklch(0.978 0.005 300 / 0.65)",
    ink: "oklch(0.300 0.018 300)",
    mutedInk: "oklch(0.420 0.025 295)",
    primary: "oklch(0.580 0.140 290)",
    accent: "oklch(0.680 0.090 155)",
    ring: "oklch(0.580 0.140 290 / 0.35)",
  },
  claude: {
    bg: "oklch(0.962 0.008 80)",
    surface: "oklch(0.972 0.006 80 / 0.65)",
    ink: "oklch(0.210 0.005 100)",
    mutedInk: "oklch(0.400 0.018 75)",
    primary: "oklch(0.560 0.110 40)",
    accent: "oklch(0.650 0.060 160)",
    ring: "oklch(0.560 0.110 40 / 0.35)",
  },
  github: {
    bg: "oklch(0.980 0.002 250)",
    surface: "oklch(0.995 0.001 250 / 0.65)",
    ink: "oklch(0.220 0.010 255)",
    mutedInk: "oklch(0.390 0.020 248)",
    primary: "oklch(0.500 0.100 245)",
    accent: "oklch(0.680 0.080 145)",
    ring: "oklch(0.500 0.100 245 / 0.35)",
  },
  linear: {
    bg: "oklch(0.976 0.005 270)",
    surface: "oklch(0.988 0.003 270 / 0.65)",
    ink: "oklch(0.240 0.020 275)",
    mutedInk: "oklch(0.400 0.024 268)",
    primary: "oklch(0.520 0.130 265)",
    accent: "oklch(0.700 0.080 140)",
    ring: "oklch(0.520 0.130 265 / 0.35)",
  },
  notion: {
    bg: "oklch(0.970 0.006 70)",
    surface: "oklch(0.980 0.004 70 / 0.65)",
    ink: "oklch(0.220 0.008 60)",
    mutedInk: "oklch(0.390 0.016 62)",
    primary: "oklch(0.420 0.060 50)",
    accent: "oklch(0.600 0.055 155)",
    ring: "oklch(0.420 0.060 50 / 0.35)",
  },
  sprout: {
    bg: "oklch(0.968 0.008 140)",
    surface: "oklch(0.978 0.005 140 / 0.65)",
    ink: "oklch(0.220 0.012 155)",
    mutedInk: "oklch(0.400 0.020 148)",
    primary: "oklch(0.500 0.120 155)",
    accent: "oklch(0.620 0.070 170)",
    ring: "oklch(0.500 0.120 155 / 0.35)",
  },
  ember: {
    bg: "oklch(0.965 0.008 60)",
    surface: "oklch(0.975 0.006 60 / 0.65)",
    ink: "oklch(0.200 0.012 50)",
    mutedInk: "oklch(0.400 0.020 55)",
    primary: "oklch(0.550 0.140 45)",
    accent: "oklch(0.640 0.070 170)",
    ring: "oklch(0.550 0.140 45 / 0.35)",
  },
}

const THEME_BLURB: Record<ThemeId, string> = {
  focal: "Sharp blue, the default.",
  codex: "Editorial violet.",
  claude: "Warm coral and cream.",
  github: "Neutral gray and blue.",
  linear: "Deep violet, precise.",
  notion: "Warm beige, calm.",
  sprout: "Fresh green, natural.",
  ember: "Warm amber, energetic.",
}

/**
 * A miniature mock of a Focal window rendered in the actual theme colors.
 * Renders self-contained so it previews the theme regardless of the currently
 * active theme on the document.
 */
function ThemePreview({ swatch }: { swatch: ThemeSwatch }) {
  return (
    <div
      className="relative h-14 w-full overflow-hidden rounded-md"
      style={{ background: swatch.bg }}
    >
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "32% 1fr" }}>
        {/* Sidebar */}
        <div
          className="border-r"
          style={{
            background: swatch.surface,
            borderColor: "oklch(0 0 0 / 0.06)",
          }}
        >
          <div className="flex h-full flex-col gap-1 p-1.5">
            <span
              className="h-1 w-3/4 rounded-sm"
              style={{ background: swatch.mutedInk, opacity: 0.4 }}
            />
            <span
              className="h-1 w-1/2 rounded-sm"
              style={{ background: swatch.mutedInk, opacity: 0.3 }}
            />
            <span
              className="mt-1 h-1.5 w-full rounded-sm"
              style={{ background: swatch.primary, opacity: 0.85 }}
            />
            <span
              className="h-1 w-2/3 rounded-sm"
              style={{ background: swatch.mutedInk, opacity: 0.25 }}
            />
            <span
              className="h-1 w-1/2 rounded-sm"
              style={{ background: swatch.mutedInk, opacity: 0.2 }}
            />
          </div>
        </div>
        {/* Content area */}
        <div className="flex flex-col gap-1 p-1.5">
          <div className="flex items-center justify-between">
            <span
              className="h-1.5 w-1/3 rounded-sm"
              style={{ background: swatch.ink, opacity: 0.85 }}
            />
            <span
              className="h-1.5 w-3 rounded-sm"
              style={{ background: swatch.primary, opacity: 0.9 }}
            />
          </div>
          <span
            className="h-1 w-5/6 rounded-sm"
            style={{ background: swatch.mutedInk, opacity: 0.4 }}
          />
          <span
            className="h-1 w-3/4 rounded-sm"
            style={{ background: swatch.mutedInk, opacity: 0.3 }}
          />
          <div className="mt-auto flex items-end gap-1">
            <span
              className="h-2 w-1/4 rounded-sm"
              style={{ background: swatch.accent, opacity: 0.55 }}
            />
            <span
              className="h-2 w-1/5 rounded-sm"
              style={{ background: swatch.primary, opacity: 0.7 }}
            />
            <span
              className="h-2 w-1/6 rounded-sm"
              style={{ background: swatch.mutedInk, opacity: 0.25 }}
            />
          </div>
        </div>
      </div>
      {/* Subtle ring at the edge to echo the focus ring */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-md"
        style={{ boxShadow: `inset 0 0 0 1px ${swatch.ring}` }}
      />
    </div>
  )
}

/** Animated checkmark that draws in when the theme is active. */
function ActiveCheck({ swatch }: { swatch: ThemeSwatch }) {
  const reduceMotion = useReducedMotion()
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="absolute right-1.5 top-1.5"
      aria-hidden="true"
    >
      <motion.circle
        cx="7"
        cy="7"
        r="6.25"
        fill={swatch.primary}
        initial={false}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformOrigin: "7px 7px" }}
      />
      <motion.path
        d="M4 7.2 L6.2 9.4 L10 5.4"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={false}
        animate={{ pathLength: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
        style={{ pathLength: reduceMotion ? 1 : undefined }}
      />
    </svg>
  )
}

function ThemeCard({
  id,
  name,
  selected,
  onSelect,
  swatch,
}: {
  id: ThemeId
  name: string
  selected: boolean
  onSelect: () => void
  swatch: ThemeSwatch
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group/theme relative flex flex-col gap-1.5 rounded-lg border bg-background/30 p-2 text-left outline-none transition-all",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        selected
          ? "border-primary/60 bg-primary/[0.04] shadow-[0_0_0_1px_var(--primary)]"
          : "border-border/70 hover:border-muted-foreground/35 hover:bg-background/45",
      )}
    >
      <ThemePreview swatch={swatch} />
      {selected && <ActiveCheck swatch={swatch} />}
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "truncate text-caption font-medium",
            selected ? "text-foreground" : "text-foreground/85",
          )}
        >
          {name}
        </span>
        <span
          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/5"
          style={{ background: swatch.primary }}
          aria-hidden="true"
        />
      </div>
      <span className="truncate text-[10px] text-muted-foreground/65">{THEME_BLURB[id]}</span>
    </button>
  )
}

function ModeOption({
  value: _value,
  selected,
  onSelect,
  icon,
  label,
}: {
  value: ThemeMode
  selected: boolean
  onSelect: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary/10 text-primary font-medium"
          : "border-border bg-background/30 text-muted-foreground hover:border-muted-foreground/35 hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

export function AppearanceSection({ theme, mode, setTheme, setMode }: AppearanceSectionProps) {
  const [hovered, setHovered] = useState<ThemeId | null>(null)
  const reduceMotion = useReducedMotion()
  const displayTheme: ThemeId = hovered ?? theme
  const displaySwatch = THEME_SWATCHES[displayTheme]

  const themeIds: ThemeId[] = [
    "focal",
    "codex",
    "claude",
    "github",
    "linear",
    "notion",
    "sprout",
    "ember",
  ]

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Theme</h2>
            <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
              Pick a look for the whole app. Switches apply instantly.
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/40 px-1.5 py-0.5 text-caption text-muted-foreground/70 sm:inline-flex">
            <Sparkles className="h-3 w-3" />
            Live preview
          </span>
        </div>

        {/* Hover preview — appears between the heading and the grid for emphasis */}
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-border/60 bg-background/20 p-2">
          <motion.div
            key={displayTheme}
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="h-10 w-20 shrink-0"
          >
            <div
              className="h-full w-full overflow-hidden rounded-md"
              style={{ background: displaySwatch.bg, boxShadow: `inset 0 0 0 1px ${displaySwatch.ring}` }}
            >
              <div className="grid h-full" style={{ gridTemplateColumns: "35% 1fr" }}>
                <div
                  className="border-r"
                  style={{ background: displaySwatch.surface, borderColor: "oklch(0 0 0 / 0.06)" }}
                />
                <div className="flex items-center justify-end gap-0.5 p-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: displaySwatch.accent, opacity: 0.7 }}
                  />
                  <span
                    className="h-2.5 w-3 rounded-sm"
                    style={{ background: displaySwatch.primary, opacity: 0.9 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-caption font-medium capitalize text-foreground">
              {hovered ? THEME_BLURB[hovered] : "Hover to preview, click to apply"}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/65">
              Currently: <span className="font-medium capitalize text-foreground/75">{theme}</span>
              {hovered && hovered !== theme && (
                <span className="text-muted-foreground/55"> · previewing {hovered}</span>
              )}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {themeIds.map((id) => (
            <div
              key={id}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered((current) => (current === id ? null : current))}
              onFocus={() => setHovered(id)}
              onBlur={() => setHovered((current) => (current === id ? null : current))}
            >
              <ThemeCard
                id={id}
                name={id.charAt(0).toUpperCase() + id.slice(1)}
                selected={theme === id}
                onSelect={() => setTheme(id)}
                swatch={THEME_SWATCHES[id]}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Mode</h2>
            <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
              System follows your OS. Light and dark work in every theme.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <ModeOption
            value="light"
            selected={mode === "light"}
            onSelect={() => setMode("light")}
            icon={<Sun className="h-3.5 w-3.5" />}
            label="Light"
          />
          <ModeOption
            value="dark"
            selected={mode === "dark"}
            onSelect={() => setMode("dark")}
            icon={<Moon className="h-3.5 w-3.5" />}
            label="Dark"
          />
          <ModeOption
            value="system"
            selected={mode === "system"}
            onSelect={() => setMode("system")}
            icon={<Monitor className="h-3.5 w-3.5" />}
            label="System"
          />
        </div>
      </section>
    </div>
  )
}
