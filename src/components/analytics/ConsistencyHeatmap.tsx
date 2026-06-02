import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { getHeatColor } from "@/lib/chartTheme"
import type { ConsistencyDay, ConsistencyStats } from "@/lib/analytics"

interface ConsistencyHeatmapProps {
  days: ConsistencyDay[]
  stats: ConsistencyStats
}

export function ConsistencyHeatmap({ days, stats }: ConsistencyHeatmapProps) {
  const dayLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"]

  const weeks = useMemo(() => {
    const result: (ConsistencyDay | null)[][] = []
    if (days.length === 0) return result

    const first = new Date(days[0].date + "T00:00:00")
    const firstDow = (first.getDay() + 6) % 7
    let currentWeek: (ConsistencyDay | null)[] = Array.from({ length: firstDow }, () => null)

    days.forEach((day) => {
      if (currentWeek.length === 7) {
        result.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push(day)
    })
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null)
      result.push(currentWeek)
    }
    return result
  }, [days])

  const formatMinutes = (minutes: number) => {
    if (minutes === 0) return "No study"
    if (minutes < 60) return `${minutes}m`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  const formatStreak = (days: number) => {
    if (days === 0) return "0d"
    if (days === 1) return "1d"
    return `${days}d`
  }

  const hasAnyData = stats.totalStudyDays > 0

  return (
    <Card className="rounded-2xl bg-background/48 border-border/70 p-5 backdrop-blur shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-sm font-semibold">Study Consistency</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-micro text-muted-foreground/70">Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className="h-2.5 w-2.5 rounded-xs"
              style={{ backgroundColor: getHeatColor(level as 0 | 1 | 2 | 3 | 4) }}
            />
          ))}
          <span className="text-micro text-muted-foreground/70">More</span>
        </div>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-xl border border-border/60 bg-background/30 p-3">
        <div className="flex min-w-max gap-3">
        <div className="flex shrink-0 flex-col gap-0.75">
          {dayLabels.map((label, i) => (
            <span key={i} className="h-3.5 w-8 text-micro leading-3.5 text-muted-foreground/70">
              {label}
            </span>
          ))}
        </div>

        <div className="flex gap-0.75">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-0.75">
              {week.map((day, di) => (
                <div
                  key={di}
                  className="h-3.5 w-3.5 rounded-[3px] transition-colors"
                  style={{
                    backgroundColor: day
                      ? getHeatColor(day.level)
                      : "transparent",
                  }}
                  title={day ? `${day.date}: ${formatMinutes(day.minutes)}` : undefined}
                />
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 min-[1100px]:grid-cols-5">
        <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2">
          <div className="text-sm font-semibold tabular-nums">{formatStreak(stats.currentStreak)}</div>
          <div className="text-micro text-muted-foreground">Current</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2">
          <div className="text-sm font-semibold tabular-nums">{formatStreak(stats.longestStreak)}</div>
          <div className="text-micro text-muted-foreground">Longest</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2">
          <div className="text-sm font-semibold tabular-nums">{stats.totalStudyDays}</div>
          <div className="text-micro text-muted-foreground">Days</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2">
          <div className="text-sm font-semibold tabular-nums">
            {stats.totalMinutes < 60
              ? `${stats.totalMinutes}m`
              : `${Math.floor(stats.totalMinutes / 60)}h`}
          </div>
          <div className="text-micro text-muted-foreground">Total</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/30 px-3 py-2">
          <div className="text-sm font-semibold tabular-nums">
            {stats.averageMinutesPerDay < 60
              ? `${stats.averageMinutesPerDay}m`
              : `${Math.floor(stats.averageMinutesPerDay / 60)}h`}
          </div>
          <div className="text-micro text-muted-foreground">Avg/Day</div>
        </div>
      </div>

      {!hasAnyData && (
        <p className="mt-3 text-xs text-muted-foreground text-center">
          Complete study sessions to see your consistency.
        </p>
      )}
    </Card>
  )
}
