import { getApiKey, getModel, getReasoningConfig } from "@/lib/settings"
import type { TimetableConfig, TimetableEntry, TimetableDayLabel, SchoolHoliday } from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"

import type { TimetablePeriod } from "@/lib/types"

// --- Types ---

const TIMETABLE_BREAK_LABELS = new Set([
  "recess",
  "lunch",
  "homeroom",
  "assembly",
  "form",
  "free",
])

export interface TimetableParseDraft {
  dayLabel: TimetableDayLabel
  periods: {
    period: string
    subject: string
    location: string
    startTime: string
    endTime: string
  }[]
}

export interface TimetableParseResult {
  entries: TimetableParseDraft[]
  holidays: { name: string; startDate: string; endDate: string }[]
  raw: string
}

// --- Helpers ---

function timeStringToMinutes(t: string): number {
  return timetableTimeToMinutes(t) ?? Number.POSITIVE_INFINITY
}

export const TIMETABLE_SCREENSHOT_PROMPT = `I have attached a screenshot of my school timetable. Convert it into a Focal timetable import file.

Return only valid JSON with no markdown fences, commentary, or citations. Use exactly this shape:
{
  "cycleLength": 10,
  "entries": [
    {
      "dayLabel": 1,
      "periods": [
        {
          "period": "Period 1",
          "subject": "Mathematical Methods",
          "location": "Room 12",
          "startTime": "09:00",
          "endTime": "10:00"
        }
      ]
    }
  ]
}

Requirements:
- Read every visible timetable day and put each day in one entries item.
- dayLabel must be a whole number starting at 1. Preserve numbered cycle days if shown; otherwise number the visible days from left to right.
- cycleLength must equal the timetable cycle length. If the screenshot only shows one five-day school week, use 5. If it shows a two-week Day 1–10 cycle, use 10.
- Use 24-hour HH:mm times with leading zeroes. Copy the displayed times precisely.
- Include classes, study periods, homeroom/form, assembly, recess, lunch, and other visible fixed periods.
- period is the row or period label. subject is the subject exactly as shown. location is the room exactly as shown, or an empty string when none is visible.
- Do not invent unreadable subjects, rooms, days, or times. Use an empty string for an unreadable subject or location. If a start or end time is unreadable, stop and tell me which time needs clarification instead of producing JSON.
- Do not include dates, holidays, colours, teachers, notes, or any keys not shown in the required shape.

Before answering, silently check that every endTime is later than its startTime and that every dayLabel is between 1 and cycleLength. Your final answer must be only the raw JSON so I can save it as focal-timetable.json and import it.`

function timetableImportError(message: string): never {
  throw new Error(`Could not import timetable: ${message}`)
}

function readImportString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key]
  if (typeof value !== "string") timetableImportError(`${context} is missing ${key}.`)
  return value.trim()
}

function parseTimetableImportObject(value: unknown, current: TimetableConfig): TimetableConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    timetableImportError("the file must contain one timetable object.")
  }
  const root = value as Record<string, unknown>
  const cycleLength = root.cycleLength
  if (typeof cycleLength !== "number" || !Number.isInteger(cycleLength) || cycleLength < 1 || cycleLength > 60) {
    timetableImportError("cycleLength must be a whole number from 1 to 60.")
  }
  if (!Array.isArray(root.entries) || root.entries.length === 0) {
    timetableImportError("entries must contain at least one day.")
  }

  const entries = root.entries.map((entry, entryIndex): TimetableEntry => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      timetableImportError(`entry ${entryIndex + 1} must be an object.`)
    }
    const record = entry as Record<string, unknown>
    const dayLabel = record.dayLabel
    if (typeof dayLabel !== "number" || !Number.isInteger(dayLabel) || dayLabel < 1 || dayLabel > cycleLength) {
      timetableImportError(`entry ${entryIndex + 1} has a dayLabel outside 1-${cycleLength}.`)
    }
    if (!Array.isArray(record.periods) || record.periods.length === 0) {
      timetableImportError(`Day ${dayLabel} must contain at least one period.`)
    }
    const periods = record.periods.map((period, periodIndex): TimetablePeriod => {
      const context = `Day ${dayLabel}, period ${periodIndex + 1}`
      if (typeof period !== "object" || period === null || Array.isArray(period)) {
        timetableImportError(`${context} must be an object.`)
      }
      const periodRecord = period as Record<string, unknown>
      const parsed = {
        period: readImportString(periodRecord, "period", context),
        subject: readImportString(periodRecord, "subject", context),
        location: readImportString(periodRecord, "location", context),
        startTime: readImportString(periodRecord, "startTime", context),
        endTime: readImportString(periodRecord, "endTime", context),
      }
      const error = getTimetablePeriodError(parsed)
      if (error) timetableImportError(`${context}: ${error}`)
      return parsed
    })
    return { dayLabel, periods }
  })

  const mergedEntries = Array.from({ length: cycleLength }, (_, index) => ({
    dayLabel: index + 1,
    periods: entries
      .filter((entry) => entry.dayLabel === index + 1)
      .flatMap((entry) => entry.periods)
      .sort(comparePeriodsByStart),
  })).filter((entry) => entry.periods.length > 0)

  return {
    ...current,
    enabled: true,
    cycleLength,
    dayToWeekday: undefined,
    currentDayOverride: null,
    entries: mergedEntries,
  }
}

