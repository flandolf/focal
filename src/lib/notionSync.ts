import { invoke } from "@tauri-apps/api/core"
import type { CalendarEvent, EventType, StudySession, Subject } from "@/lib/types"
import type { NotionCalendarSettings } from "@/lib/settings"

// ---------------------------------------------------------------------------
// Schema cache
// ---------------------------------------------------------------------------

const SCHEMA_CACHE_PREFIX = "focal-notion-schema"

function getCachedSchema(dataSourceId: string): Record<string, NotionProperty> | null {
  try {
    const raw = localStorage.getItem(`${SCHEMA_CACHE_PREFIX}:${dataSourceId}`)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed as Record<string, NotionProperty> : null
  } catch {
    return null
  }
}

function setCachedSchema(dataSourceId: string, schema: Record<string, NotionProperty>): void {
  localStorage.setItem(`${SCHEMA_CACHE_PREFIX}:${dataSourceId}`, JSON.stringify(schema))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotionProperty = Record<string, unknown>

interface NotionPage {
  id: string
  url?: string
  last_edited_time?: string
  properties?: Record<string, NotionProperty>
}

interface NotionQueryError {
  code: string
  message: string
}

interface NotionQueryResponse {
  data?: unknown[] | null
  error?: NotionQueryError | null
}

interface NotionPageResponse {
  data?: Record<string, unknown> | null
  error?: NotionQueryError | null
}

export interface NotionCalendarSyncResult {
  created: Omit<CalendarEvent, "id" | "created_at">[]
  updated: {
    id: string
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
  }[]
  createdSessions: Omit<StudySession, "id" | "created_at">[]
  updatedSessions: {
    id: string
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  }[]
  skipped: number
  skippedReasons: string[]
  pushedCreated: number
  pushedUpdated: number
  conflicts: number
  conflictDetails: string[]
  pushErrors: string[]
  deleted: number
}

type EventUpdates = Partial<Omit<CalendarEvent, "id" | "created_at">>
type SessionUpdates = Partial<Omit<StudySession, "id" | "created_at">>

interface PushTask {
  run: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getRichTextPlainText(items: unknown): string | undefined {
  if (!Array.isArray(items)) return undefined
  const text = items
    .map((item) => (isRecord(item) && typeof item.plain_text === "string" ? item.plain_text : ""))
    .join("")
    .trim()
  return text || undefined
}

function getPropertyText(property: NotionProperty | undefined): string | undefined {
  if (!property) return undefined
  const type = typeof property.type === "string" ? property.type : undefined
  if (type === "title") return getRichTextPlainText(property.title)
  if (type === "rich_text") return getRichTextPlainText(property.rich_text)
  if (type === "select" && isRecord(property.select) && typeof property.select.name === "string") return property.select.name
  if (type === "status" && isRecord(property.status) && typeof property.status.name === "string") return property.status.name
  if (type === "multi_select" && Array.isArray(property.multi_select)) {
    const labels = property.multi_select
      .map((item) => (isRecord(item) && typeof item.name === "string" ? item.name : ""))
      .filter(Boolean)
    return labels.length > 0 ? labels.join(", ") : undefined
  }
  if (type === "url" && typeof property.url === "string") return property.url
  if (type === "email" && typeof property.email === "string") return property.email
  if (type === "phone_number" && typeof property.phone_number === "string") return property.phone_number
  if (type === "formula" && isRecord(property.formula)) {
    if (typeof property.formula.string === "string") return property.formula.string
    if (typeof property.formula.number === "number") return String(property.formula.number)
    if (typeof property.formula.boolean === "boolean") return property.formula.boolean ? "Yes" : "No"
  }
  return undefined
}

function getPropertyTexts(property: NotionProperty | undefined): string[] {
  const text = getPropertyText(property)
  if (!text) return []
  return text.split(",").map((item) => item.trim()).filter(Boolean)
}

function getPropertyBoolean(property: NotionProperty | undefined): boolean | undefined {
  if (!property) return undefined
  if (property.type === "checkbox" && typeof property.checkbox === "boolean") return property.checkbox
  if (property.type === "formula" && isRecord(property.formula) && typeof property.formula.boolean === "boolean") {
    return property.formula.boolean
  }
  if (property.type === "rollup" && isRecord(property.rollup)) {
    if (property.rollup.type === "boolean" && typeof property.rollup.boolean === "boolean") {
      return property.rollup.boolean
    }
    if (property.rollup.type === "array" && Array.isArray(property.rollup.array)) {
      const values = property.rollup.array
        .map((item) => getPropertyBoolean(isRecord(item) ? item : undefined))
        .filter((item): item is boolean => typeof item === "boolean")
      if (values.length > 0) return values.some(Boolean)
    }
  }
  return undefined
}

function getDateFromValue(value: unknown): { start?: string; end?: string } {
  if (typeof value === "string") return { start: value }
  if (!isRecord(value)) return {}
  return {
    start: typeof value.start === "string" ? value.start : undefined,
    end: typeof value.end === "string" ? value.end : undefined,
  }
}

function getPropertyDate(property: NotionProperty | undefined): { start?: string; end?: string } {
  if (!property) return {}
  if (property.type === "date") return getDateFromValue(property.date)
  if (property.type === "created_time" && typeof property.created_time === "string") {
    return { start: property.created_time }
  }
  if (property.type === "last_edited_time" && typeof property.last_edited_time === "string") {
    return { start: property.last_edited_time }
  }
  if (property.type === "formula" && isRecord(property.formula)) {
    if (property.formula.type === "date") return getDateFromValue(property.formula.date)
    if (property.formula.type === "string" && typeof property.formula.string === "string") {
      return { start: property.formula.string }
    }
  }
  if (property.type === "rollup" && isRecord(property.rollup)) {
    if (property.rollup.type === "date") return getDateFromValue(property.rollup.date)
    if (property.rollup.type === "array" && Array.isArray(property.rollup.array)) {
      const dates = property.rollup.array
        .map((item) => getPropertyDate(isRecord(item) ? item : undefined))
        .filter((date) => date.start)
      return dates[0] ?? {}
    }
  }
  return {}
}

function hasEmptyDateValue(property: NotionProperty | undefined): boolean {
  if (!property) return false
  if (property.type === "date") return property.date == null
  if (property.type === "formula" && isRecord(property.formula)) {
    return property.formula.type === "date" && property.formula.date == null
  }
  if (property.type === "rollup" && isRecord(property.rollup)) {
    return property.rollup.type === "date" && property.rollup.date == null
  }
  return false
}

function findProperty(properties: Record<string, NotionProperty>, name: string): NotionProperty | undefined {
  const trimmed = name.trim()
  if (!trimmed) return undefined
  if (properties[trimmed]) return properties[trimmed]
  const normalized = trimmed.toLowerCase()
  const match = Object.entries(properties).find(([key]) => key.trim().toLowerCase() === normalized)
  return match?.[1]
}

function findFirstDateProperty(properties: Record<string, NotionProperty>): {
  property?: NotionProperty
  name?: string
} {
  for (const [name, property] of Object.entries(properties)) {
    if (getPropertyDate(property).start) return { property, name }
  }
  return {}
}

function getConfiguredDate(
  properties: Record<string, NotionProperty>,
  datePropertyName: string,
): { date: { start?: string; end?: string }; propertyName?: string; usedFallback: boolean } {
  const configuredProperty = findProperty(properties, datePropertyName)
  const configuredDate = getPropertyDate(configuredProperty)
  if (configuredDate.start) {
    return { date: configuredDate, propertyName: datePropertyName.trim(), usedFallback: false }
  }

  const fallback = findFirstDateProperty(properties)
  return {
    date: getPropertyDate(fallback.property),
    propertyName: fallback.name,
    usedFallback: Boolean(fallback.property),
  }
}

function getPropertyType(property: NotionProperty | undefined): string {
  return typeof property?.type === "string" ? property.type : "missing"
}

function getAvailablePropertySummary(properties: Record<string, NotionProperty>): string {
  return Object.entries(properties)
    .map(([name, property]) => `${name} (${getPropertyType(property)})`)
    .slice(0, 8)
    .join(", ")
}

function getPageTitle(properties: Record<string, NotionProperty>, titlePropertyName: string): string {
  const configuredTitle = getPropertyText(findProperty(properties, titlePropertyName))
  if (configuredTitle) return configuredTitle

  const titleProperty = Object.values(properties).find((property) => property.type === "title")
  return getPropertyText(titleProperty) ?? "Untitled Notion Event"
}

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  const date = dateOnly ? new Date(`${trimmed}T00:00:00`) : new Date(trimmed)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function sameInstant(a: string | undefined, b: string | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  const aTime = new Date(a).getTime()
  const bTime = new Date(b).getTime()
  return Number.isFinite(aTime) && Number.isFinite(bTime) && aTime === bTime
}

function normaliseToken(value: string | undefined): string {
  return value?.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "") ?? ""
}

// ---------------------------------------------------------------------------
// Subject matching
// ---------------------------------------------------------------------------

function getSubjectAliases(subject: Subject): string[] {
  const base = [
    subject.id,
    subject.name,
    subject.shortCode,
    subject.name.replace(/\b(and|&)\b/gi, ""),
  ]
  const aliases: Record<string, string[]> = {
    mm: ["methods", "math methods", "maths methods", "mathematical methods"],
    sm: ["specialist", "specialist math", "specialist maths", "specialist mathematics"],
    gm: ["general", "general math", "general maths", "general mathematics"],
    eng: ["english"],
    "eng-lang": ["english language", "eng lang", "el"],
    csl: ["chinese", "chinese sl", "chinese second language"],
    pe: ["physical education", "phys ed", "sport"],
    bm: ["business", "business management"],
    bio: ["biology"],
    chem: ["chemistry"],
    phys: ["physics"],
    psych: ["psychology"],
    hist: ["history"],
    geo: ["geography"],
    econ: ["economics"],
    lit: ["literature"],
  }
  return [...base, ...(aliases[subject.id] ?? [])]
}

function findSubjectIdFromText(value: string | undefined, subjects: Subject[]): string | undefined {
  if (!value) return undefined
  const normalized = normaliseToken(value)
  if (!normalized) return undefined

  const exact = subjects.find((subject) => (
    getSubjectAliases(subject).some((alias) => normaliseToken(alias) === normalized)
  ))
  if (exact) return exact.id

  return subjects.find((subject) => (
    getSubjectAliases(subject).some((alias) => {
      const normalizedAlias = normaliseToken(alias)
      return normalizedAlias.length >= 3 && normalized.includes(normalizedAlias)
    })
  ))?.id
}

function findSubjectIdFromValues(values: string[], subjects: Subject[]): string | undefined {
  for (const value of values) {
    const subjectId = findSubjectIdFromText(value, subjects)
    if (subjectId) return subjectId
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

function toEventType(value: string | undefined): EventType {
  const normalized = normaliseToken(value)
  if (normalized === "sac") return "sac"
  if (normalized === "exam") return "exam"
  if (normalized === "homework") return "homework"
  if (normalized === "other") return "other"
  if (normalized === "practicesac" || normalized === "practiceassessment" || normalized === "practicetest") {
    return "practice-sac"
  }
  if (normalized === "assignment" || normalized === "assessment") return "assignment"
  return "other"
}

function toNotionType(value: EventType): string {
  switch (value) {
    case "homework":
    case "assignment":
      return "Homework"
    case "sac":
      return "SAC"
    case "exam":
      return "Exam"
    case "practice-sac":
      return "Practice SAC"
    case "other":
    case "event":
    default:
      return "Other"
  }
}

function isSessionType(value: string | undefined): boolean {
  return normaliseToken(value).includes("session")
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

function normalisePage(value: unknown): NotionPage | null {
  if (!isRecord(value) || typeof value.id !== "string") return null
  return {
    id: value.id,
    url: typeof value.url === "string" ? value.url : undefined,
    last_edited_time: typeof value.last_edited_time === "string" ? value.last_edited_time : undefined,
    properties: isRecord(value.properties) ? value.properties as Record<string, NotionProperty> : undefined,
  }
}

function getPageKind(properties: Record<string, NotionProperty>, settings: NotionCalendarSettings): "event" | "session" {
  const typeValue = settings.typeProperty ? getPropertyText(findProperty(properties, settings.typeProperty)) : undefined
  return isSessionType(typeValue) ? "session" : "event"
}

function getNotionSource(page: NotionPage, kind: "event" | "session", bodyHash?: string): NonNullable<CalendarEvent["source"]> {
  const source: NonNullable<CalendarEvent["source"]> = {
    type: "notion",
    id: page.id,
    url: page.url,
    lastEditedTime: page.last_edited_time,
    kind,
  }
  if (bodyHash !== undefined) source.bodyHash = bodyHash
  return source
}

// ---------------------------------------------------------------------------
// Property extraction for date / type / subject / completed
// ---------------------------------------------------------------------------

function getPropertyDateForEvent(
  properties: Record<string, NotionProperty>,
  settings: NotionCalendarSettings,
): {
  startTime?: string
  endTime?: string
  skippedReason?: string
} {
  const configuredProperty = findProperty(properties, settings.dateProperty)
  const { date, propertyName, usedFallback } = getConfiguredDate(properties, settings.dateProperty)
  const startTime = toIsoDate(date.start)
  if (startTime) {
    return {
      startTime,
      endTime: toIsoDate(date.end),
      skippedReason: usedFallback && propertyName
        ? `Used "${propertyName}" because "${settings.dateProperty}" was ${getPropertyType(configuredProperty)}`
        : undefined,
    }
  }

  const available = getAvailablePropertySummary(properties)
  return {
    skippedReason: configuredProperty
      ? hasEmptyDateValue(configuredProperty)
        ? `"${settings.dateProperty}" is empty on skipped Notion rows`
        : `"${settings.dateProperty}" is ${getPropertyType(configuredProperty)} but has no parseable date`
      : `"${settings.dateProperty}" was not found${available ? `. Available: ${available}` : ""}`,
  }
}

function getEventSubjectId(
  properties: Record<string, NotionProperty>,
  title: string,
  settings: NotionCalendarSettings,
  subjects: Subject[],
): string | undefined {
  return findSubjectIdFromValues([
    ...(settings.subjectProperty ? getPropertyTexts(findProperty(properties, settings.subjectProperty)) : []),
    title,
  ], subjects)
}

function getEventTypeFromPage(
  properties: Record<string, NotionProperty>,
  settings: NotionCalendarSettings,
): EventType {
  return settings.typeProperty ? toEventType(getPropertyText(findProperty(properties, settings.typeProperty))) : "event"
}

function isCompleted(properties: Record<string, NotionProperty>, settings: NotionCalendarSettings): boolean {
  return Boolean(getPropertyBoolean(findProperty(properties, settings.completedProperty)))
}

// ---------------------------------------------------------------------------
// Page ↔ item matching
// ---------------------------------------------------------------------------

function pageMatchesEvent(
  page: NotionPage,
  event: CalendarEvent,
  settings: NotionCalendarSettings,
  subjects: Subject[],
): boolean {
  const properties = page.properties ?? {}
  const title = getPageTitle(properties, settings.titleProperty)
  const { startTime, endTime } = getPropertyDateForEvent(properties, settings)

  return (
    title === event.title &&
    sameInstant(startTime, event.startTime) &&
    sameInstant(endTime, event.endTime) &&
    getEventTypeFromPage(properties, settings) === event.eventType &&
    getEventSubjectId(properties, title, settings, subjects) === event.subjectId &&
    isCompleted(properties, settings) === Boolean(event.isFinished)
  )
}

function pageMatchesSession(
  page: NotionPage,
  session: StudySession,
  settings: NotionCalendarSettings,
  subjects: Subject[],
): boolean {
  const properties = page.properties ?? {}
  const title = getPageTitle(properties, settings.titleProperty)
  const { startTime, endTime } = getPropertyDateForEvent(properties, settings)
  const subjectId = getEventSubjectId(properties, title, settings, subjects)
  const subjectMatches = subjectId ? session.subjectIds.includes(subjectId) : session.subjectIds.length === 0

  return (
    title === session.title &&
    sameInstant(startTime, session.startTime) &&
    sameInstant(endTime, session.endTime) &&
    subjectMatches &&
    isCompleted(properties, settings) === (session.status === "completed")
  )
}

function toEventFromPage(
  page: NotionPage,
  settings: NotionCalendarSettings,
  subjects: Subject[],
): Omit<CalendarEvent, "id" | "created_at"> {
  const properties = page.properties ?? {}
  const title = getPageTitle(properties, settings.titleProperty)
  const { startTime, endTime } = getPropertyDateForEvent(properties, settings)

  return {
    title,
    startTime: startTime!,
    endTime,
    eventType: getEventTypeFromPage(properties, settings),
    subjectId: getEventSubjectId(properties, title, settings, subjects),
    isFinished: isCompleted(properties, settings),
    source: getNotionSource(page, "event"),
  }
}

function toSessionFromPage(
  page: NotionPage,
  settings: NotionCalendarSettings,
  subjects: Subject[],
): Omit<StudySession, "id" | "created_at"> | null {
  const properties = page.properties ?? {}
  const title = getPageTitle(properties, settings.titleProperty)
  const { startTime, endTime } = getPropertyDateForEvent(properties, settings)
  if (!startTime) return null

  const completed = isCompleted(properties, settings)
  return {
    projectId: undefined,
    subjectIds: getEventSubjectId(properties, title, settings, subjects)
      ? [getEventSubjectId(properties, title, settings, subjects)!]
      : [],
    title,
    startTime,
    endTime: endTime ?? startTime,
    status: completed ? "completed" : "planned",
    topics: undefined,
    notes: undefined,
    confidence: undefined,
    blockers: undefined,
    nextAction: undefined,
    completedAt: completed ? (page.last_edited_time ?? new Date().toISOString()) : undefined,
    source: getNotionSource(page, "session"),
  }
}

// ---------------------------------------------------------------------------
// Notion property building (for push)
// ---------------------------------------------------------------------------

function richTextValue(value: string): unknown[] {
  return [{ type: "text", text: { content: value } }]
}

function createTextProperty(propertyType: string | undefined, value: string | undefined): unknown {
  if (!value) return undefined
  if (propertyType === "select") return { select: { name: value } }
  if (propertyType === "multi_select") return { multi_select: [{ name: value }] }
  if (propertyType === "status") return { status: { name: value } }
  if (propertyType === "url") return { url: value }
  if (propertyType === "email") return { email: value }
  if (propertyType === "phone_number") return { phone_number: value }
  return { rich_text: richTextValue(value) }
}

function createPropertyValue(propertyType: string | undefined, value: string | boolean | undefined): unknown {
  if (typeof value === "boolean") {
    return propertyType === "checkbox" ? { checkbox: value } : undefined
  }
  return createTextProperty(propertyType, value)
}

function getSchemaPropertyType(
  schema: Record<string, NotionProperty>,
  propertyName: string,
  fallback: string,
): string {
  const found = findProperty(schema, propertyName)
  return getPropertyType(found) === "missing" ? fallback : getPropertyType(found)
}

function buildPageChildren(description: string | undefined): unknown[] | undefined {
  const text = description?.trim()
  if (!text) return undefined
  return [
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: richTextValue(text),
      },
    },
  ]
}

function buildNotionEventProperties(
  settings: NotionCalendarSettings,
  event: CalendarEvent,
  subjects: Subject[],
  schema: Record<string, NotionProperty>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [settings.titleProperty]: { title: richTextValue(event.title) },
    [settings.dateProperty]: {
      date: {
        start: event.startTime,
        end: event.endTime,
      },
    },
  }

  if (settings.typeProperty.trim()) {
    const pt = getSchemaPropertyType(schema, settings.typeProperty, "select")
    const prop = createPropertyValue(pt, toNotionType(event.eventType))
    if (prop) properties[settings.typeProperty] = prop
  }

  if (settings.completedProperty.trim()) {
    const pt = getSchemaPropertyType(schema, settings.completedProperty, "checkbox")
    const prop = createPropertyValue(pt, event.isFinished ?? false)
    if (prop) properties[settings.completedProperty] = prop
  }

  if (settings.subjectProperty.trim()) {
    const subject = subjects.find((c) => c.id === event.subjectId)
    const pt = getSchemaPropertyType(schema, settings.subjectProperty, "select")
    const prop = createTextProperty(pt, subject?.name)
    if (prop) properties[settings.subjectProperty] = prop
  }

  return properties
}

function buildNotionSessionProperties(
  settings: NotionCalendarSettings,
  session: StudySession,
  subjects: Subject[],
  schema: Record<string, NotionProperty>,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    [settings.titleProperty]: { title: richTextValue(session.title) },
    [settings.dateProperty]: {
      date: {
        start: session.startTime,
        end: session.endTime,
      },
    },
  }

  if (settings.typeProperty.trim()) {
    const pt = getSchemaPropertyType(schema, settings.typeProperty, "select")
    const prop = createPropertyValue(pt, "Study Session")
    if (prop) properties[settings.typeProperty] = prop
  }

  if (settings.completedProperty.trim()) {
    const pt = getSchemaPropertyType(schema, settings.completedProperty, "checkbox")
    const prop = createPropertyValue(pt, session.status === "completed" || Boolean(session.completedAt))
    if (prop) properties[settings.completedProperty] = prop
  }

  if (settings.subjectProperty.trim()) {
    const subject = subjects.find((c) => session.subjectIds.includes(c.id))
    const pt = getSchemaPropertyType(schema, settings.subjectProperty, "select")
    const prop = createPropertyValue(pt, subject?.name)
    if (prop) properties[settings.subjectProperty] = prop
  }

  return properties
}

