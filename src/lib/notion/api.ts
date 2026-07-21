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

const MAX_READ_RETRIES = 2

export function isRetryableNotionReadError(code: string): boolean {
  return [
    "NETWORK_ERROR",
    "rate_limited",
    "internal_server_error",
    "service_unavailable",
    "database_connection_unavailable",
    "gateway_timeout",
  ].includes(code)
}

export function notionReadRetryDelay(attempt: number): number {
  return 500 * (2 ** attempt)
}

export function isAlreadyArchivedNotionError(error: { code: string; message: string } | null | undefined): boolean {
  return error?.code === "validation_error" && error.message.toLowerCase().includes("is archived")
}

async function retryNotionRead<T extends { error?: { code: string; message: string } | null }>(
  read: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await read()
    if (!response.error) return response
    if (attempt === MAX_READ_RETRIES || !isRetryableNotionReadError(response.error.code)) {
      throw new Error(response.error.message)
    }
    await new Promise((resolve) => setTimeout(resolve, notionReadRetryDelay(attempt)))
  }
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
  await retryNotionRead(async () => {
    const response = await invoke<unknown>("delete_notion_page", {
      token: settings.token,
      pageId,
    })
    if (!isNotionPageResponse(response)) throw new Error("Invalid Notion delete response")
    if (isAlreadyArchivedNotionError(response.error)) return { ...response, error: null }
    return response
  })
}

export async function queryNotionCalendar(settings: NotionCalendarSettings): Promise<NotionPage[]> {
  const response = await retryNotionRead(async () => {
    const value = await invoke<unknown>("query_notion_calendar", {
      token: settings.token,
      dataSourceId: settings.dataSourceId,
    })
    if (!isNotionQueryResponse(value)) throw new Error("Invalid Notion sync response")
    return value
  })
  return (response.data ?? []).map(normalisePage).filter((page): page is NotionPage => page !== null)
}

/**
 * Lightweight schema fetch: retrieves the database itself instead of querying
 * all of its pages. This also works when the database is empty.
 */
export async function fetchNotionSchema(settings: NotionCalendarSettings): Promise<Record<string, NotionProperty> | null> {
  const response = await retryNotionRead(async () => {
    const value = await invoke<unknown>("fetch_notion_schema", {
      token: settings.token,
      dataSourceId: settings.dataSourceId,
    })
    if (!isNotionPageResponse(value)) throw new Error("Invalid Notion schema response")
    return value
  })
  const page = normalisePage(response.data)
  return page?.properties ?? null
}

export async function ensureNotionSyncProperties(settings: NotionCalendarSettings): Promise<Record<string, NotionProperty>> {
  const response = await invoke<unknown>("ensure_notion_sync_properties", {
    token: settings.token,
    dataSourceId: settings.dataSourceId,
  })
  if (!isNotionPageResponse(response)) throw new Error("Invalid Notion schema update response")
  if (response.error) throw new Error(response.error.message)
  const page = normalisePage(response.data)
  if (!page?.properties) throw new Error("Notion schema update response missing properties")
  return page.properties
}
