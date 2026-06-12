import { AlertCircle, CheckCircle2, CloudOff, Loader2, UploadCloud } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SyncStatusSnapshot } from "@/lib/sync/types"

interface SupabaseSyncIndicatorProps {
  sync: SyncStatusSnapshot
  signedIn: boolean
}

export function SupabaseSyncIndicator({ sync, signedIn }: SupabaseSyncIndicatorProps) {
  const Icon = !signedIn
    ? CloudOff
    : sync.status === "syncing"
      ? Loader2
      : sync.status === "error"
        ? AlertCircle
        : sync.status === "pending"
          ? UploadCloud
          : CheckCircle2

  const label = !signedIn
    ? "Supabase signed out"
    : sync.status === "syncing"
      ? "Supabase syncing"
      : sync.status === "error"
        ? "Supabase sync error"
        : sync.status === "pending"
          ? `${sync.pendingCount} pending sync change${sync.pendingCount === 1 ? "" : "s"}`
          : "Supabase synced"

  return (
    <div
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-lg px-2 text-caption text-muted-foreground",
        "bg-background/45 ring-1 ring-border/60",
        sync.status === "error" && signedIn ? "text-destructive ring-destructive/35" : null,
      )}
      aria-label={label}
      title={sync.error ?? label}
    >
      <Icon className={cn("h-3.5 w-3.5", sync.status === "syncing" && signedIn ? "animate-spin" : null)} />
      <span className="hidden max-w-24 truncate min-[1100px]:inline">{label}</span>
    </div>
  )
}