// ---------------------------------------------------------------------------
// Body hash (for detecting description changes)
// ---------------------------------------------------------------------------

function hashBody(text: string | undefined): string | undefined {
  const s = text?.trim()
  if (!s) return undefined
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i)
    hash |= 0
  }
  return hash.toString(36)
}

function bodyHasChanged(storedHash: string | undefined, text: string | undefined): boolean {
  return hashBody(text) !== storedHash
}

// ---------------------------------------------------------------------------
// Notion API wrappers
// ---------------------------------------------------------------------------

function isNotionQueryError(value: unknown): value is NotionQueryError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  )
}

function isNotionQueryResponse(value: unknown): value is NotionQueryResponse {
  return (
    isRecord(value) &&
    (value.data == null || Array.isArray(value.data)) &&
    (value.error == null || isNotionQueryError(value.error))
  )
}

function isNotionPageResponse(value: unknown): value is NotionPageResponse {
  return (
    isRecord(value) &&
    (value.data == null || isRecord(value.data)) &&
    (value.error == null || isNotionQueryError(value.error))
  )
}

async function createNotionPage(
  settings: NotionCalendarSettings,
  properties: Record<string, unknown>,
  children?: unknown[],
): Promise<NotionPage> {
  const response = await invoke<unknown>("create_notion_calendar_page", {
    token: settings.token,
    dataSourceId: settings.dataSourceId,
    properties,
    children,
  })
  if (!isNotionPageResponse(response)) throw new Error("Invalid Notion create response")
  if (response.error) throw new Error(response.error.message)
  const page = normalisePage(response.data)
  if (!page) throw new Error("Notion create response missing page")
  return page
}

