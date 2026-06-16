import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { LucideIcon } from "lucide-react"
import {
  Atom,
  BookOpen,
  BookText,
  Brain,
  BriefcaseBusiness,
  Calculator,
  ChartNoAxesColumn,
  Dna,
  Dumbbell,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Sigma,
  Tag,
  TrendingUp,
} from "lucide-react"
import type { Project, DeadlineType, EventType, StudySession, Subject, CalendarEvent } from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"

export function generateId(): string {
  const webCrypto: Crypto | undefined = typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto
  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID()
  }
  if (webCrypto) {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // ponytail: Math.random fallback is only for runtimes without Web Crypto; sync migration upgrades legacy ids before upload.
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Safe normalization helpers (used by persistence hooks)
// ---------------------------------------------------------------------------

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return (error as { message: string }).message
  }
  return String(error)
}

export function safeString(obj: Record<string, unknown>, key: string, fallback: string): string {
  const val = obj[key]
  return typeof val === "string" ? val : fallback
}

export function safeStringOpt(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key]
  return typeof val === "string" ? val : undefined
}

export function safeBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const val = obj[key]
  return typeof val === "boolean" ? val : fallback
}

export function safeBoolOpt(obj: Record<string, unknown>, key: string): boolean | undefined {
  const val = obj[key]
  return typeof val === "boolean" ? val : undefined
}

export function safeDateMeta(obj: Record<string, unknown>): { created_at: string; updated_at: string; deleted_at: string | null; last_modified_device_id: string | null } {
  const created_at = typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString()
  return {
    created_at,
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : created_at,
    deleted_at: typeof obj.deleted_at === "string" ? obj.deleted_at : null,
    last_modified_device_id: typeof obj.last_modified_device_id === "string" ? obj.last_modified_device_id : null,
  }
}

export function parseNotionSource(value: unknown): CalendarEvent["source"] | StudySession["source"] {
  if (typeof value !== "object" || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.type !== "notion" || typeof record.id !== "string") return undefined
  return {
    type: "notion",
    id: record.id,
    url: typeof record.url === "string" ? record.url : undefined,
    lastEditedTime: typeof record.lastEditedTime === "string" ? record.lastEditedTime : undefined,
    kind: record.kind === "event" || record.kind === "session" ? record.kind : undefined,
    bodyHash: typeof record.bodyHash === "string" ? record.bodyHash : undefined,
  }
}

export function safeStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const val = obj[key]
  return Array.isArray(val) ? val.filter((v): v is string => typeof v === "string") : undefined
}

let _customSubjectsCache: Subject[] | null = null
let _customSubjectsCacheRaw: string | null = null

function getCustomSubjectsFromStorage(): Subject[] {
  if (typeof window === "undefined") return []
  const raw = localStorage.getItem("focal-custom-subjects")
  if (raw === _customSubjectsCacheRaw && _customSubjectsCache) return _customSubjectsCache
  _customSubjectsCacheRaw = raw
  if (!raw) { _customSubjectsCache = []; return _customSubjectsCache }
  try {
    const parsed: unknown = JSON.parse(raw)
    _customSubjectsCache = Array.isArray(parsed) ? parsed.filter(isSubject) : []
  } catch {
    _customSubjectsCache = []
  }
  return _customSubjectsCache
}

/** Cache for getSubjectById to avoid repeated lookups across the app. */
const _subjectByIdCache = new Map<string, Subject | undefined>()

/** Busts the subject ID cache when custom subjects may have changed. */
export function bustSubjectCache() {
  _subjectByIdCache.clear()
  _customSubjectsCache = null
  _customSubjectsCacheRaw = null
}

function isSubject(value: unknown): value is Subject {
  return (
    typeof value === "object" && value !== null &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).name === "string" &&
    typeof (value as Record<string, unknown>).shortCode === "string" &&
    typeof (value as Record<string, unknown>).color === "string"
  )
}

export function getSubjectById(id?: string): Subject | undefined {
  if (!id) return undefined
  const cached = _subjectByIdCache.get(id)
  if (cached !== undefined || _subjectByIdCache.has(id)) return cached
  const builtin = VCE_SUBJECTS.find((s) => s.id === id)
  if (builtin) {
    _subjectByIdCache.set(id, builtin)
    return builtin
  }
  const custom = getCustomSubjectsFromStorage().find((s) => s.id === id)
  _subjectByIdCache.set(id, custom)
  return custom
}

/**
 * Lucide icon map for every supported VCE subject. Mirrors and extends the
 * project-icon map so a single helper covers both project headers and other
 * subject chips/badges. Custom subjects fall back to a generic tag icon so
 * they look the same regardless of which lucide icon they might later map to.
 */
