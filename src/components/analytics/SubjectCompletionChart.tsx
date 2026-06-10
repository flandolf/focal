import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { getSubjectColor } from "@/lib/chartTheme"
import { getSubjectById } from "@/lib/utils"
import type { SubjectCompletion } from "@/lib/analytics"

interface SubjectCompletionChartProps {
  data: SubjectCompletion[]
}

export function SubjectCompletionChart({ data }: SubjectCompletionChartProps) {
  const maxRate = useMemo(() => Math.max(...data.map((d) => d.rate), 1), [data])

  if (data.length === 0) {
    return (
      <Card className="rounded-2xl bg-background/48 border-border/70 p-5 backdrop-blur shadow-sm">
        <h3 className="font-heading text-sm font-semibold mb-1">Completion Rate</h3>
        <p className="text-xs text-muted-foreground">No session data for this period.</p>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl bg-background/48 border-border/70 p-5 backdrop-blur shadow-sm">
      <h3 className="font-heading text-sm font-semibold mb-4">Completion Rate by Subject</h3>

      <div className="space-y-3">
        {data.map((item) => {
          const subject = getSubjectById(item.subjectId)
          const color = getSubjectColor(item.subjectId)
          const barWidth = (item.rate / maxRate) * 100

          return (
            <div key={item.subjectId} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {subject?.name ?? "Unassigned"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {item.completed}/{item.total}
                  </span>
                  <span className="tabular-nums font-medium text-foreground">
                    {item.rate}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="sr-only">
        Completion rate by subject: {data
          .map((d, i) => {
            const name = getSubjectById(d.subjectId)?.name ?? "Unassigned"
            return `${i > 0 ? "; " : ""}${name} ${d.completed} of ${d.total} (${d.rate}%)`
          })
          .join("")}
        .
      </p>
    </Card>
  )
}