async function updateNotionPage(
  settings: NotionCalendarSettings,
  pageId: string,
  properties: Record<string, unknown>,
  children?: unknown[],
): Promise<NotionPage> {
  const response = await invoke<unknown>("update_notion_calendar_page", {
    token: settings.token,
    pageId,
    properties,
    children,
  })
  if (!isNotionPageResponse(response)) throw new Error("Invalid Notion update response")
  if (response.error) throw new Error(response.error.message)
  const page = normalisePage(response.data)
  if (!page) throw new Error("Notion update response missing page")
  return page
}

async function deleteNotionPage(
  settings: NotionCalendarSettings,
  pageId: string,
): Promise<void> {
  const response = await invoke<unknown>("delete_notion_page", {
    token: settings.token,
    pageId,
  })
  if (!isNotionPageResponse(response)) throw new Error("Invalid Notion delete response")
  if (response.error) throw new Error(response.error.message)
}

async function queryNotionCalendar(settings: NotionCalendarSettings): Promise<NotionPage[]> {
  const response = await invoke<unknown>("query_notion_calendar", {
    token: settings.token,
    dataSourceId: settings.dataSourceId,
  })
  if (!isNotionQueryResponse(response)) {
    throw new Error("Invalid Notion sync response")
  }
  if (response.error) {
    throw new Error(response.error.message)
  }
  return (response.data ?? []).map(normalisePage).filter((page): page is NotionPage => page !== null)
}