function directChild(element: Element, name: string): Element | undefined {
  return Array.from(element.children).find((child) => child.tagName.toLowerCase() === name.toLowerCase())
}

function directChildren(element: Element, name: string): Element[] {
  return Array.from(element.children).filter((child) => child.tagName.toLowerCase() === name.toLowerCase())
}

function xmlText(element: Element, name: string): string {
  return directChild(element, name)?.textContent?.trim() ?? ""
}

function parseTimetableXml(content: string): unknown {
  const document = new DOMParser().parseFromString(content, "application/xml")
  if (document.querySelector("parsererror")) timetableImportError("the XML is malformed.")
  const root = document.documentElement
  if (root.tagName.toLowerCase() !== "timetable") timetableImportError("XML must use <timetable> as its root element.")
  const entriesElement = directChild(root, "entries")
  const dayElements = entriesElement ? directChildren(entriesElement, "day") : directChildren(root, "day")
  return {
    cycleLength: Number(root.getAttribute("cycleLength") ?? root.getAttribute("cycle-length")),
    entries: dayElements.map((day) => {
      const periodsElement = directChild(day, "periods")
      const periodElements = periodsElement ? directChildren(periodsElement, "period") : directChildren(day, "period")
      return {
        dayLabel: Number(day.getAttribute("label") ?? day.getAttribute("dayLabel")),
        periods: periodElements.map((period) => ({
          period: xmlText(period, "name") || xmlText(period, "period"),
          subject: xmlText(period, "subject"),
          location: xmlText(period, "location"),
          startTime: xmlText(period, "startTime"),
          endTime: xmlText(period, "endTime"),
        })),
      }
    }),
  }
}

export function parseTimetableImport(
  content: string,
  fileName: string,
  current: TimetableConfig,
): TimetableConfig {
  const trimmed = content.trim()
  if (!trimmed) timetableImportError("the selected file is empty.")
  const isXml = fileName.toLowerCase().endsWith(".xml") || trimmed.startsWith("<")
  let parsed: unknown
  try {
    parsed = isXml ? parseTimetableXml(trimmed) : JSON.parse(trimmed)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Could not import timetable:")) throw error
    timetableImportError(isXml ? "the XML is malformed." : "the JSON is malformed.")
  }
  return parseTimetableImportObject(parsed, current)
}

function comparePeriodsByStart(a: TimetablePeriod, b: TimetablePeriod): number {
  return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
}

