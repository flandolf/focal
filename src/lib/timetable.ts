import { getApiKey, getModel, getReasoningConfig } from "@/lib/settings"
import type { TimetableEntry, TimetableDayLabel, SchoolHoliday } from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"

// --- Types ---

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

function normaliseSubject(rawSubject: string, subjects: string[]): string {
  const trimmed = rawSubject.trim()
  if (!trimmed) return trimmed

  // Exact match
  const exact = subjects.find(
    (s) => s.toLowerCase() === trimmed.toLowerCase(),
  )
  if (exact) return exact

  // Short-code match
  const shortCode = subjects.find((s) => {
    const parts = s.split(" ")
    return parts[parts.length - 1].toLowerCase() === trimmed.toLowerCase()
  })
  if (shortCode) return shortCode

  // Partial match
  const partial = subjects.find((s) =>
    s.toLowerCase().includes(trimmed.toLowerCase()) ||
    trimmed.toLowerCase().includes(s.split(" ")[0].toLowerCase()),
  )
  if (partial) return partial

  return trimmed
}

function parseTimetableResponse(
  content: string,
): { entries: unknown[]; holidays: unknown[] } {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(content) as Record<string, unknown>
  } catch {
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
  // Accept "9:00", "09:00", "9:00am", "09:00", "9:00 AM"
  const cleaned = time.trim().toLowerCase().replace(/"/g, "")
  const normalized = cleaned.replace(/am|pm/gi, "").trim()
  const parts = normalized.split(/[:\u3001.]/)
  if (parts.length < 2) return "09:00"

  let hours = parseInt(parts[0], 10)
  const minutes = parseInt(parts[1].padEnd(2, "0").slice(0, 2), 10)

  if (cleaned.includes("pm") && hours !== 12) hours += 12
  if (cleaned.includes("am") && hours === 12) hours = 0

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function toTimetableEntry(raw: unknown): TimetableParseDraft | null {
  if (typeof raw !== "object" || raw === null) return null

  const r = raw as Record<string, unknown>
  const rawDay = r.day ?? r.day_label ?? r.dayNumber ?? r.day_number
  const dayLabel =
    typeof rawDay === "number" && rawDay >= 1 && rawDay <= 10
      ? (rawDay as TimetableDayLabel)
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
        period: typeof p.period === "string" ? p.period.trim() : typeof p.periodNumber === "string" ? p.periodNumber.trim() : "?",
        subject: normaliseSubject(rawSubject, subjectIds),
        location: typeof p.location === "string" ? p.location.trim() : "",
        startTime: normalisePeriodTime(typeof p.start_time === "string" ? p.start_time : typeof p.startTime === "string" ? p.startTime : "09:00"),
        endTime: normalisePeriodTime(typeof p.end_time === "string" ? p.end_time : typeof p.endTime === "string" ? p.endTime : "10:00"),
      }
    })

  return { dayLabel, periods }
}

// --- Public API ---

export async function parseTimetableFromImage(
  imageBase64: string, // data:image/...;base64,...
  holidays: { name: string; startDate: string; endDate: string }[],
  _existingDay1Starts: string,
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
- Day numbers run on a 10-day cycle: Day 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
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
  const dateStr = date.toISOString().slice(0, 10)
  return holidays.some((h) => dateStr >= h.startDate && dateStr <= h.endDate)
}

/**
 * Compute the day label (1–10) for a given date based on the configured day-1 start date.
 * Returns null if the date falls within a holiday period.
 */
export function getDayLabelForDate(
  date: Date,
  day1Starts: string,
  holidays: SchoolHoliday[],
): TimetableDayLabel | null {
  if (isDateInHoliday(date, holidays)) return null

  const start = new Date(day1Starts)
  if (Number.isNaN(start.getTime())) return null

  const msPerDay = 24 * 60 * 60 * 1000
  const diffDays = Math.floor((date.getTime() - start.getTime()) / msPerDay)
  if (diffDays < 0) return null

  return ((diffDays % 10) + 1) as TimetableDayLabel
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