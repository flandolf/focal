import { Input } from "@/components/ui/input"

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

export function DurationInputs({ variant, settings, onChange }: DurationInputsProps) {
  if (variant === "sidebar") {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {([
          ["workMinutes", "Focus"],
          ["breakMinutes", "Break"],
          ["longBreakMinutes", "Long"],
        ] as const).map(([key, label]) => (
          <label key={key} className="space-y-1">
            <span className="block text-micro font-semibold uppercase text-muted-foreground/70">{label}</span>
            <Input
              type="number"
              min={MIN_DURATION_MINUTES}
              max={MAX_DURATION_MINUTES}
              step={1}
              value={settings[key]}
              onChange={(event) => onChange(key, event.target.value)}
              className="h-8 rounded-lg px-2 text-center text-control tabular-nums"
              aria-label={`${label} minutes`}
            />
          </label>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {([
        ["workMinutes", "Focus"],
        ["breakMinutes", "Break"],
        ["longBreakMinutes", "Long"],
      ] as const).map(([key, label]) => (
        <label key={key} className="space-y-1">
          <span className="block text-micro font-semibold uppercase tracking-normal text-muted-foreground">{label}</span>
          <Input
            type="number"
            min={MIN_DURATION_MINUTES}
            max={MAX_DURATION_MINUTES}
            step={1}
            value={settings[key]}
            onChange={(event) => onChange(key, event.target.value)}
            className="h-8 rounded-md px-2 text-center text-sm tabular-nums"
            aria-label={`${label} minutes`}
          />
        </label>
      ))}
    </div>
  )
}