function copyPeriodIntoSlot(
  period: TimetablePeriod,
  slot: Pick<TimetablePeriod, "startTime" | "endTime">,
): TimetablePeriod {
  return { ...period, startTime: slot.startTime, endTime: slot.endTime }
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function normaliseSubject(rawSubject: string, subjects: string[]): string {
  const trimmed = rawSubject.trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()

  // Exact match
  const exact = subjects.find((s) => s.toLowerCase() === lower)
  if (exact) return exact

  // Short-code match (last whitespace-delimited token, e.g. "Mathematical Methods" → "Methods")
  const shortCode = subjects.find((s) => {
    const parts = s.split(/\s+/)
    return parts[parts.length - 1].toLowerCase() === lower
  })
  if (shortCode) return shortCode

  // Whole-word match against the first word of the subject, so "maths" doesn't match "mathematical" via substring
  const wordRe = new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
  const partial = subjects.find((s) => wordRe.test(s))
  if (partial) return partial

  return trimmed
}

export function isTimetableBreakLabel(label: string): boolean {
  return TIMETABLE_BREAK_LABELS.has(label.trim().toLowerCase())
}

/** Parse a persisted HH:mm value without accepting partial or out-of-range times. */
export function timetableTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export type TimetableMeridiem = "AM" | "PM"

export interface TimetableTimeParts {
  hour: number
  minute: number
  meridiem: TimetableMeridiem
}

export function timetableTimeTo12HourParts(value: string): TimetableTimeParts | null {
  const total = timetableTimeToMinutes(value)
  if (total === null) return null
  const hour24 = Math.floor(total / 60)
  return {
    hour: hour24 % 12 || 12,
    minute: total % 60,
    meridiem: hour24 < 12 ? "AM" : "PM",
  }
}

export function timetableTimeFrom12HourParts(
  hour: number,
  minute: number,
  meridiem: TimetableMeridiem,
): string | null {
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null
  const hour24 = (hour % 12) + (meridiem === "PM" ? 12 : 0)
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** Return a user-facing validation error for a timetable period, or null when valid. */
export function getTimetablePeriodError(period: TimetablePeriod): string | null {
  if (!period.period.trim()) return "Add a period name."
  const start = timetableTimeToMinutes(period.startTime)
  const end = timetableTimeToMinutes(period.endTime)
  if (start === null || end === null) return "Use a valid start and end time."
  if (end <= start) return "End time must be after start time."
  return null
}

/** Merge duplicate day entries and return periods in start-time order. */
export function getTimetablePeriodsForDay(
  dayLabel: TimetableDayLabel,
  entries: TimetableEntry[],
): TimetablePeriod[] {
  return entries
    .filter((entry) => entry.dayLabel === dayLabel)
    .flatMap((entry) => entry.periods)
    .sort(comparePeriodsByStart)
}

/** Find every timetable period on a calendar date, respecting the configured cycle. */
export function getTimetablePeriodsForDate(
  date: Date,
  config: TimetableConfig,
): TimetablePeriod[] {
  if (!config.enabled) return []
  const dayLabel = getDayLabelForDate(
    date,
    config.day1Starts,
    config.holidays,
    config.cycleLength,
    config.weekendTimetables,
  )
  if (dayLabel === null) return []
  return getTimetablePeriodsForDay(dayLabel, config.entries)
}

/** Find every period for a subject on a calendar date, respecting the configured cycle. */
export function getTimetablePeriodsForSubjectOnDate(
  date: Date,
  subjectId: string,
  config: TimetableConfig,
): TimetablePeriod[] {
  if (!subjectId) return []
  return getTimetablePeriodsForDate(date, config)
    .filter((period) => period.subject === subjectId)
}

export function reorderPeriodsIntoSlots({
  periods,
  periodToMove,
  insertIndex,
  showBreaks,
}: {
  periods: TimetablePeriod[]
  periodToMove: TimetablePeriod
  insertIndex: number
  showBreaks: boolean
}): TimetablePeriod[] {
  const sortedPeriods = [...periods].sort(comparePeriodsByStart)
  const fixedPeriods = showBreaks
    ? []
    : sortedPeriods.filter((period) => isTimetableBreakLabel(period.period))
  const movablePeriods = showBreaks
    ? sortedPeriods
    : sortedPeriods.filter((period) => !isTimetableBreakLabel(period.period))
  const orderedMovablePeriods = [...movablePeriods]
  orderedMovablePeriods.splice(
    Math.min(Math.max(insertIndex, 0), orderedMovablePeriods.length),
    0,
    { ...periodToMove },
  )
  const movableSlots = [...movablePeriods, periodToMove].sort(
    comparePeriodsByStart,
  )
  const retimedMovablePeriods = orderedMovablePeriods.map((period, i) =>
    copyPeriodIntoSlot(period, movableSlots[i] ?? period),
  )
  return [...fixedPeriods, ...retimedMovablePeriods].sort(comparePeriodsByStart)
}

function parseTimetableResponse(
  content: string,
): { entries: unknown[]; holidays: unknown[] } {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[timetable] failed to parse AI response as JSON", err, content.slice(0, 200))
    }
    return { entries: [], holidays: [] }
  }
  const rawEntries = Array.isArray(parsed.entries)
    ? parsed.entries
    : Array.isArray(parsed.timetable)
      ? parsed.timetable
      : []

  const holidays = Array.isArray(parsed.holidays) ? parsed.holidays : []
  return { entries: rawEntries, holidays }
}

