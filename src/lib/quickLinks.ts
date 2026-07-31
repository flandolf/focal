import type { QuickLink } from "@/lib/types"

export const QUICK_LINKS_STORAGE_KEY = "focal-quick-links"

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const protocol = new URL(value).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

export function parseQuickLinks(value: unknown): QuickLink[] {
  if (!Array.isArray(value)) return []
  return value.filter((link): link is QuickLink => {
    if (!link || typeof link !== "object" || Array.isArray(link)) return false
    const record = link as Record<string, unknown>
    return ["id", "label", "icon", "color"].every((field) => typeof record[field] === "string")
      && isHttpUrl(record.url)
  })
}

export function getStoredQuickLinks(): QuickLink[] {
  try {
    return parseQuickLinks(JSON.parse(localStorage.getItem(QUICK_LINKS_STORAGE_KEY) ?? "[]"))
  } catch {
    return []
  }
}
