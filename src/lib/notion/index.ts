import type { CalendarEvent, StudySession, Subject } from "@/lib/types"
import type { NotionCalendarSettings } from "@/lib/settings"
import type { NotionCalendarSyncResult, NotionPage, NotionProperty } from "@/lib/notion/schema"
import {
  getCachedSchema,
  setCachedSchema,
  createSyncCtx,
} from "@/lib/notion/schema"
import { queryNotionCalendar } from "@/lib/notion/api"
import { pullFromNotion } from "@/lib/notion/pull"
import { executePush, deleteOrphanPages } from "@/lib/notion/push"

export type { NotionCalendarSyncResult } from "@/lib/notion/schema"
export type { PushSingleResult } from "@/lib/notion/push"
export { pushEventToNotion, pushSessionToNotion } from "@/lib/notion/push"

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
    schema = getCachedSchema(settings.dataSourceId) ?? {}
    pagesById = new Map()
  } else {
    const pages = await queryNotionCalendar(settings)
    onProgress?.(`Fetched ${pages.length} page${pages.length === 1 ? "" : "s"} from Notion`)
    pagesById = new Map(pages.map((page) => [page.id, page]))
    schema = pages.find((page) => page.properties)?.properties ?? {}
    if (Object.keys(schema).length > 0) {
      setCachedSchema(settings.dataSourceId, schema)
    }
    const deletedIds = await deleteOrphanPages(existingEvents, existingSessions, pagesById, settings, ctx, onProgress)
    const activePages = deletedIds.size > 0
      ? pages.filter((p) => !deletedIds.has(p.id))
      : pages
    pullFromNotion(activePages, existingEvents, existingSessions, settings, subjects, ctx)
    const totalPulled = ctx.created.length + ctx.updatedEvents.size + ctx.createdSessions.length + ctx.updatedSessions.size
    onProgress?.(
      totalPulled > 0
        ? `Found ${totalPulled} new or updated item${totalPulled === 1 ? "" : "s"}`
        : "No new items from Notion",
    )
  }
  await executePush(existingEvents, existingSessions, settings, subjects, schema, pagesById, ctx, fastPushEventIds, fastPushSessionIds)
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
    conflictItems: ctx.conflictItems,
    pushErrors: ctx.pushErrors,
  }
}