function normalisePeriodTime(time: string): string {
  if (typeof time !== "string") return "09:00"
  // Accept "9:00", "09:00", "9:00am", "09:00", "9:00 AM", "9.00"
  const cleaned = time.trim().toLowerCase().replace(/"/g, "")
  const normalized = cleaned.replace(/am|pm/gi, "").trim()
  const parts = normalized.split(/[:\u3001.]/)
  if (parts.length < 2) return "09:00"

  let hours = parseInt(parts[0], 10)
  const minutes = parseInt(parts[1].padEnd(2, "0").slice(0, 2), 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "09:00"

  if (cleaned.includes("pm") && hours !== 12) hours += 12
  if (cleaned.includes("am") && hours === 12) hours = 0

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function toTimetableEntry(raw: unknown): TimetableParseDraft | null {
  if (typeof raw !== "object" || raw === null) return null

  const r = raw as Record<string, unknown>
  const rawDay = r.day ?? r.day_label ?? r.dayNumber ?? r.day_number
  const dayLabel =
    typeof rawDay === "number" && rawDay >= 1 && rawDay <= 10 && Number.isInteger(rawDay)
      ? rawDay
      : null

  if (!dayLabel) return null

  const rawPeriods = Array.isArray(r.periods) ? r.periods : []
  if (rawPeriods.length === 0) return null

  const subjectIds = VCE_SUBJECTS.map((s) => s.id)

  const periods = rawPeriods
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => {
      const rawSubject = typeof p.subject === "string" ? p.subject : typeof p.name === "string" ? p.name : ""
      return {
        period: typeof p.period === "string" ? p.period.trim() : typeof p.periodNumber === "string" ? p.periodNumber.trim() : "Period",
        subject: normaliseSubject(rawSubject, subjectIds),
        location: typeof p.location === "string" ? p.location.trim() : "",
        startTime: normalisePeriodTime(typeof p.start_time === "string" ? p.start_time : typeof p.startTime === "string" ? p.startTime : "09:00"),
        endTime: normalisePeriodTime(typeof p.end_time === "string" ? p.end_time : typeof p.endTime === "string" ? p.endTime : "10:00"),
      }
    })
    .filter((p) => p.startTime < p.endTime)

  if (periods.length === 0) return null

  return { dayLabel, periods }
}

// --- Public API ---

export async function parseTimetableFromImage(
  imageBase64: string, // data:image/...;base64,...
  holidays: { name: string; startDate: string; endDate: string }[],
  _existingDay1Starts: string, // reserved for future use
): Promise<TimetableParseResult> {
  const apiKey = getApiKey()
  const model = getModel()
  if (!apiKey) throw new Error("OpenRouter API key not configured")

  const holidayLines = holidays.length > 0
    ? holidays.map((h) => `  - ${h.name}: ${h.startDate} to ${h.endDate}`).join("\n")
    : "  (none)"

  const subjectLines = VCE_SUBJECTS.map((s) => `  - "${s.id}" = ${s.name}`).join("\n")

  const dayLabelOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].join(", ")

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are a timetable parser for a VCE (Victorian Certificate of Education) school in Australia.

TASK: Analyse the uploaded school timetable image and return a structured JSON representation.

KEY CONCEPTS:
- Day numbers run on a 10-day cycle over 2 school weeks: Day 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- The cycle counts only weekdays (Mon–Fri) — weekends are skipped, so Day 1 = Monday, Day 6 = Monday of week 2
- "day_label" must be one of: ${dayLabelOptions}
- "period" is the period name/label shown on the timetable (e.g. "Period 1", "P1", "1", "Lunch", "Recess", "Homeroom")
- "subject" must be a VCE subject ID from the allowed list below when possible
- "location" is the room/venue if visible, otherwise empty string
- Times use 24-hour HH:mm format (e.g. "09:00", "13:30")

ALLOWED VCE SUBJECT IDs:
${subjectLines}

HOLIDAY PERIODS (during which the timetable should not apply):
${holidayLines}

OUTPUT FORMAT — return a JSON object with two fields:
{
  "entries": [
    {
      "day_label": 1,          // 1–10
      "periods": [
        {
          "period": "Period 1",
          "subject": "chem",
          "location": "Room 101",
          "start_time": "09:00",
          "end_time": "10:15"
        }
      ]
    }
  ],
  "holidays": [
    {
      "name": "Term 1 Holidays",
      "start_date": "2026-03-31",
      "end_date": "2026-04-07"
    }
  ]
}

RULES:
- If a subject is not in the allowed list, use the subject name as-is (don't force-fit it)
- If a period spans recess/lunch (e.g. "Recess 10:30–10:50"), include it as a period entry
- "Recess" and "Lunch" are valid period names
- If the timetable shows Homeroom / form / assembly at the start of the day, include it
- Group all periods for a single day_label into one entry
- Be precise with times — use what the image shows
- For holidays: only add entries if you can clearly read a named holiday period with start/end dates from the image`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageBase64, detail: "high" },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "timetable_parse",
          strict: true,
          schema: {
            type: "object",
            properties: {
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    day_label: { type: "number" },
                    periods: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          period: { type: "string" },
                          subject: { type: "string" },
                          location: { type: "string" },
                          start_time: { type: "string" },
                          end_time: { type: "string" },
                        },
                        required: ["period", "subject", "location", "start_time", "end_time"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["day_label", "periods"],
                  additionalProperties: false,
                },
              },
              holidays: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    start_date: { type: "string" },
                    end_date: { type: "string" },
                  },
                  required: ["name", "start_date", "end_date"],
                  additionalProperties: false,
                },
              },
            },
            required: ["entries", "holidays"],
            additionalProperties: false,
          },
        },
      },
      provider: { require_parameters: true },
      temperature: 0.1,
      max_tokens: 3200,
      ...getReasoningConfig(),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${text}`)
  }

  const data = await response.json() as { choices?: { message?: { content?: unknown } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("No structured content in OpenRouter response")
  }

  const { entries: rawEntries, holidays: rawHolidays } = parseTimetableResponse(content)

  const timetableEntries = rawEntries
    .map(toTimetableEntry)
    .filter((e): e is TimetableParseDraft => e !== null)

  const parsedHolidays: SchoolHoliday[] = rawHolidays
    .filter((h): h is Record<string, unknown> => typeof h === "object" && h !== null)
    .map((h) => ({
      name: typeof h.name === "string" ? h.name.trim() : "School Holiday",
      startDate: typeof h.start_date === "string" ? h.start_date.trim() : "",
      endDate: typeof h.end_date === "string" ? h.end_date.trim() : "",
    }))
    .filter((h) => h.startDate && h.endDate)

  return {
    entries: timetableEntries,
    holidays: parsedHolidays,
    raw: content,
  }
}

export function isDateInHoliday(date: Date, holidays: SchoolHoliday[]): boolean {
  const dateStr = toLocalDateStr(date)
  return holidays.some((h) => dateStr >= h.startDate && dateStr <= h.endDate)
}

/**
 * Count weekdays (Mon–Fri) between two local-midnight dates, excluding the start date
 * and including the end date. Counts only school days, skipping weekends.
 */
function countSchoolDaysBetween(
  start: Date,
  end: Date,
  holidays: SchoolHoliday[],
  weekendTimetables: boolean,
): number {
  let count = 0
  const cursor = new Date(start)

  // ponytail: a day-by-day scan keeps overlapping holidays correct. School
  // cycles are short; upgrade to merged date ranges only if multi-decade spans matter.
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1)
    const weekend = cursor.getDay() === 0 || cursor.getDay() === 6
    if ((weekendTimetables || !weekend) && !isDateInHoliday(cursor, holidays)) count++
  }

  return count
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null
  return date
}

