import { cn } from "@/lib/utils"

const MIN_DURATION_MINUTES = 1
const MAX_DURATION_MINUTES = 180

interface DurationInputsProps {
  variant: "focus" | "sidebar"
  settings: {
    workMinutes: number
    breakMinutes: number
    longBreakMinutes: number
  }
  onChange: (key: "workMinutes" | "breakMinutes" | "longBreakMinutes", value: string) => void
}

function Stepper({
  label,
  value,
  onChange,
  compact,
}: {
  label: string
  value: number
  onChange: (value: string) => void
  compact?: boolean
}) {
  const decrement = () => onChange(String(Math.max(MIN_DURATION_MINUTES, value - 1)))
  const increment = () => onChange(String(Math.min(MAX_DURATION_MINUTES, value + 1)))

  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "block font-semibold uppercase tracking-wider text-muted-foreground/70",
          compact ? "text-[10px]" : "text-micro",
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          "group flex items-center overflow-hidden rounded-lg border border-border/60 bg-background/40 transition-all duration-200",
          "hover:border-primary/30 hover:ring-1 hover:ring-primary/15",
          "focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/25",
          compact ? "h-7" : "h-8",
        )}
      >
        <button
          type="button"
          onClick={decrement}
          disabled={value <= MIN_DURATION_MINUTES}
          className={cn(
            "flex shrink-0 items-center justify-center text-muted-foreground transition-all duration-150",
            "hover:bg-accent/50 hover:text-foreground",
            "motion-safe:active:scale-90 active:bg-primary/10 active:text-primary",
            "disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100",
            compact ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm",
          )}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          type="number"
          min={MIN_DURATION_MINUTES}
          max={MAX_DURATION_MINUTES}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "min-w-0 flex-1 appearance-none bg-transparent px-0 text-center font-medium tabular-nums outline-none",
            "[color-scheme:light] dark:[color-scheme:dark]",
            "motion-safe:transition-colors motion-safe:duration-150",
            compact ? "text-xs" : "text-sm",
          )}
          aria-label={`${label} minutes`}
        />
        <button
          type="button"
          onClick={increment}
          disabled={value >= MAX_DURATION_MINUTES}
          className={cn(
            "flex shrink-0 items-center justify-center text-muted-foreground transition-all duration-150",
            "hover:bg-accent/50 hover:text-foreground",
            "motion-safe:active:scale-90 active:bg-primary/10 active:text-primary",
            "disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100",
            compact ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm",
          )}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function DurationInputs({ variant, settings, onChange }: DurationInputsProps) {
  const compact = variant === "sidebar"
  const fields = [
    ["workMinutes", "Focus"] as const,
    ["breakMinutes", "Break"] as const,
    ["longBreakMinutes", "Long"] as const,
  ]

  return (
    <div className={cn("grid grid-cols-3", compact ? "gap-1.5" : "gap-2")}>
      {fields.map(([key, label]) => (
        <Stepper
          key={key}
          label={label}
          value={settings[key]}
          onChange={(value) => onChange(key, value)}
          compact={compact}
        />
      ))}
    </div>
  )
}
