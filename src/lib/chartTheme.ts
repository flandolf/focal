import { getSubjectById } from "@/lib/utils"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]
}

export function getSubjectColor(subjectId: string): string {
  const subject = getSubjectById(subjectId)
  return subject?.color ?? "var(--chart-2)"
}

export function getHeatColor(level: 0 | 1 | 2 | 3 | 4): string {
  switch (level) {
    case 0:
      return "var(--muted)"
    case 1:
      return "var(--chart-3)"
    case 2:
      return "var(--chart-4)"
    case 3:
      return "var(--chart-2)"
    case 4:
      return "var(--chart-1)"
    default:
      return "var(--muted)"
  }
}