/**
 * Compute the day label (1..cycleLength) for a given date based on the configured day-1 start date.
 * When `weekendTimetables` is false (default), weekends (Sat/Sun) are skipped and the function
 * returns null. When true, all 7 days count toward the cycle so Saturday/Sunday have their own
 * day-labels according to dayToWeekday.
 * Returns null if the date falls within a holiday period, or before day-1 starts.
 *
 * Uses local-date arithmetic so behaviour is consistent across timezones — VCE schools
 * operate on local calendar days, not UTC days.
 */
export function getDayLabelForDate(
  date: Date,
  day1Starts: string,
  holidays: SchoolHoliday[],
  cycleLength = 10,
  weekendTimetables = false,
): TimetableDayLabel | null {
  if (isDateInHoliday(date, holidays)) return null

  const start = parseLocalDate(day1Starts)
  if (!start) return null

  const msPerDay = 24 * 60 * 60 * 1000
  // Compare in local-midnight space so the diff isn't skewed by time-of-day or timezone.
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const dateLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((dateLocal.getTime() - startLocal.getTime()) / msPerDay)
  if (diffDays < 0) return null

  // When weekend timetables are off, Sat(6)/Sun(0) are not school days.
  if (!weekendTimetables && (dateLocal.getDay() === 0 || dateLocal.getDay() === 6)) return null

  // Count school days since day1Starts. When weekend timetables are on, count
  // every day; otherwise only Mon–Fri.
  const schoolDayCount = countSchoolDaysBetween(startLocal, dateLocal, holidays, weekendTimetables)
  const length = Number.isInteger(cycleLength) && cycleLength >= 1 ? cycleLength : 10
  return (schoolDayCount % length) + 1
}

