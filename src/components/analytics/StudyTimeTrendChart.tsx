import { useMemo } from "react"
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import { Card } from "@/components/ui/card"
import { getSubjectColor } from "@/lib/chartTheme"
import { getSubjectById } from "@/lib/utils"
import type { StudyTimePoint } from "@/lib/analytics"

interface StudyTimeTrendChartProps {
  data: StudyTimePoint[]
}

interface DailyPoint {
  date: string
  label: string
  total: number
  [subjectId: string]: string | number
}

export function StudyTimeTrendChart({ data }: StudyTimeTrendChartProps) {
  const { chartData, subjectIds } = useMemo(() => {
    const dayMap = new Map<string, Map<string, number>>()
    const subjectSet = new Set<string>()

    data.forEach((point) => {
      const existing = dayMap.get(point.date) ?? new Map<string, number>()
      if (point.subjectId) {
        existing.set(point.subjectId, (existing.get(point.subjectId) ?? 0) + point.minutes)
        subjectSet.add(point.subjectId)
      } else {
        existing.set("_unassigned", (existing.get("_unassigned") ?? 0) + point.minutes)
        subjectSet.add("_unassigned")
      }
      dayMap.set(point.date, existing)
    })

    const sorted = Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b))

    const points: DailyPoint[] = sorted.map(([date, subjectMap]) => {
      const d = new Date(date + "T00:00:00")
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      const total = Array.from(subjectMap.values()).reduce((sum, m) => sum + m, 0)
      const entry: DailyPoint = { date, label, total }
      subjectMap.forEach((minutes, sid) => {
        entry[sid] = minutes
      })
      return entry
    })

    return { chartData: points, subjectIds: Array.from(subjectSet) }
  }, [data])

  const formatMinutes = (value: number) => {
    if (value === 0) return "0m"
    if (value < 60) return `${value}m`
    const h = Math.floor(value / 60)
    const m = value % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  if (chartData.length === 0) {
    return (
      <Card className="rounded-2xl bg-background/48 border-border/70 p-5 backdrop-blur shadow-sm">
        <h3 className="font-heading text-sm font-semibold mb-1">Study Time Trends</h3>
        <p className="text-xs text-muted-foreground">No study data for this period.</p>
      </Card>
    )
  }

  return (
    <Card className="rounded-2xl bg-background/48 border-border/70 p-5 backdrop-blur shadow-sm">
      <h3 className="font-heading text-sm font-semibold mb-4">Study Time Trends</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatMinutes}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              color: "var(--popover-foreground)",
            }}
            labelStyle={{ color: "var(--muted-foreground)", fontSize: 11 }}
            formatter={(value: unknown, name: unknown) => {
              const subject = getSubjectById(String(name))
              return [formatMinutes(Number(value)), subject?.name ?? "Unassigned"]
            }}
          />
          {subjectIds.map((subjectId) => (
            <Area
              key={subjectId}
              type="monotone"
              dataKey={subjectId}
              stackId="1"
              stroke={subjectId === "_unassigned" ? "var(--muted-foreground)" : getSubjectColor(subjectId)}
              fill={subjectId === "_unassigned" ? "var(--muted)" : getSubjectColor(subjectId)}
              fillOpacity={subjectId === "_unassigned" ? 0.45 : 0.3}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
