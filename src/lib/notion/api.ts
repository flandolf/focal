import { invoke } from "@tauri-apps/api/core"
import type { NotionCalendarSettings } from "@/lib/settings"
import { isRecord, normalisePage } from "@/lib/notion/schema"
import type { NotionPage, NotionQueryResponse, NotionPageResponse, NotionProperty } from "@/lib/notion/schema"

function isNotionQueryError(value: unknown): value is { code: string; message: string } {
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

export async function createNotionPage(
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

export async function updateNotionPage(
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

export async function deleteNotionPage(
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

export async function queryNotionCalendar(settings: NotionCalendarSettings): Promise<NotionPage[]> {
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

/**
 * Lightweight schema fetch: retrieves a single page from the database to extract
 * the property schema, without paginating through all pages. This is much faster
 * than a full query when we only need the schema (e.g. for fast-push).
 */
export async function fetchNotionSchema(settings: NotionCalendarSettings): Promise<Record<string, NotionProperty> | null> {
  const response = await invoke<unknown>("fetch_notion_schema", {
    token: settings.token,
    dataSourceId: settings.dataSourceId,
  })
  if (!isNotionPageResponse(response)) return null
  if (response.error) return null
  const page = normalisePage(response.data)
  return page?.properties ?? null
}
