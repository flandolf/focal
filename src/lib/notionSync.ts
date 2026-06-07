import { Client } from "@notionhq/client"
import { invoke } from "@tauri-apps/api/core"
import type { CalendarEvent, EventType, Subject } from "@/lib/types"
import type { NotionCalendarSettings } from "@/lib/settings"

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
  skipped: number
  skippedReasons: string[]
  pushedCreated: number
  pushedUpdated: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getRichTextPlainText(items: unknown): string | undefined {
  if (!Array.isArray(items)) return undefined
  const text = items
    .map((item) => isRecord(item) && typeof item.plain_text === "string" ? item.plain_text : "")
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
      .map((item) => isRecord(item) && typeof item.name === "string" ? item.name : "")
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
  if (normalized === "gat") return "gat"
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
    case "gat":
      return "Practice SAC"
    case "other":
    case "event":
    default:
      return "Other"
  }
}

function normaliseToken(value: string | undefined): string {
  return value?.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "") ?? ""
}

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

function normalisePage(value: unknown): NotionPage | null {
  if (!isRecord(value) || typeof value.id !== "string") return null
  return {
    id: value.id,
    url: typeof value.url === "string" ? value.url : undefined,
    last_edited_time: typeof value.last_edited_time === "string" ? value.last_edited_time : undefined,
    properties: isRecord(value.properties) ? value.properties as Record<string, NotionProperty> : undefined,
  }
}

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

function richTextValue(value: string): unknown[] {
  return [{ text: { content: value } }]
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

function getSchemaPropertyType(
  schema: Record<string, NotionProperty>,
  propertyName: string,
  fallback: string,
): string {
  return getPropertyType(findProperty(schema, propertyName)) === "missing"
    ? fallback
    : getPropertyType(findProperty(schema, propertyName))
}

function buildNotionProperties(
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
    const propertyType = getSchemaPropertyType(schema, settings.typeProperty, "select")
    const notionType = toNotionType(event.eventType)
    const typeProperty = createTextProperty(propertyType, notionType)
    if (typeProperty) properties[settings.typeProperty] = typeProperty
  }

  if (settings.subjectProperty.trim()) {
    const subject = subjects.find((candidate) => candidate.id === event.subjectId)
    const propertyType = getSchemaPropertyType(schema, settings.subjectProperty, "select")
    const subjectProperty = createTextProperty(propertyType, subject?.name)
    if (subjectProperty) properties[settings.subjectProperty] = subjectProperty
  }

  if (settings.descriptionProperty.trim()) {
    const propertyType = getSchemaPropertyType(schema, settings.descriptionProperty, "rich_text")
    const descriptionProperty = createTextProperty(propertyType, event.description)
    if (descriptionProperty) properties[settings.descriptionProperty] = descriptionProperty
  }

  if (settings.locationProperty.trim()) {
    const propertyType = getSchemaPropertyType(schema, settings.locationProperty, "rich_text")
    const locationProperty = createTextProperty(propertyType, event.location)
    if (locationProperty) properties[settings.locationProperty] = locationProperty
  }

  return properties
}

function sameInstant(a: string | undefined, b: string | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  const aTime = new Date(a).getTime()
  const bTime = new Date(b).getTime()
  return Number.isFinite(aTime) && Number.isFinite(bTime) && aTime === bTime
}

function pageMatchesEvent(
  page: NotionPage,
  event: CalendarEvent,
  settings: NotionCalendarSettings,
  subjects: Subject[],
): boolean {
  const properties = page.properties ?? {}
  const title = getPageTitle(properties, settings.titleProperty)
  const { startTime, endTime } = getPropertyDateForEvent(properties, settings)
  const subjectId = findSubjectIdFromValues([
    ...(settings.subjectProperty ? getPropertyTexts(findProperty(properties, settings.subjectProperty)) : []),
    title,
    getPropertyText(findProperty(properties, settings.descriptionProperty)) ?? "",
    getPropertyText(findProperty(properties, settings.locationProperty)) ?? "",
  ], subjects)
  const eventType = settings.typeProperty ? toEventType(getPropertyText(findProperty(properties, settings.typeProperty))) : "event"
  const description = settings.descriptionProperty ? getPropertyText(findProperty(properties, settings.descriptionProperty)) : undefined
  const location = settings.locationProperty ? getPropertyText(findProperty(properties, settings.locationProperty)) : undefined

  return (
    title === event.title &&
    sameInstant(startTime, event.startTime) &&
    sameInstant(endTime, event.endTime) &&
    eventType === event.eventType &&
    subjectId === event.subjectId &&
    (description ?? "") === (event.description ?? "") &&
    (location ?? "") === (event.location ?? "")
  )
}