// ---------------------------------------------------------------------------
// Push helpers: retry, concurrency
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_API_CALLS = 4
const MAX_RETRIES = 2

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  pushErrors: string[],
): Promise<T | undefined> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt === MAX_RETRIES) {
        pushErrors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
        return undefined
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
}

async function executePushTasks(tasks: PushTask[]): Promise<void> {
  if (tasks.length === 0) return
  const queue = [...tasks]
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_API_CALLS, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift()
      if (task) await task.run()
    }
  })
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------
// Fingerprinting (for duplicate-page prevention)
// ---------------------------------------------------------------------------

function eventFingerprint(e: CalendarEvent | Omit<CalendarEvent, "id" | "created_at">): string {
  return [
    e.title,
    e.startTime,
    e.endTime ?? "",
    e.eventType,
    e.subjectId ?? "",
    e.isFinished ? "1" : "0",
  ].join("|")
}

function sessionFingerprint(s: StudySession | Omit<StudySession, "id" | "created_at">): string {
  return [
    s.title,
    s.startTime,
    s.endTime,
    (s.subjectIds ?? []).sort().join(","),
    s.status,
  ].join("|")
}

// ---------------------------------------------------------------------------
// Sync state context
// ---------------------------------------------------------------------------

interface SyncCtx {
  created: NotionCalendarSyncResult["created"]
  createdSessions: NotionCalendarSyncResult["createdSessions"]
  updatedEvents: Map<string, EventUpdates>
  updatedSessions: Map<string, SessionUpdates>
  matchedEventIds: Set<string>
  matchedSessionIds: Set<string>
  blockedEventFingerprints: Set<string>
  blockedSessionFingerprints: Set<string>
  skipped: number
  skippedReasons: string[]
  pushedCreated: number
  pushedUpdated: number
  deleted: number
  conflicts: number
  conflictDetails: string[]
  pushErrors: string[]
  newNotionIds: Set<string>
}

