import type { CalendarEvent, PriorityUrgency } from "@/lib/types"

export interface PrepBalanceItem {
  subjectId: string
  shortCode: string
  name: string
  color: string
  assessmentCount: number
  plannedMinutes: number
  nextTitle?: string
  nextDate?: Date
  projectId?: string
  event?: CalendarEvent
}

export function getUrgencyLabel(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical": return "Critical"
    case "high": return "High"
    case "medium": return "Medium"
    case "low": return "Low"
  }
}

export function getUrgencyClassName(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical": return "bg-destructive/12 text-destructive"
    case "high": return "bg-warning/14 text-warning dark:text-warning"
    case "medium": return "bg-primary/12 text-primary"
    case "low": return "bg-muted text-muted-foreground"
  }
}
