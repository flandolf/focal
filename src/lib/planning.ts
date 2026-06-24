import { getDayLabelForDate, getTimetableEntriesForDay } from "@/lib/timetable"
import type { CalendarEvent, PriorityUrgency, StudyPlanningPreferences, StudySession, TimetableConfig } from "@/lib/types"

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

export interface AvailableStudyInterval {
  date: string
  startTime: string
  endTime: string
  availableMinutes: number
  dailyRemainingMinutes: number
}

export function sumAvailableStudyMinutes(intervals: AvailableStudyInterval[]): number {
  const minutesByDate = new Map<string, { free: number; cap: number }>()
  intervals.forEach((interval) => {
    const current = minutesByDate.get(interval.date) ?? { free: 0, cap: interval.dailyRemainingMinutes }
    minutesByDate.set(interval.date, { free: current.free + interval.availableMinutes, cap: current.cap })
  })
  return Array.from(minutesByDate.values()).reduce((total, day) => total + Math.min(day.free, day.cap), 0)
}

interface TimeRange {
  start: number
  end: number
}

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

function localDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

function parseClock(date: Date, value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes).getTime()
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges.filter((range) => range.end > range.start).sort((a, b) => a.start - b.start)
  const merged: TimeRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
  }
  return merged
}

function subtractRanges(window: TimeRange, busy: TimeRange[]): TimeRange[] {
  let free = [window]
  for (const blocked of busy) {
    free = free.flatMap((range) => {
      if (blocked.end <= range.start || blocked.start >= range.end) return [range]
      return [
        { start: range.start, end: Math.min(range.end, blocked.start) },
        { start: Math.max(range.start, blocked.end), end: range.end },
      ].filter((part) => part.end > part.start)
    })
  }
  return free
}

function getSessionRanges(session: StudySession): TimeRange[] {
  return session.schedule.blocks.map((period) => ({
    start: new Date(period.start).getTime(),
    end: new Date(period.end).getTime(),
  }))
}

export function buildAvailableStudyIntervals({
  preferences,
  sessions,
  events,
  timetableConfig,
  now = new Date(),
  days = 7,
}: {
  preferences: StudyPlanningPreferences
  sessions: StudySession[]
  events: CalendarEvent[]
  timetableConfig?: TimetableConfig | null
  now?: Date
  days?: number
}): AvailableStudyInterval[] {
  const intervals: AvailableStudyInterval[] = []
  const grid = 15 * MINUTE_MS

  for (let offset = 0; offset < days; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const dateKey = localDate(date)
    const dayWindows = preferences.windows.filter((window) => window.weekday === date.getDay())
    if (dayWindows.length === 0) continue

    const dayStart = date.getTime()
    const dayEnd = dayStart + DAY_MS
    const relevantSessionRanges = sessions
      .filter((session) => session.status !== "completed")
      .flatMap(getSessionRanges)
      .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start < dayEnd && range.end > dayStart)
    const plannedMinutes = relevantSessionRanges.reduce((total, range) => (
      total + Math.round((Math.min(range.end, dayEnd) - Math.max(range.start, dayStart)) / MINUTE_MS)
    ), 0)
    const dailyRemainingMinutes = Math.max(0, preferences.dailyCapMinutes - plannedMinutes)
    if (dailyRemainingMinutes < 30) continue

    const busy: TimeRange[] = [
      ...events.filter((event) => !event.isFinished).map((event) => ({
        start: new Date(event.startTime).getTime(),
        // ponytail: untimed events block one hour; add explicit durations if point events become common.
        end: new Date(event.endTime ?? new Date(event.startTime).getTime() + 60 * MINUTE_MS).getTime(),
      })),
      ...relevantSessionRanges,
    ].filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start < dayEnd && range.end > dayStart)

    if (timetableConfig?.enabled) {
      const dayLabel = getDayLabelForDate(
        date,
        timetableConfig.day1Starts,
        timetableConfig.holidays,
        timetableConfig.cycleLength,
        timetableConfig.weekendTimetables,
      )
      if (dayLabel) {
        getTimetableEntriesForDay(dayLabel, timetableConfig.entries).flatMap((entry) => entry.periods).forEach((period) => {
          const start = parseClock(date, period.startTime)
          const end = parseClock(date, period.endTime)
          if (start !== null && end !== null && end > start) busy.push({ start, end })
        })
      }
    }

    if (offset === 0) busy.push({ start: dayStart, end: Math.ceil(now.getTime() / grid) * grid })
    const mergedBusy = mergeRanges(busy)

    for (const window of dayWindows) {
      const rawStart = parseClock(date, window.startTime)
      const rawEnd = parseClock(date, window.endTime)
      if (rawStart === null || rawEnd === null || rawEnd <= rawStart) continue
      const start = Math.ceil(rawStart / grid) * grid
      const end = Math.floor(rawEnd / grid) * grid
      for (const free of subtractRanges({ start, end }, mergedBusy)) {
        const availableMinutes = Math.floor((free.end - free.start) / MINUTE_MS)
        if (availableMinutes < 30) continue
        intervals.push({
          date: dateKey,
          startTime: new Date(free.start).toISOString(),
          endTime: new Date(free.end).toISOString(),
          availableMinutes,
          dailyRemainingMinutes,
        })
      }
    }
  }

  return intervals.sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export function validateStudyPlanBlocks(
  blocks: { startTime: string; endTime: string }[],
  intervals: AvailableStudyInterval[],
): string[][] {
  const usedByDate = new Map<string, number>()
  return blocks.map((block, index) => {
    const errors: string[] = []
    const start = new Date(block.startTime).getTime()
    const end = new Date(block.endTime).getTime()
    const minutes = Math.round((end - start) / MINUTE_MS)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ["Use a valid start and end time."]
    if (minutes < 30 || minutes % 15 !== 0) errors.push("Use a 30+ minute duration in 15-minute steps.")
    const interval = intervals.find((candidate) => start >= new Date(candidate.startTime).getTime() && end <= new Date(candidate.endTime).getTime())
    if (!interval) errors.push("Move this session into one of your free study windows.")
    if (blocks.slice(0, index).some((other) => start < new Date(other.endTime).getTime() && end > new Date(other.startTime).getTime())) {
      errors.push("This session overlaps another draft.")
    }
    if (interval) {
      const used = usedByDate.get(interval.date) ?? 0
      if (used + minutes > interval.dailyRemainingMinutes) errors.push("This exceeds your remaining daily study cap.")
      usedByDate.set(interval.date, used + minutes)
    }
    return errors
  })
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