function createSyncCtx(): SyncCtx {
  return {
    created: [],
    createdSessions: [],
    updatedEvents: new Map(),
    updatedSessions: new Map(),
    matchedEventIds: new Set(),
    matchedSessionIds: new Set(),
    blockedEventFingerprints: new Set(),
    blockedSessionFingerprints: new Set(),
    skipped: 0,
    skippedReasons: [],
    pushedCreated: 0,
    pushedUpdated: 0,
    deleted: 0,
    conflicts: 0,
    conflictDetails: [],
    pushErrors: [],
    newNotionIds: new Set(),
  }
}

// ---------------------------------------------------------------------------
// Phase 1: Pull — Notion pages → Focal events/sessions
// ---------------------------------------------------------------------------

function recordSkippedReason(ctx: SyncCtx, reason: string | undefined): void {
  if (reason && !ctx.skippedReasons.includes(reason) && ctx.skippedReasons.length < 3) {
    ctx.skippedReasons.push(reason)
  }
}

function pullFromNotion(
  pages: NotionPage[],
  existingEvents: CalendarEvent[],
  existingSessions: StudySession[],
  settings: NotionCalendarSettings,
  subjects: Subject[],
  ctx: SyncCtx,
): void {
  const eventBySourceId = new Map<string, CalendarEvent>(
    existingEvents
      .filter((e) => e.source?.type === "notion" && e.source.kind !== "session")
      .map((e) => [e.source!.id, e]),
  )
  const sessionBySourceId = new Map<string, StudySession>(
    existingSessions
      .filter((s) => s.source?.type === "notion" && s.source.kind !== "event")
      .map((s) => [s.source!.id, s]),
  )

  for (const page of pages) {
    const properties = page.properties ?? {}
    const kind = getPageKind(properties, settings)
    const title = getPageTitle(properties, settings.titleProperty)
    const { startTime, endTime, skippedReason } = getPropertyDateForEvent(properties, settings)

    if (!startTime) {
      ctx.skipped += 1
      recordSkippedReason(ctx, skippedReason)
      continue
    }
    recordSkippedReason(ctx, skippedReason)

    if (kind === "session") {
      pullSession(page, title, startTime, endTime, properties, existingSessions, sessionBySourceId, settings, subjects, ctx)
    } else {
      pullEvent(page, title, startTime, endTime, properties, existingEvents, eventBySourceId, settings, subjects, ctx)
    }
  }
}

function pullEvent(
  page: NotionPage,
  title: string,
  startTime: string,
  endTime: string | undefined,
  properties: Record<string, NotionProperty>,
  existingEvents: CalendarEvent[],
  eventBySourceId: Map<string, CalendarEvent>,
  settings: NotionCalendarSettings,
  subjects: Subject[],
  ctx: SyncCtx,
): void {
  // Known event: update if changed remotely. Preserve the existing bodyHash
  // from the local event's source so the next push doesn't spuriously re-push
  // the body when nothing changed.
  const existing = eventBySourceId.get(page.id)
  if (existing) {
    if (!existing.source?.lastEditedTime || existing.source.lastEditedTime !== page.last_edited_time) {
      ctx.updatedEvents.set(existing.id, {
        ...ctx.updatedEvents.get(existing.id),
        ...toEventFromPage(page, settings, subjects),
        source: getNotionSource(page, "event", existing.source?.bodyHash),
      })
    }
    return
  }

  // Unsourced event: try to match by content
  const candidates = existingEvents.filter((e) => (
    !e.source && !ctx.matchedEventIds.has(e.id) && pageMatchesEvent(page, e, settings, subjects)
  ))
  if (candidates.length > 1) {
    const pageStart = new Date(startTime).getTime()
    candidates.sort((a, b) =>
      Math.abs(new Date(a.startTime).getTime() - pageStart) -
      Math.abs(new Date(b.startTime).getTime() - pageStart),
    )
  }
  for (const c of candidates) ctx.blockedEventFingerprints.add(eventFingerprint(c))

  const match = candidates[0]
  if (match) {
    ctx.matchedEventIds.add(match.id)
    ctx.updatedEvents.set(match.id, {
      ...ctx.updatedEvents.get(match.id),
      source: getNotionSource(page, "event", hashBody(match.description)),
    })
    return
  }

  // Defense-in-depth: check all events for this source ID
  if (existingEvents.some((e) => e.source?.type === "notion" && e.source.id === page.id)) {
    return
  }

  ctx.created.push(toEventFromPage(page, settings, subjects))
}

