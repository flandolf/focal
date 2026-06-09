import { cn } from "@/lib/utils"

export const SETTINGS_SECTION_CLASS = "rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur"
export const SETTINGS_OPTION_BASE_CLASS = "rounded-lg border bg-background/30 text-sm transition-colors outline-none hover:border-muted-foreground/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
export const SETTINGS_SELECTED_OPTION_CLASS = "border-primary bg-primary/10 text-primary"
export const SETTINGS_CHECKBOX_CLASS = "h-4 w-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
export const SETTINGS_LINK_CLASS = "inline-flex shrink-0 items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"

export function getSettingsOptionClassName(selected: boolean, className?: string) {
  return cn(
    SETTINGS_OPTION_BASE_CLASS,
    selected ? SETTINGS_SELECTED_OPTION_CLASS : "border-border",
    className,
  )
}

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
