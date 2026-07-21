import type { QuickLink } from "@/lib/types"

export const QUICK_LINKS_STORAGE_KEY = "focal-quick-links"

export function parseQuickLinks(value: unknown): QuickLink[] {
  if (!Array.isArray(value)) return []
  return value.filter((link): link is QuickLink => {
    if (!link || typeof link !== "object" || Array.isArray(link)) return false
    const record = link as Record<string, unknown>
    return ["id", "label", "url", "icon", "color"].every((field) => typeof record[field] === "string")
  })
}

export function getStoredQuickLinks(): QuickLink[] {
  try {
    return parseQuickLinks(JSON.parse(localStorage.getItem(QUICK_LINKS_STORAGE_KEY) ?? "[]"))
  } catch {
    return []
  }
}