function pullSession(
  page: NotionPage,
  title: string,
  startTime: string,
  endTime: string | undefined,
  properties: Record<string, NotionProperty>,
  existingSessions: StudySession[],
  sessionBySourceId: Map<string, StudySession>,
  settings: NotionCalendarSettings,
  subjects: Subject[],
  ctx: SyncCtx,
): void {
  // Known session: update if changed remotely. Preserve existing bodyHash.
  const existing = sessionBySourceId.get(page.id)
  if (existing) {
    if (!existing.source?.lastEditedTime || existing.source.lastEditedTime !== page.last_edited_time) {
      const session = toSessionFromPage(page, settings, subjects)
      if (session) {
        ctx.updatedSessions.set(existing.id, {
          ...ctx.updatedSessions.get(existing.id),
          ...session,
          source: getNotionSource(page, "session", existing.source?.bodyHash),
        })
      }
    }
    return
  }

  // Unsourced session: try to match by content
  const candidates = existingSessions.filter((s) => (
    !s.source && !ctx.matchedSessionIds.has(s.id) && pageMatchesSession(page, s, settings, subjects)
  ))
  if (candidates.length > 1) {
    const pageStart = new Date(startTime).getTime()
    candidates.sort((a, b) =>
      Math.abs(new Date(a.startTime).getTime() - pageStart) -
      Math.abs(new Date(b.startTime).getTime() - pageStart),
    )
  }
  for (const c of candidates) ctx.blockedSessionFingerprints.add(sessionFingerprint(c))

  const match = candidates[0]
  if (match) {
    ctx.matchedSessionIds.add(match.id)
    const bodyText = [match.description, match.notes].filter(Boolean).join("\n\n") || undefined
    ctx.updatedSessions.set(match.id, {
      ...ctx.updatedSessions.get(match.id),
      source: getNotionSource(page, "session", hashBody(bodyText)),
    })
    return
  }

  // Defense-in-depth: check all sessions for this source ID
  if (existingSessions.some((s) => s.source?.type === "notion" && s.source.id === page.id)) {
    return
  }

  const session = toSessionFromPage(page, settings, subjects)
  if (session) ctx.createdSessions.push(session)
}

// ---------------------------------------------------------------------------
// Phase 2: Push — Focal events/sessions → Notion
// ---------------------------------------------------------------------------

function collectEventPushTasks(
  existingEvents: CalendarEvent[],
  settings: NotionCalendarSettings,
  subjects: Subject[],
  schema: Record<string, NotionProperty>,
  pagesById: Map<string, NotionPage>,
  ctx: SyncCtx,
  fastPushIds?: Set<string>,
): PushTask[] {
  const tasks: PushTask[] = []
  for (const event of existingEvents) {
    // Skip events that are actually sessions linked by session sync
    if (event.source?.type === "notion" && event.source.kind === "session") continue
    const isFastPush = fastPushIds?.has(event.id)
    // Already matched to a Notion page during pull (only relevant in full-sync mode)
    if (!isFastPush && !event.source && ctx.matchedEventIds.has(event.id)) continue
    // Fingerprint blocked by another matched event (only relevant in full-sync mode)
    if (!isFastPush && !event.source && ctx.blockedEventFingerprints.has(eventFingerprint(event))) continue
    const children = buildPageChildren(event.description)
    const bodyHash = hashBody(event.description)
    const properties = buildNotionEventProperties(settings, event, subjects, schema)
    if (event.source?.type === "notion") {
      // In fast-push mode, skip conflict detection and stale-data checks;
      // just try the update, falling back to create if the page was deleted.
      if (isFastPush) {
        tasks.push({
          run: async () => {
            const page = await withRetry(
              `Event "${event.title}"`,
              () => updateOrCreatePage(settings, event.source!.id, properties, children),
              ctx.pushErrors,
            )
            if (!page) return
            ctx.pushedUpdated += 1
            ctx.newNotionIds.add(page.id)
            ctx.updatedEvents.set(event.id, {
              ...ctx.updatedEvents.get(event.id),
              source: getNotionSource(page, "event", bodyHash),
            })
          },
        })
        continue
      }
      const remotePage = pagesById.get(event.source.id)
      // Conflict: remote modified after our last sync
      if (
        remotePage?.last_edited_time &&
        event.source.lastEditedTime &&
        remotePage.last_edited_time !== event.source.lastEditedTime
      ) {
        ctx.conflicts += 1
        ctx.conflictDetails.push(
          `Event "${event.title}" was modified both locally and in Notion — local changes preserved, Notion changes pending next pull`,
        )
        continue
      }
      if (remotePage) {
        // Skip if nothing changed
        const propertiesMatch = pageMatchesEvent(remotePage, event, settings, subjects)
        const bodyDiffers = bodyHasChanged(event.source.bodyHash, event.description)
        if (propertiesMatch && !bodyDiffers) continue
        tasks.push({
          run: async () => {
            const page = await withRetry(
              `Event "${event.title}"`,
              () => updateNotionPage(settings, event.source!.id, properties, children),
              ctx.pushErrors,
            )
            if (!page) return
            ctx.pushedUpdated += 1
            ctx.newNotionIds.add(page.id)
            ctx.updatedEvents.set(event.id, {
              ...ctx.updatedEvents.get(event.id),
              source: getNotionSource(page, "event", bodyHash),
            })
          },
        })
      } else {
        // Page was deleted in Notion — recreate
        tasks.push({
          run: async () => {
            const page = await withRetry(
              `Event "${event.title}"`,
              () => createNotionPage(settings, properties, children),
              ctx.pushErrors,
            )
            if (!page) return
            ctx.pushedCreated += 1
            ctx.newNotionIds.add(page.id)
            ctx.updatedEvents.set(event.id, {
              ...ctx.updatedEvents.get(event.id),
              source: getNotionSource(page, "event", bodyHash),
            })
          },
        })
      }
      continue
    }
    // Unsourced event → create new Notion page
    tasks.push({
      run: async () => {
        const page = await withRetry(
          `Event "${event.title}"`,
          () => createNotionPage(settings, properties, children),
          ctx.pushErrors,
        )
        if (!page) return
        ctx.pushedCreated += 1
        ctx.newNotionIds.add(page.id)
        ctx.updatedEvents.set(event.id, {
          ...ctx.updatedEvents.get(event.id),
          source: getNotionSource(page, "event", bodyHash),
        })
      },
    })
  }

  return tasks
}