async function createNotionPage(
  settings: NotionCalendarSettings,
  properties: Record<string, unknown>,
): Promise<NotionPage> {
  const response = await invoke<unknown>("create_notion_calendar_page", {
    token: settings.token,
    dataSourceId: settings.dataSourceId,
    properties,
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
): Promise<NotionPage> {
  const response = await invoke<unknown>("update_notion_calendar_page", {
    token: settings.token,
    pageId,
    properties,
  })
  if (!isNotionPageResponse(response)) throw new Error("Invalid Notion update response")
  if (response.error) throw new Error(response.error.message)
  const page = normalisePage(response.data)
  if (!page) throw new Error("Notion update response missing page")
  return page
}

async function queryNotionCalendarWithBackend(settings: NotionCalendarSettings): Promise<NotionPage[]> {
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

async function queryNotionCalendar(settings: NotionCalendarSettings): Promise<NotionPage[]> {
  try {
    return await queryNotionCalendarWithBackend(settings)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("not found")) throw error
  }

  const notion = new Client({ auth: settings.token })
  const dataSourceId = settings.dataSourceId.trim()
  const client = notion as unknown as {
    dataSources?: { query: (args: { data_source_id: string; start_cursor?: string }) => Promise<unknown> }
    databases?: { query: (args: { database_id: string; start_cursor?: string }) => Promise<unknown> }
  }
  let queryMode: "dataSource" | "database" | undefined
  const queryPage = async (cursor: string | undefined) => {
    if (queryMode === "dataSource") {
      return client.dataSources?.query({ data_source_id: dataSourceId, start_cursor: cursor })
    }
    if (queryMode === "database") {
      return client.databases?.query({ database_id: dataSourceId, start_cursor: cursor })
    }
    if (client.dataSources) {
      try {
        const response = await client.dataSources.query({ data_source_id: dataSourceId, start_cursor: cursor })
        queryMode = "dataSource"
        return response
      } catch (error) {
        if (!client.databases) throw error
      }
    }
    const response = await client.databases?.query({ database_id: dataSourceId, start_cursor: cursor })
    queryMode = "database"
    return response
  }

  const pages: NotionPage[] = []
  let cursor: string | undefined
  do {
    const response = await queryPage(cursor)

    if (!isRecord(response)) break
    const results = Array.isArray(response.results) ? response.results : []
    pages.push(...results.map(normalisePage).filter((page): page is NotionPage => page !== null))
    cursor = typeof response.next_cursor === "string" ? response.next_cursor : undefined
  } while (cursor)

  return pages
}

export async function syncNotionCalendar(
  settings: NotionCalendarSettings,
  existingEvents: CalendarEvent[],
  subjects: Subject[],
): Promise<NotionCalendarSyncResult> {
  if (!settings.token.trim()) throw new Error("Add a Notion integration token first.")
  if (!settings.dataSourceId.trim()) throw new Error("Add a Notion data source or database id first.")

  const pages = await queryNotionCalendar(settings)
  const existingByNotionId = new Map(
    existingEvents
      .filter((event) => event.source?.type === "notion")
      .map((event) => [event.source?.id, event] as const),
  )
  const pagesById = new Map(pages.map((page) => [page.id, page]))
  const schema = pages.find((page) => page.properties)?.properties ?? {}

  const created: NotionCalendarSyncResult["created"] = []
  const updated: NotionCalendarSyncResult["updated"] = []
  const skippedReasons: string[] = []
  let pushedCreated = 0
  let pushedUpdated = 0
  let skipped = 0

  for (const page of pages) {
    const properties = page.properties ?? {}
    const title = getPageTitle(properties, settings.titleProperty)
    const { startTime, endTime, skippedReason } = getPropertyDateForEvent(properties, settings)
    if (!startTime) {
      skipped += 1
      if (skippedReason && !skippedReasons.includes(skippedReason) && skippedReasons.length < 3) {
        skippedReasons.push(skippedReason)
      }
      continue
    }
    if (skippedReason && !skippedReasons.includes(skippedReason) && skippedReasons.length < 3) {
      skippedReasons.push(skippedReason)
    }

    const event: Omit<CalendarEvent, "id" | "created_at"> = {
      title,
      description: settings.descriptionProperty ? getPropertyText(findProperty(properties, settings.descriptionProperty)) : undefined,
      startTime,
      endTime,
      eventType: settings.typeProperty ? toEventType(getPropertyText(findProperty(properties, settings.typeProperty))) : "event",
      subjectId: findSubjectIdFromValues([
        ...(settings.subjectProperty ? getPropertyTexts(findProperty(properties, settings.subjectProperty)) : []),
        title,
        getPropertyText(findProperty(properties, settings.descriptionProperty)) ?? "",
        getPropertyText(findProperty(properties, settings.locationProperty)) ?? "",
      ], subjects),
      location: settings.locationProperty ? getPropertyText(findProperty(properties, settings.locationProperty)) : undefined,
      isFinished: false,
      source: {
        type: "notion",
        id: page.id,
        url: page.url,
        lastEditedTime: page.last_edited_time,
      },
    }

    const existing = existingByNotionId.get(page.id)
    if (existing) {
      if (!existing.source?.lastEditedTime || existing.source.lastEditedTime !== page.last_edited_time) {
        updated.push({ id: existing.id, updates: event })
      }
    } else {
      created.push(event)
    }
  }

  for (const event of existingEvents) {
    const properties = buildNotionProperties(settings, event, subjects, schema)
    if (event.source?.type === "notion") {
      const remotePage = pagesById.get(event.source.id)
      const remoteChanged = Boolean(
        remotePage?.last_edited_time &&
        event.source.lastEditedTime &&
        remotePage.last_edited_time !== event.source.lastEditedTime,
      )
      if (remoteChanged) continue

      if (remotePage) {
        if (pageMatchesEvent(remotePage, event, settings, subjects)) continue
        const page = await updateNotionPage(settings, event.source.id, properties)
        pushedUpdated += 1
        updated.push({
          id: event.id,
          updates: {
            source: {
              type: "notion",
              id: page.id,
              url: page.url,
              lastEditedTime: page.last_edited_time,
            },
          },
        })
      } else {
        const page = await createNotionPage(settings, properties)
        pushedCreated += 1
        updated.push({
          id: event.id,
          updates: {
            source: {
              type: "notion",
              id: page.id,
              url: page.url,
              lastEditedTime: page.last_edited_time,
            },
          },
        })
      }
      continue
    }

    const page = await createNotionPage(settings, properties)
    pushedCreated += 1
    updated.push({
      id: event.id,
      updates: {
        source: {
          type: "notion",
          id: page.id,
          url: page.url,
          lastEditedTime: page.last_edited_time,
        },
      },
    })
  }

  return { created, updated, skipped, skippedReasons, pushedCreated, pushedUpdated }
}