/**
 * Find the timetable entries for a given day label.
 */
export function getTimetableEntriesForDay(
  dayLabel: TimetableDayLabel,
  entries: TimetableEntry[],
): TimetableEntry[] {
  return entries.filter((e) => e.dayLabel === dayLabel)
}

export interface CurrentPeriodInfo {
  current: TimetablePeriod | null
  next: TimetablePeriod | null
  remainingMinutes: number
}

/**
 * Find the current (in-progress) and next upcoming period from a list of periods,
 * based on the current wall-clock time.
 *
 * Sorts periods by start time internally so the result is correct regardless of input order.
 * Periods with invalid (NaN) times are skipped. If the current time is before all periods,
 * the first period is reported as `next`. If after all periods, `next` is null.
 */
export function getCurrentPeriodInfo(periods: TimetablePeriod[], now?: Date): CurrentPeriodInfo {
  const date = now ?? new Date()
  const currentMinutes = date.getHours() * 60 + date.getMinutes()

  const parsed = periods
    .map((p) => {
      const [sh, sm] = p.startTime.split(":").map(Number)
      const [eh, em] = p.endTime.split(":").map(Number)
      if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return null
      const start = sh * 60 + sm
      const end = eh * 60 + em
      if (end <= start) return null
      return { period: p, start, end }
    })
    .filter((p): p is { period: TimetablePeriod; start: number; end: number } => p !== null)
    .sort((a, b) => a.start - b.start)

  let current: TimetablePeriod | null = null
  let next: TimetablePeriod | null = null
  let remainingMinutes = 0

  for (const p of parsed) {
    if (currentMinutes >= p.start && currentMinutes < p.end) {
      current = p.period
      remainingMinutes = p.end - currentMinutes
      // A current period is in progress; `next` is the period after it.
      continue
    }
    if (current === null && currentMinutes < p.start && next === null) {
      next = p.period
    } else if (current !== null && next === null && p.start > currentMinutes) {
      next = p.period
    }
  }

  return { current, next, remainingMinutes }
}

export interface TimetableAiEditDraft {
  dayLabel: TimetableDayLabel
  periods: {
    period: string
    subject: string
    location: string
    startTime: string
    endTime: string
  }[]
}

export interface TimetableAiEditResult {
  day1Starts: string
  holidays: { name: string; startDate: string; endDate: string }[]
  entries: TimetableAiEditDraft[]
  summary: string
}

/**
 * Ask the AI to modify the current timetable according to a natural-language instruction.
 * Returns a full proposed timetable (not a diff) that the user can review and edit before saving.
 */