export const SUBJECT_ICONS: Record<string, LucideIcon> = {
  eng: BookOpen,
  "eng-lang": Languages,
  lit: BookText,
  mm: Calculator,
  sm: Sigma,
  gm: ChartNoAxesColumn,
  csl: Languages,
  pe: Dumbbell,
  chem: FlaskConical,
  phys: Atom,
  bio: Dna,
  psych: Brain,
  hist: Landmark,
  geo: Globe,
  econ: TrendingUp,
  bm: BriefcaseBusiness,
}

/** Generic lucide icon used when no subject is provided or id is unknown. */
const SUBJECT_ICON_FALLBACK: LucideIcon = Tag

/** Look up the lucide icon for a subject by id. Falls back to Tag for
 *  unmapped/custom subjects; never throws. */
export function getSubjectIcon(subjectId?: string): LucideIcon {
  if (!subjectId) return SUBJECT_ICON_FALLBACK
  return SUBJECT_ICONS[subjectId] ?? SUBJECT_ICON_FALLBACK
}

export function getDeadlineTypeInfo(type?: DeadlineType): { icon: string; label: string; color: string } {
  switch (type) {
    case "sac":
      return { icon: "📝", label: "SAC", color: "#EA580C" }
    case "exam":
      return { icon: "📅", label: "Exam", color: "#DC2626" }
    case "assignment":
      return { icon: "📋", label: "Assignment", color: "#2563EB" }
    default:
      return { icon: "📌", label: "Deadline", color: "#6B7280" }
  }
}

export function getEventTypeInfo(type?: EventType): { icon: string; label: string; color: string } {
  if (type === "event") {
    return { icon: "📍", label: "Event", color: "#0D9488" }
  }
  if (type === "homework") {
    return { icon: "📚", label: "Homework", color: "#2563EB" }
  }
  if (type === "practice-sac") {
    return { icon: "🧪", label: "Practice SAC", color: "#7C3AED" }
  }
  if (type === "other") {
    return { icon: "📌", label: "Other", color: "#6B7280" }
  }
  return getDeadlineTypeInfo(type)
}

export function getSessionSubjectIds(session: StudySession, project?: Project): string[] {
  if (session.subjectIds.length > 0) return session.subjectIds
  return project?.subjectId ? [project.subjectId] : []
}

export function getSessionEffectiveMinutes(session: StudySession): number {
  if (session.activeDurations && session.activeDurations.length > 0) {
    const total = session.activeDurations.reduce((sum, d) => {
      return sum + Math.max(0, new Date(d.end).getTime() - new Date(d.start).getTime())
    }, 0)
    return Math.round(total / 60000)
  }
  const start = new Date(session.startTime).getTime()
  const end = new Date(session.endTime).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0
  return Math.round((end - start) / 60000)
}

export function formatDeadline(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (days < 0) return "Overdue"
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days <= 7) return `${days} days`
  return date.toLocaleDateString()
}

export function isOverdue(dateString: string): boolean {
  const date = new Date(dateString)
  const now = new Date()
  return date.getTime() < now.getTime()
}

const DEADLINE_TYPE_PRIORITY: Record<DeadlineType, number> = {
  sac: 1,
  exam: 2,
  assignment: 3,
}

export function sortProjectsByDeadline(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const now = Date.now()

    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1

    const dateA = new Date(a.deadline).getTime()
    const dateB = new Date(b.deadline).getTime()

    const aOverdue = dateA < now
    const bOverdue = dateB < now

    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1

    const typeA = a.deadlineType ? DEADLINE_TYPE_PRIORITY[a.deadlineType] ?? 4 : 4
    const typeB = b.deadlineType ? DEADLINE_TYPE_PRIORITY[b.deadlineType] ?? 4 : 4

    if (typeA !== typeB) return typeA - typeB

    return dateA - dateB
  })
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function sanitiseFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim()
}

export function getLocalDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function combineDateAndTime(dateValue: string, timeValue: string): Date | null {
  const dateParts = dateValue.split("-").map(Number)
  const timeParts = timeValue.split(":").map(Number)
  if (dateParts.length !== 3 || timeParts.length < 2) return null

  const [year, month, day] = dateParts
  const [hours, minutes] = timeParts
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return time24
  const period = h >= 12 ? "PM" : "AM"
  const displayH = h % 12 === 0 ? 12 : h % 12
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`
}

/**
 * Format a 24h time string ("HH:mm") using either 12h or 24h display.
 */
export function formatTime(time24: string, use24Hour: boolean): string {
  if (use24Hour) return time24
  return formatTime12(time24)
}
