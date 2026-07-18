export const SETTINGS_SECTION_CLASS = "rounded-lg border bg-card p-4"
export const SETTINGS_CHECKBOX_CLASS = "h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 10) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
