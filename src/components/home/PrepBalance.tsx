import { format } from "date-fns"
import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PrepBalanceItem } from "@/lib/planning"

interface PrepBalanceProps {
  items: PrepBalanceItem[]
  needsAttention: number
  onSelectItem: (item: PrepBalanceItem) => void
  onPlanSession: () => void
}

export function PrepBalance({
  items,
  needsAttention,
  onSelectItem,
  onPlanSession,
}: PrepBalanceProps) {
  return (
    <div className="mt-4 border-t border-border/55 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-sm font-semibold">Prep Balance</h3>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {items.length > 0
              ? `${needsAttention} subject${needsAttention === 1 ? "" : "s"} need more planned time`
              : "No assessment pressure to balance this month"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onPlanSession} className="h-7 rounded-xl px-2.5 text-xs">
            <Calendar className="mr-1.5 h-3 w-3" />
            Plan
          </Button>
        </div>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 min-[1350px]:grid-cols-2">
          {items.map((item) => {
            const targetMinutes = item.assessmentCount * 90
            const plannedHours = Math.round(item.plannedMinutes / 60 * 10) / 10
            const targetHours = Math.round(targetMinutes / 60 * 10) / 10
            const progress = targetMinutes > 0 ? Math.min(100, Math.round(item.plannedMinutes / targetMinutes * 100)) : 100
            const nextDateLabel = item.nextDate ? format(item.nextDate, "MMM d") : "No date"
            return (
              <button
                key={item.subjectId}
                type="button"
                onClick={() => onSelectItem(item)}
                className="min-w-0 rounded-xl border border-border/55 bg-background/24 px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <p className="truncate text-xs font-medium">
                        {item.shortCode}
                        <span className="ml-1.5 text-muted-foreground">/ {item.name}</span>
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-micro text-muted-foreground">
                      {item.nextTitle ? `${item.nextTitle} · ${nextDateLabel}` : "Assessment prep"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums">{plannedHours}<span className="text-micro font-normal">h</span></p>
                    <p className="mt-0.5 text-micro leading-3 text-muted-foreground">of {targetHours}h</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/65">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-background/24 px-3 py-3">
          <p className="text-xs text-muted-foreground">Add assessments or planned sessions to see subject prep balance here.</p>
        </div>
      )}
    </div>
  )
}
