import { format } from "date-fns"
import { Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { StudySession, CalendarEvent } from "@/lib/types"

interface MonthBriefItem {
  id: string
  title: string
  meta: string
  date: Date
  color: string
  kind: "assessment" | "session" | "event"
  projectId?: string
  session?: StudySession
  event?: CalendarEvent
}

interface MonthBriefProps {
  currentMonth: Date
  items: MonthBriefItem[]
  previewItems: MonthBriefItem[]
  monthAssessments: number
  monthStudyHours: number
  monthBusyDays: number
  onSelectItem: (item: MonthBriefItem) => void
  onPlanSession: () => void
}

export function MonthBrief({
  currentMonth,
  items,
  previewItems,
  monthAssessments,
  monthStudyHours,
  monthBusyDays,
  onSelectItem,
  onPlanSession,
}: MonthBriefProps) {
  return (
    <div className="border-t border-border/70 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-sm font-semibold">Month Brief</h3>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {items.length > 0
              ? `${items.length} scheduled item${items.length === 1 ? "" : "s"} in ${format(currentMonth, "MMMM")}`
              : `No scheduled items left in ${format(currentMonth, "MMMM")}`}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums leading-none">{monthAssessments}</p>
            <p className="mt-1 text-micro text-muted-foreground">assessments</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums leading-none">{monthStudyHours}<span className="text-micro font-normal">h</span></p>
            <p className="mt-1 text-micro text-muted-foreground">planned</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums leading-none">{monthBusyDays}</p>
            <p className="mt-1 text-micro text-muted-foreground">busy days</p>
          </div>
        </div>
      </div>

      {previewItems.length > 0 ? (
        <div className="mt-3 grid gap-2 min-[1350px]:grid-cols-2">
          {previewItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item)}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-border/55 bg-background/24 px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <div className="flex h-9 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-muted/55 text-center">
                <span className="text-micro font-medium uppercase leading-none text-muted-foreground">{format(item.date, "MMM")}</span>
                <span className="mt-0.5 text-sm font-semibold leading-none tabular-nums">{format(item.date, "d")}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  <p className="truncate text-xs font-medium">{item.title}</p>
                </div>
                <p className="mt-0.5 truncate text-micro text-muted-foreground">{item.meta}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-background/24 px-3 py-3">
          <p className="text-xs text-muted-foreground">Use this month to get ahead before the next assessment cluster.</p>
          <Button variant="outline" size="sm" onClick={onPlanSession} className="h-7 rounded-xl px-2.5 text-xs">
            <Calendar className="mr-1.5 h-3 w-3" />
            Plan session
          </Button>
        </div>
      )}
    </div>
  )
}