function collectSessionPushTasks(
  existingSessions: StudySession[],
  settings: NotionCalendarSettings,
  subjects: Subject[],
  schema: Record<string, NotionProperty>,
  pagesById: Map<string, NotionPage>,
  ctx: SyncCtx,
  fastPushIds?: Set<string>,
): PushTask[] {
  const tasks: PushTask[] = []
  for (const session of existingSessions) {
    if (session.source?.type === "notion" && session.source.kind === "event") continue
    const isFastPush = fastPushIds?.has(session.id)
    if (!isFastPush && !session.source && ctx.matchedSessionIds.has(session.id)) continue
    if (!isFastPush && !session.source && ctx.blockedSessionFingerprints.has(sessionFingerprint(session))) continue
    const bodyText = [session.description, session.notes].filter(Boolean).join("\n\n") || undefined
    const children = buildPageChildren(bodyText)
    const bodyHash = hashBody(bodyText)
    const properties = buildNotionSessionProperties(settings, session, subjects, schema)
    if (session.source?.type === "notion") {
      if (isFastPush) {
        tasks.push({
          run: async () => {
            const page = await withRetry(
              `Session "${session.title}"`,
              () => updateOrCreatePage(settings, session.source!.id, properties, children),
              ctx.pushErrors,
            )
            if (!page) return
            ctx.pushedUpdated += 1
            ctx.newNotionIds.add(page.id)
            ctx.updatedSessions.set(session.id, {
              ...ctx.updatedSessions.get(session.id),
              source: getNotionSource(page, "session", bodyHash),
            })
          },
        })
        continue
      }
      const remotePage = pagesById.get(session.source.id)
      if (
        remotePage?.last_edited_time &&
        session.source.lastEditedTime &&
        remotePage.last_edited_time !== session.source.lastEditedTime
      ) {
        ctx.conflicts += 1
        ctx.conflictDetails.push(
          `Session "${session.title}" was modified both locally and in Notion — local changes preserved, Notion changes pending next pull`,
        )
        continue
      }
      if (remotePage) {
        const propertiesMatch = pageMatchesSession(remotePage, session, settings, subjects)
        const bodyDiffers = bodyHasChanged(session.source.bodyHash, bodyText)
        if (propertiesMatch && !bodyDiffers) continue
        tasks.push({
          run: async () => {
            const page = await withRetry(
              `Session "${session.title}"`,
              () => updateNotionPage(settings, session.source!.id, properties, children),
              ctx.pushErrors,
            )
            if (!page) return
            ctx.pushedUpdated += 1
            ctx.newNotionIds.add(page.id)
            ctx.updatedSessions.set(session.id, {
              ...ctx.updatedSessions.get(session.id),
              source: getNotionSource(page, "session", bodyHash),
            })
          },
        })
      } else {
        tasks.push({
          run: async () => {
            const page = await withRetry(
              `Session "${session.title}"`,
              () => createNotionPage(settings, properties, children),
              ctx.pushErrors,
            )
            if (!page) return
            ctx.pushedCreated += 1
            ctx.newNotionIds.add(page.id)
            ctx.updatedSessions.set(session.id, {
              ...ctx.updatedSessions.get(session.id),
              source: getNotionSource(page, "session", bodyHash),
            })
          },
        })
      }
      continue
    }
    tasks.push({
      run: async () => {
        const page = await withRetry(
          `Session "${session.title}"`,
          () => createNotionPage(settings, properties, children),
          ctx.pushErrors,
        )
        if (!page) return
        ctx.pushedCreated += 1
        ctx.newNotionIds.add(page.id)
        ctx.updatedSessions.set(session.id, {
          ...ctx.updatedSessions.get(session.id),
          source: getNotionSource(page, "session", bodyHash),
        })
      },
    })
  }
  return tasks
}

// ---------------------------------------------------------------------------
// Phase 3: Orphan cleanup
// ---------------------------------------------------------------------------

const SYNCED_NOTION_IDS_KEY = "focal-synced-notion-ids"

function getSyncedNotionIds(): Set<string> {
  try {
    const stored = localStorage.getItem(SYNCED_NOTION_IDS_KEY)
    if (!stored) return new Set()
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === "string"))
  } catch {
    return new Set()
  }
}

function setSyncedNotionIds(ids: Set<string>): void {
  localStorage.setItem(SYNCED_NOTION_IDS_KEY, JSON.stringify([...ids]))
}

async function deleteOrphanPages(
  existingEvents: CalendarEvent[],
  existingSessions: StudySession[],
  pagesById: Map<string, NotionPage>,
  settings: NotionCalendarSettings,
  ctx: SyncCtx,
  onProgress?: (msg: string) => void,
): Promise<Set<string>> {
  const deletedIds = new Set<string>()
  const previousIds = getSyncedNotionIds()

  // All currently-linked Notion IDs (from persisted events/sessions + newly created)
  const currentIds = new Set<string>()
  for (const event of existingEvents) {
    if (event.source?.type === "notion") currentIds.add(event.source.id)
  }
  for (const session of existingSessions) {
    if (session.source?.type === "notion") currentIds.add(session.source.id)
  }
  for (const id of ctx.newNotionIds) {
    currentIds.add(id)
  }

  const orphanIds = [...previousIds].filter((id) => !currentIds.has(id) && pagesById.has(id))
  if (orphanIds.length === 0) {
    setSyncedNotionIds(currentIds)
    return deletedIds
  }

  onProgress?.(`Cleaning up ${orphanIds.length} deleted item${orphanIds.length === 1 ? "" : "s"}...`)
  for (const orphanId of orphanIds) {
    const ok = await withRetry(
      `Delete page ${orphanId}`,
      async () => { await deleteNotionPage(settings, orphanId); return "ok" as const },
      ctx.pushErrors,
    )
    if (ok) {
      ctx.deleted += 1
      deletedIds.add(orphanId)
    }
  }

  setSyncedNotionIds(currentIds)
  return deletedIds
}