export async function aiEditTimetable(
  currentConfig: {
    day1Starts: string
    holidays: { name: string; startDate: string; endDate: string }[]
    entries: { dayLabel: number; periods: { period: string; subject: string; location?: string; startTime: string; endTime: string }[] }[]
  },
  instruction: string,
  subjects: { id: string; name: string; shortCode: string; color: string }[],
): Promise<TimetableAiEditResult> {
  const apiKey = getApiKey()
  const model = getModel()
  if (!apiKey) throw new Error("OpenRouter API key not configured")

  const subjectLines = subjects.map((s) => `  - "${s.id}" = ${s.name}`).join("\n")

  const currentJson = JSON.stringify(currentConfig, null, 2)

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are a timetable editor for a VCE (Victorian Certificate of Education) school in Australia.
TASK: Edit the user's school timetable according to their natural-language instruction. Return the COMPLETE modified timetable as JSON.
CURRENT TIMETABLE (JSON):
${currentJson}

AVAILABLE SUBJECT IDs:
${subjectLines}

KEY RULES:
- Day numbers run on a 10-day cycle over 2 school weeks: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- The cycle counts only weekdays (Mon–Fri) — weekends are skipped, so Day 1 = Monday, Day 6 = Monday of week 2
- "period" is the period slot name (e.g. "Period 1", "Recess", "Lunch", "Homeroom", "Assembly", "Form")
- "subject" must be a subject ID from the list when a real subject applies, OR a custom label like "Roll Call", "Assembly", "Form" for non-subject events
- Keep custom labels rather than forcing them to a subject ID
- Times use HH:mm format (e.g. "09:00")
- Holidays use YYYY-MM-DD format

OUTPUT FORMAT — return a JSON object:
{
  "day_1_starts": "2026-01-29",
  "holidays": [
    { "name": "Term 1 Holidays", "start_date": "2026-03-31", "end_date": "2026-04-07" }
  ],
  "entries": [
    {
      "day_label": 1,
      "periods": [
        {
          "period": "Period 1",
          "subject": "chem",
          "location": "Room 101",
          "start_time": "09:00",
          "end_time": "10:15"
        }
      ]
    }
  ],
  "summary": "Brief explanation of what was changed"
}

If the instruction doesn't require changes to day_1_starts or holidays, keep them as-is from the current timetable.
The summary should be a brief sentence explaining the key change made.`,
        },
        {
          role: "user",
          content: instruction,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "timetable_edit",
          strict: true,
          schema: {
            type: "object",
            properties: {
              day_1_starts: { type: "string" },
              holidays: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    start_date: { type: "string" },
                    end_date: { type: "string" },
                  },
                  required: ["name", "start_date", "end_date"],
                  additionalProperties: false,
                },
              },
              entries: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    day_label: { type: "number" },
                    periods: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          period: { type: "string" },
                          subject: { type: "string" },
                          location: { type: "string" },
                          start_time: { type: "string" },
                          end_time: { type: "string" },
                        },
                        required: ["period", "subject", "location", "start_time", "end_time"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["day_label", "periods"],
                  additionalProperties: false,
                },
              },
              summary: { type: "string" },
            },
            required: ["day_1_starts", "holidays", "entries", "summary"],
            additionalProperties: false,
          },
        },
      },
      provider: { require_parameters: true },
      temperature: 0.1,
      max_tokens: 4000,
      ...getReasoningConfig(),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${text}`)
  }

  const data = await response.json() as { choices?: { message?: { content?: unknown } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("No structured content in OpenRouter response")
  }

  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid AI response")
  }

  const record = parsed as Record<string, unknown>

  const summary = typeof record.summary === "string" ? record.summary.trim() : "Timetable updated"

  const day1Starts = typeof record.day_1_starts === "string" ? record.day_1_starts.trim() : currentConfig.day1Starts

  const rawHolidays = Array.isArray(record.holidays) ? record.holidays : []
  const holidays = rawHolidays
    .filter((h): h is Record<string, unknown> => typeof h === "object" && h !== null)
    .map((h) => ({
      name: typeof h.name === "string" ? h.name.trim() : "Holiday",
      startDate: typeof h.start_date === "string" ? h.start_date.trim() : "",
      endDate: typeof h.end_date === "string" ? h.end_date.trim() : "",
    }))
    .filter((h) => h.startDate && h.endDate)

  const rawEntries = Array.isArray(record.entries) ? record.entries : []
  const entries: TimetableAiEditDraft[] = rawEntries
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map((e) => {
      const dayLabel = typeof e.day_label === "number" && e.day_label >= 1 && e.day_label <= 10
        ? e.day_label
        : 1
      const rawPeriods = Array.isArray(e.periods) ? e.periods : []
      const periods = rawPeriods
        .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
        .map((p) => ({
          period: typeof p.period === "string" ? p.period.trim() : "",
          subject: typeof p.subject === "string" ? p.subject.trim() : "",
          location: typeof p.location === "string" ? p.location.trim() : "",
          startTime: typeof p.start_time === "string" ? p.start_time.trim() : "09:00",
          endTime: typeof p.end_time === "string" ? p.end_time.trim() : "10:00",
        }))
        .filter((p) => p.period)
      return { dayLabel, periods }
    })
    .filter((e) => e.periods.length > 0)

  return { day1Starts, holidays, entries, summary }
}
