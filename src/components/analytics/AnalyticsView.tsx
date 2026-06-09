import { useState, useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getAnalyticsData, type AnalyticsRange } from "@/lib/analytics"
import type { Project, StudySession } from "@/lib/types"
import { cn } from "@/lib/utils"
import { StudyTimeTrendChart } from "./StudyTimeTrendChart"
import { SubjectBreakdownChart } from "./SubjectBreakdownChart"
import { SubjectCompletionChart } from "./SubjectCompletionChart"
import { EfficiencyChart } from "./EfficiencyChart"
import { ConsistencyHeatmap } from "./ConsistencyHeatmap"
import { TimeOfDayChart } from "./TimeOfDayChart"
import { EmptyAnalytics } from "./EmptyAnalytics"

interface AnalyticsViewProps {
  sessions: StudySession[]
  projects: Project[]
  onNewSession: () => void
}

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "3mo" },
  { value: 365, label: "1yr" },
  { value: 0, label: "All" },
]

export function AnalyticsView({ sessions, projects, onNewSession }: AnalyticsViewProps) {
  const [range, setRange] = useState<AnalyticsRange>(30)

  const data = useMemo(
    () => getAnalyticsData(sessions, projects, range),
    [sessions, projects, range],
  )

  if (!data.hasData) {
    return <EmptyAnalytics onNewSession={onNewSession} />
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-6 py-5 min-[1200px]:px-8 min-[1200px]:py-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Analytics</h2>
          <div className="flex gap-0.5 rounded-xl border border-border/70 bg-background/55 p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  range === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          <div className="min-[900px]:col-span-2">
            <StudyTimeTrendChart data={data.timeTrends} />
          </div>
          <SubjectBreakdownChart data={data.subjectBreakdown} />
          <SubjectCompletionChart data={data.subjectCompletion} />
          <TimeOfDayChart data={data.timeOfDay} />
          <EfficiencyChart data={data.efficiency} />
          <div className="min-[900px]:col-span-2">
            <ConsistencyHeatmap days={data.consistency.days} stats={data.consistency.stats} />
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
