import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type SyncStatus = "idle" | "syncing" | "error" | "success"

interface NotionSyncIndicatorProps {
  status: SyncStatus
  lastSyncTime?: number
  onClick?: () => void
  disabled?: boolean
  className?: string
}

function formatTimeAgo(timestamp: number): string {
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

function NotionLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.2 2.16c-.42-.326-.98-.7-2.055-.606l-12.8.934c-.466.047-.56.28-.374.42zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.046-.747.326-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.515-1.635.515-.748 0-.935-.234-1.498-.933l-4.577-7.186v6.952l1.453.327s0 .84-1.168.84l-3.222.187c-.093-.187 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279V9.201l-1.214-.14c-.093-.515.28-.886.747-.933zM2.24 1.627l13.355-.981c1.635-.14 2.055-.047 3.082.7l4.25 2.986c.7.513.936.653.936 1.213v16.378c0 1.026-.373 1.632-1.68 1.726l-15.458.934c-.98.046-1.449-.093-1.963-.747l-3.129-4.06c-.56-.746-.793-1.306-.793-1.96V3.307c0-.84.373-1.54 1.402-1.68z" />
    </svg>
  )
}

function StatusDot({ status }: { status: SyncStatus }) {
  return (
    <span className="absolute bottom-0 right-0 flex h-2 w-2">
      {status === "syncing" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full border border-background",
          status === "idle" && "bg-muted-foreground/40",
          status === "syncing" && "bg-primary",
          status === "error" && "bg-destructive",
          status === "success" && "bg-emerald-500",
        )}
      />
    </span>
  )
}

export function NotionSyncIndicator({
  status,
  lastSyncTime,
  onClick,
  disabled = false,
  className,
}: NotionSyncIndicatorProps) {
  const tooltipText = (() => {
    switch (status) {
      case "syncing":
        return "Syncing with Notion..."
      case "error":
        return "Sync failed — click to retry"
      case "success":
        return lastSyncTime ? `Synced ${formatTimeAgo(lastSyncTime)}` : "Synced"
      default:
        return lastSyncTime
          ? `Last synced ${formatTimeAgo(lastSyncTime)} — click to sync`
          : "Sync to Notion"
    }
  })()

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || status === "syncing"}
      title={tooltipText}
      variant="ghost"
      size="icon-sm"
      className={cn(
        "relative",
        status === "syncing"
          ? "text-primary"
          : status === "error"
            ? "text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            : status === "success"
              ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              : "text-muted-foreground/50 hover:bg-background/65 hover:text-muted-foreground",
        className,
      )}
      aria-label={tooltipText}
    >
      <NotionLogo className={cn("h-4 w-4", status === "syncing" && "animate-pulse motion-reduce:animate-none")} />
      <StatusDot status={status} />
    </Button>
  )
}