// ---------------------------------------------------------------------------
// Main sync orchestrator
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Main sync orchestrator
// ---------------------------------------------------------------------------
export async function syncNotionCalendar(
  settings: NotionCalendarSettings,
  existingEvents: CalendarEvent[],
  existingSessions: StudySession[],
  subjects: Subject[],
  onProgress?: (msg: string) => void,
  changedEventIds?: Set<string>,
  changedSessionIds?: Set<string>,
): Promise<NotionCalendarSyncResult> {
  if (!settings.token.trim()) throw new Error("Add a Notion integration token first.")
  if (!settings.dataSourceId.trim()) throw new Error("Add a Notion data source or database id first.")
  const isFastPush = (changedEventIds?.size ?? 0) > 0 || (changedSessionIds?.size ?? 0) > 0
  const fastPushEventIds = changedEventIds?.size ? changedEventIds : undefined
  const fastPushSessionIds = changedSessionIds?.size ? changedSessionIds : undefined
  let pagesById: Map<string, NotionPage>
  let schema: Record<string, NotionProperty>
  const ctx = createSyncCtx()
  if (isFastPush) {
    // Fast-push mode: skip query + pull, use cached schema
    schema = getCachedSchema(settings.dataSourceId) ?? {}
    pagesById = new Map()
  } else {
    // Full sync: fetch all pages from Notion
    const pages = await queryNotionCalendar(settings)
    onProgress?.(`Fetched ${pages.length} page${pages.length === 1 ? "" : "s"} from Notion`)
    pagesById = new Map(pages.map((page) => [page.id, page]))
    schema = pages.find((page) => page.properties)?.properties ?? {}
    // Cache schema for fast-push use
    if (Object.keys(schema).length > 0) {
      setCachedSchema(settings.dataSourceId, schema)
    }
    // Phase 1: Delete orphan pages FIRST — pages whose Focal events/sessions
    // were deleted since the last sync. Must happen before pull, otherwise the
    // pull phase re-creates the deleted items from the Notion pages.
    const deletedIds = await deleteOrphanPages(existingEvents, existingSessions, pagesById, settings, ctx, onProgress)
    // Remove deleted pages so the pull phase doesn't re-create them
    const activePages = deletedIds.size > 0
      ? pages.filter((p) => !deletedIds.has(p.id))
      : pages
    // Phase 2: Pull — Notion pages → Focal events/sessions
    pullFromNotion(activePages, existingEvents, existingSessions, settings, subjects, ctx)
    const totalPulled = ctx.created.length + ctx.updatedEvents.size + ctx.createdSessions.length + ctx.updatedSessions.size
    onProgress?.(
      totalPulled > 0
        ? `Found ${totalPulled} new or updated item${totalPulled === 1 ? "" : "s"}`
        : "No new items from Notion",
    )
  }
  // Phase 3: Push — Focal events/sessions → Notion
  const eventTasks = collectEventPushTasks(existingEvents, settings, subjects, schema, pagesById, ctx, fastPushEventIds)
  const sessionTasks = collectSessionPushTasks(existingSessions, settings, subjects, schema, pagesById, ctx, fastPushSessionIds)
  await executePushTasks([...eventTasks, ...sessionTasks])
  // Build result
  return {
    created: ctx.created,
    updated: [...ctx.updatedEvents.entries()].map(([id, updates]) => ({ id, updates })),
    createdSessions: ctx.createdSessions,
    updatedSessions: [...ctx.updatedSessions.entries()].map(([id, updates]) => ({ id, updates })),
    skipped: ctx.skipped,
    skippedReasons: ctx.skippedReasons,
    pushedCreated: ctx.pushedCreated,
    pushedUpdated: ctx.pushedUpdated,
    deleted: ctx.deleted,
    conflicts: ctx.conflicts,
    conflictDetails: ctx.conflictDetails,
    pushErrors: ctx.pushErrors,
  }
}

// ---------------------------------------------------------------------------
// Fast-push: push a single event or session without pulling from Notion first
// ---------------------------------------------------------------------------

/**
 * Attempt an update; if the page was deleted in Notion (object_not_found),
 * fall back to creating a new page.
 */
async function updateOrCreatePage(
  settings: NotionCalendarSettings,
  pageId: string,
  properties: Record<string, unknown>,
  children: unknown[] | undefined,
): Promise<NotionPage> {
  try {
    return await updateNotionPage(settings, pageId, properties, children)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("object_not_found")) {
      return await createNotionPage(settings, properties, children)
    }
    throw e
  }
}

export interface PushSingleResult {
  source: NonNullable<CalendarEvent["source"]>
}

/**
 * Push a single event to Notion. Uses cached schema; returns null if no
 * schema is cached (caller should fall back to a full sync).
 */
export async function pushEventToNotion(
  settings: NotionCalendarSettings,
  event: CalendarEvent,
  subjects: Subject[],
): Promise<PushSingleResult | null> {
  const schema = getCachedSchema(settings.dataSourceId)
  if (!schema || Object.keys(schema).length === 0) return null

  const properties = buildNotionEventProperties(settings, event, subjects, schema)
  const children = buildPageChildren(event.description)
  const bodyHash = hashBody(event.description)

  const page = event.source?.type === "notion"
    ? await updateOrCreatePage(settings, event.source.id, properties, children)
    : await createNotionPage(settings, properties, children)

  return {
    source: getNotionSource(page, "event", bodyHash),
  }
}

/**
 * Push a single study session to Notion. Uses cached schema; returns null
 * if no schema is cached (caller should fall back to a full sync).
 */
export async function pushSessionToNotion(
  settings: NotionCalendarSettings,
  session: StudySession,
  subjects: Subject[],
): Promise<PushSingleResult | null> {
  const schema = getCachedSchema(settings.dataSourceId)
  if (!schema || Object.keys(schema).length === 0) return null

  const bodyText = [session.description, session.notes].filter(Boolean).join("\n\n") || undefined
  const properties = buildNotionSessionProperties(settings, session, subjects, schema)
  const children = buildPageChildren(bodyText)
  const bodyHash = hashBody(bodyText)

  const page = session.source?.type === "notion"
    ? await updateOrCreatePage(settings, session.source.id, properties, children)
    : await createNotionPage(settings, properties, children)

  return {
    source: getNotionSource(page, "session", bodyHash),
  }
}
