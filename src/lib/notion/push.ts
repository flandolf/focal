import type { CalendarEvent, StudySession, Subject } from "@/lib/types"
import type { NotionCalendarSettings } from "@/lib/settings"
import type { NotionPage, NotionProperty, SyncCtx, PushTask } from "@/lib/notion/schema"
import {
  getCachedSchema,
  setCachedSchema,
  getNotionSource,
  buildPageChildren,
  hashBody,
  bodyHasChanged,
  eventFingerprint,
  sessionFingerprint,
  richTextValue,
  createTextProperty,
  createPropertyValue,
  getSchemaPropertyType,
  pageMatchesEvent,
  pageMatchesSession,
  toNotionType,
} from "@/lib/notion/schema"
import { findSubjectIdFromValues } from "@/lib/notion/subjectMatch"
import { createNotionPage, updateNotionPage, deleteNotionPage, fetchNotionSchema } from "@/lib/notion/api"


function buildSessionBodyText(session: StudySession): string | undefined {
  const base = [session.description, session.notes].filter(Boolean).join("\n\n")
  if (!session.activeDurations || session.activeDurations.length === 0) {
    return base || undefined
  }
  const sorted = [...session.activeDurations].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  )
  const lines: string[] = []
  let lastEnd: Date | null = null
  let totalActive = 0
  for (const d of sorted) {
    const startDate = new Date(d.start)
    const endDate = new Date(d.end)
    const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000)
    totalActive += durationMin
    const timeFmt = (date: Date) =>
      date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    if (lastEnd) {
      const restMin = Math.round((startDate.getTime() - lastEnd.getTime()) / 60000)
      lines.push(`Break: ${timeFmt(lastEnd)} – ${timeFmt(startDate)} (${restMin}m)`)
    }
    lines.push(`Active: ${timeFmt(startDate)} – ${timeFmt(endDate)} (${durationMin}m)`)
    lastEnd = endDate
  }
  lines.push(`\nTotal active study: ${totalActive}m`)
  const timeline = lines.join("\n")
  return base ? `${base}\n\n${timeline}` : timeline
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
// Property building
// ---------------------------------------------------------------------------

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
// Fast-push: push a single event or session without pulling from Notion first
// ---------------------------------------------------------------------------

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

export async function pushEventToNotion(
  settings: NotionCalendarSettings,
  event: CalendarEvent,
  subjects: Subject[],
): Promise<PushSingleResult | null> {
  let schema = getCachedSchema(settings.dataSourceId)
  if (!schema || Object.keys(schema).length === 0) {
    schema = await fetchNotionSchema(settings)
    if (!schema) return null
    setCachedSchema(settings.dataSourceId, schema)
  }

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

export async function pushSessionToNotion(
  settings: NotionCalendarSettings,
  session: StudySession,
  subjects: Subject[],
): Promise<PushSingleResult | null> {
  let schema = getCachedSchema(settings.dataSourceId)
  if (!schema || Object.keys(schema).length === 0) {
    schema = await fetchNotionSchema(settings)
    if (!schema) return null
    setCachedSchema(settings.dataSourceId, schema)
  }

  const bodyText = buildSessionBodyText(session)
  const children = buildPageChildren(bodyText)
  const properties = buildNotionSessionProperties(settings, session, subjects, schema)
  const bodyHash = hashBody(bodyText ?? "")

  const page = session.source?.type === "notion"
    ? await updateOrCreatePage(settings, session.source.id, properties, children)
    : await createNotionPage(settings, properties, children)

  return {
    source: getNotionSource(page, "session", bodyHash),
  }
}

// ---------------------------------------------------------------------------
// Collect push tasks for full sync
// ---------------------------------------------------------------------------

export function collectEventPushTasks(
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
    if (event.source?.type === "notion" && event.source.kind === "session") continue
    const isFastPush = fastPushIds?.has(event.id)
    if (!isFastPush && !event.source && ctx.matchedEventIds.has(event.id)) continue
    if (!isFastPush && !event.source && ctx.blockedEventFingerprints.has(eventFingerprint(event))) continue
    const children = buildPageChildren(event.description)
    const bodyHash = hashBody(event.description)
    const properties = buildNotionEventProperties(settings, event, subjects, schema)
    if (event.source?.type === "notion") {
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
        const propertiesMatch = pageMatchesEvent(remotePage, event, settings, subjects, findSubjectIdFromValues)
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

export function collectSessionPushTasks(
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
    const bodyText = buildSessionBodyText(session)
    const children = buildPageChildren(bodyText)
    const bodyHash = hashBody(bodyText ?? "")
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
        const propertiesMatch = pageMatchesSession(remotePage, session, settings, subjects, findSubjectIdFromValues)
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

export async function deleteOrphanPages(
  existingEvents: CalendarEvent[],
  existingSessions: StudySession[],
  pagesById: Map<string, NotionPage>,
  settings: NotionCalendarSettings,
  ctx: SyncCtx,
  onProgress?: (msg: string) => void,
): Promise<Set<string>> {
  const deletedIds = new Set<string>()
  const previousIds = getSyncedNotionIds()

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
// Orchestrate push phase
// ---------------------------------------------------------------------------

export async function executePush(
  existingEvents: CalendarEvent[],
  existingSessions: StudySession[],
  settings: NotionCalendarSettings,
  subjects: Subject[],
  schema: Record<string, NotionProperty>,
  pagesById: Map<string, NotionPage>,
  ctx: SyncCtx,
  fastPushEventIds?: Set<string>,
  fastPushSessionIds?: Set<string>,
): Promise<void> {
  const eventTasks = collectEventPushTasks(existingEvents, settings, subjects, schema, pagesById, ctx, fastPushEventIds)
  const sessionTasks = collectSessionPushTasks(existingSessions, settings, subjects, schema, pagesById, ctx, fastPushSessionIds)
  await executePushTasks([...eventTasks, ...sessionTasks])
}
