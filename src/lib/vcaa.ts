import { invoke } from "@tauri-apps/api/core"
import type { CalendarEvent, Subject } from "@/lib/types"

export const VCAA_TIMETABLE_URL = "https://www.vcaa.vic.edu.au/administration/key-dates/vce-examination-timetable"

export interface VcaaExamCandidate {
  sourceId: string
  year: number
  title: string
  date: string
  startTime: string
  endTime: string
  isGat: boolean
  subjectId?: string
}

export interface VcaaExamParseResult {
  year: number
  exams: VcaaExamCandidate[]
  appointmentWindows: string[]
}

interface FetchVcaaResponse {
  html: string
  url: string
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /(\d{1,2})[:.](\d{2})\s*(am|pm)/i.exec(value)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 1 || hours > 12 || minutes > 59) return null
  if (match[3].toLowerCase() === "pm" && hours !== 12) hours += 12
  if (match[3].toLowerCase() === "am" && hours === 12) hours = 0
  return { hours, minutes }
}

function toLocalIso(year: number, month: number, day: number, time: { hours: number; minutes: number }): string {
  return new Date(year, month, day, time.hours, time.minutes).toISOString()
}

function sourceId(year: number, title: string, startTime: string): string {
  return `${year}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}:${startTime}`
}

function normaliseSubject(value: string): string {
  return value.toLowerCase()
    .replace(/\(eal\)/g, "")
    .replace(/examination\s*[12]?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function matchVcaaSubject(title: string, subjects: Subject[]): string | undefined {
  const aliases: Record<string, string> = {
    "english as an additional language": "English",
    "history australian history": "History",
    "history ancient history": "History",
    "history revolutions": "History",
  }
  const target = normaliseSubject(aliases[normaliseSubject(title)] ?? title)
  const exact = subjects.find((subject) => normaliseSubject(subject.name) === target)
  if (exact) return exact.id
  return subjects.find((subject) => target.includes(normaliseSubject(subject.name)) || normaliseSubject(subject.name).includes(target))?.id
}

function parseExamCell({
  year,
  month,
  day,
  date,
  paragraphs,
  cellText,
}: {
  year: number
  month: number
  day: number
  date: string
  paragraphs: string[]
  cellText: string
}): VcaaExamCandidate[] {
  if (/notified of dates|scheduled in one|public holiday/i.test(cellText)) return []
  const timeMatches = [...cellText.matchAll(/\d{1,2}[:.]\d{2}\s*(?:am|pm)\s*[–—-]\s*\d{1,2}[:.]\d{2}\s*(?:am|pm)/gi)]
  if (timeMatches.length === 0) return []
  const start = parseTime(timeMatches[0][0])
  const endParts = timeMatches[timeMatches.length - 1]?.[0].split(/[–—-]/) ?? []
  const end = parseTime(endParts[endParts.length - 1] ?? "")
  if (!start || !end) return []
  const startTime = toLocalIso(year, month, day, start)
  const endTime = toLocalIso(year, month, day, end)
  if (new Date(endTime) <= new Date(startTime)) return []

  const gatTitle = paragraphs.find((paragraph) => /^GAT Section/i.test(paragraph))
  const titles = gatTitle
    ? [gatTitle.replace(/\s+\d{1,2}[:.].*$/i, "").trim()]
    : paragraphs.filter((paragraph) =>
      !/\d{1,2}[:.]\d{2}\s*(?:am|pm)/i.test(paragraph) &&
      !/^(This|Each|Students|Download|File|The reading|All written)/i.test(paragraph) &&
      paragraph.length > 1)
      .flatMap((paragraph) => paragraph.split(/,\s*/))

  return titles.map((title) => ({
    sourceId: sourceId(year, title, startTime),
    year,
    title,
    date,
    startTime,
    endTime,
    isGat: /^GAT Section/i.test(title),
  }))
}

export function parseVcaaExamDocument(document: Document): VcaaExamParseResult {
  const bodyText = cleanText(document.body.textContent ?? "")
  const year = Number(/(20\d{2}) VCE examination timetable/i.exec(bodyText)?.[1])
  if (!Number.isInteger(year)) throw new Error("The VCAA timetable year could not be found.")
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  const exams: VcaaExamCandidate[] = []
  const appointmentWindows: string[] = []

  document.querySelectorAll("table").forEach((table) => {
    let carriedDate: { month: number; day: number; date: string } | null = null
    table.querySelectorAll("tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll(":scope > th, :scope > td"))
      if (cells.length === 0) return
      const firstText = cleanText(cells[0].textContent ?? "")
      const dateMatch = new RegExp(`(\\d{1,2})\\s+(${monthNames.join("|")})`, "i").exec(firstText)
      if (/\bto\b/i.test(firstText) && /notified of dates|oral|performance/i.test(cleanText(row.textContent ?? ""))) {
        appointmentWindows.push(cleanText(row.textContent ?? ""))
        return
      }
      let contentCells = cells
      if (dateMatch) {
        const day = Number(dateMatch[1])
        const month = monthNames.findIndex((name) => name.toLowerCase() === dateMatch[2].toLowerCase())
        carriedDate = { month, day, date: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }
        contentCells = cells.slice(1)
      }
      if (!carriedDate) return
      const currentDate = carriedDate
      contentCells.forEach((cell) => {
        const paragraphs = Array.from(cell.querySelectorAll("p")).map((paragraph) => cleanText(paragraph.textContent ?? "")).filter(Boolean)
        exams.push(...parseExamCell({ year, ...currentDate, paragraphs, cellText: cleanText(cell.textContent ?? "") }))
      })
    })
  })

  return { year, exams, appointmentWindows: [...new Set(appointmentWindows)] }
}

export function parseVcaaExamTimetableHtml(html: string): VcaaExamParseResult {
  const document = new DOMParser().parseFromString(html, "text/html")
  if (document.querySelector("parsererror")) throw new Error("The VCAA timetable response was not valid HTML.")
  return parseVcaaExamDocument(document)
}

export async function fetchVcaaExamTimetable(subjects: Subject[]): Promise<VcaaExamParseResult> {
  const response = await invoke<FetchVcaaResponse>("fetch_vcaa_exam_timetable")
  if (response.url !== VCAA_TIMETABLE_URL) throw new Error("Unexpected VCAA timetable source.")
  const parsed = parseVcaaExamTimetableHtml(response.html)
  return {
    ...parsed,
    exams: parsed.exams.map((exam) => ({ ...exam, subjectId: exam.isGat ? undefined : matchVcaaSubject(exam.title, subjects) })),
  }
}

export function vcaaCandidateToEvent(candidate: VcaaExamCandidate): Omit<CalendarEvent, "id" | "created_at"> {
  return {
    title: candidate.title,
    startTime: candidate.startTime,
    endTime: candidate.endTime,
    eventType: "exam",
    subjectId: candidate.subjectId,
    source: { type: "vcaa", id: candidate.sourceId, year: candidate.year, url: VCAA_TIMETABLE_URL },
  }
}
