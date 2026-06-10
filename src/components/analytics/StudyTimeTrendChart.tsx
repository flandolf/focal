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

const TOP_N = 4
const OTHER_ID = "__other"
const UNASSIGNED_ID = "_unassigned"

function formatMinutes(value: number) {
  if (value === 0) return "0m"
  if (value < 60) return `${value}m`
  const h = Math.floor(value / 60)
  const m = value % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatTotalMinutes(m: number) {
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

export function StudyTimeTrendChart({ data }: StudyTimeTrendChartProps) {
  const { chartData, subjectIds, hiddenCount, totalMinutes, topSummaries, allSummaries } =
    useMemo(() => {
      const dayMap = new Map<string, Map<string, number>>()
      data.forEach((point) => {
        const existing = dayMap.get(point.date) ?? new Map<string, number>()
        const sid = point.subjectId ?? UNASSIGNED_ID
        existing.set(sid, (existing.get(sid) ?? 0) + point.minutes)
        dayMap.set(point.date, existing)
      })

      const subjectTotals = new Map<string, number>()
      dayMap.forEach((subjectMap) => {
        subjectMap.forEach((minutes, sid) => {
          subjectTotals.set(sid, (subjectTotals.get(sid) ?? 0) + minutes)
        })
      })

      const sorted = Array.from(subjectTotals.entries())
        .filter(([, m]) => m > 0)
        .sort((a, b) => b[1] - a[1])
      const topIds = new Set(sorted.slice(0, TOP_N).map(([sid]) => sid))
      const hasOthers = sorted.length > TOP_N

      if (hasOthers) {
        const hiddenSet = new Set(sorted.slice(TOP_N).map(([sid]) => sid))
        dayMap.forEach((subjectMap) => {
          let otherTotal = 0
          hiddenSet.forEach((hid) => {
            const m = subjectMap.get(hid)
            if (m) {
              otherTotal += m
              subjectMap.delete(hid)
            }
          })
          if (otherTotal > 0) {
            subjectMap.set(OTHER_ID, (subjectMap.get(OTHER_ID) ?? 0) + otherTotal)
          }
        })
      }

      const sortedDays = Array.from(dayMap.entries()).sort(([a], [b]) =>
        a.localeCompare(b),
      )
      const points: DailyPoint[] = sortedDays.map(([date, subjectMap]) => {
        const d = new Date(date + "T00:00:00")
        const label = d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
        const total = Array.from(subjectMap.values()).reduce(
          (sum, m) => sum + m,
          0,
        )
        const entry: DailyPoint = { date, label, total }
        subjectMap.forEach((minutes, sid) => {
          entry[sid] = minutes
        })
        return entry
      })

      const total = sorted.reduce((sum, [, m]) => sum + m, 0)

      const visibleIds = hasOthers
        ? Array.from(topIds).concat([OTHER_ID])
        : Array.from(topIds)
      visibleIds.sort((a, b) => {
        if (a === OTHER_ID) return 1
        if (b === OTHER_ID) return -1
        return (subjectTotals.get(b) ?? 0) - (subjectTotals.get(a) ?? 0)
      })

      const nameFor = (sid: string) =>
        sid === OTHER_ID
          ? "Other"
          : (getSubjectById(sid)?.name ?? "Unassigned")

      const topSummaries = sorted
        .slice(0, TOP_N)
        .map(([sid, minutes]) => ({ name: nameFor(sid), minutes }))
      const allSummaries = sorted.map(([sid, minutes]) => ({
        name: nameFor(sid),
        minutes,
      }))

      return {
        chartData: points,
        subjectIds: visibleIds,
        hiddenCount: hasOthers ? sorted.length - TOP_N : 0,
        totalMinutes: total,
        topSummaries,
        allSummaries,
      }
    }, [data])

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
              const sid = String(name)
              const displayName =
                sid === OTHER_ID
                  ? "Other"
                  : (getSubjectById(sid)?.name ?? "Unassigned")
              return [formatMinutes(Number(value)), displayName]
            }}
          />
          {subjectIds.map((subjectId) => {
            const isOther = subjectId === OTHER_ID
            const color = isOther
              ? "var(--muted-foreground)"
              : getSubjectColor(subjectId)
            return (
              <Area
                key={subjectId}
                type="monotone"
                dataKey={subjectId}
                stackId="1"
                stroke={color}
                fill={color}
                fillOpacity={isOther ? 0.2 : 0.3}
                strokeWidth={1.5}
              />
            )
          })}
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {subjectIds.map((sid) => {
          const isOther = sid === OTHER_ID
          const color = isOther
            ? "var(--muted-foreground)"
            : getSubjectColor(sid)
          const name =
            isOther
              ? "Other"
              : (getSubjectById(sid)?.name ?? "Unassigned")
          return (
            <div key={sid} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: color,
                  opacity: isOther ? 0.4 : 1,
                }}
              />
              <span className="text-caption text-muted-foreground">{name}</span>
            </div>
          )
        })}
      </div>
      <p className="sr-only">
        Study time trend over {chartData.length} day{chartData.length === 1 ? "" : "s"}:
        total {formatTotalMinutes(totalMinutes)}
        {topSummaries.length > 0
          ? `. Top subjects: ${topSummaries
              .map((s) => `${s.name} ${formatTotalMinutes(s.minutes)}`)
              .join(", ")}`
          : ""}
        {hiddenCount > 0
          ? ` (${hiddenCount} additional subject${hiddenCount === 1 ? "" : "s"} grouped as Other)`
          : ""}
        {allSummaries.length > 0
          ? `. All subjects: ${allSummaries
              .map((s) => `${s.name} ${formatTotalMinutes(s.minutes)}`)
              .join(", ")}`
          : ""}
        .
      </p>
    </Card>
  )
}
