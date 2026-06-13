import { useState } from "react"
import { LogOut, Mail, UserPlus, RefreshCw, WifiOff, Clock, AlertTriangle, CheckCircle2, UploadCloud, CloudCog, Flame, Download, Trash2, RotateCw, GitMerge, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SETTINGS_SECTION_CLASS } from "@/components/settings/constants"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import type { SyncStatusSnapshot } from "@/lib/sync/types"

interface AccountSectionProps {
  configured: boolean
  email?: string
  loading: boolean
  error: string | null
  sync: SyncStatusSnapshot
  onSignIn: (email: string, password: string) => Promise<unknown>
  onSignUp: (email: string, password: string) => Promise<unknown>
  onSignOut: () => Promise<void>
  onRetrySync?: () => void
  onPullNow?: () => void
  onPushNow?: () => void
  onClearFailedItems?: () => void
  onRetryFailedItem?: (table: string, rowId: string) => void
  onDropFailedItem?: (table: string, rowId: string) => void
  onForcePushAndMerge?: () => void
  onForcePushAndOverwrite?: () => void
  onAcceptRemote?: (table: string, rowId: string) => void
  onKeepLocal?: (table: string, rowId: string) => void
  onDismissConflict?: (table: string, rowId: string) => void
  onClearConflicts?: () => void
}

function SyncStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; icon: typeof CheckCircle2; label: string }> = {
    synced: { color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2, label: "Synced" },
    syncing: { color: "text-primary bg-primary/10 border-primary/20", icon: RefreshCw, label: "Syncing..." },
    pending: { color: "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20", icon: Clock, label: "Pending" },
    error: { color: "text-destructive bg-destructive/10 border-destructive/20", icon: AlertTriangle, label: "Error" },
    "signed-out": { color: "text-muted-foreground bg-muted/25 border-border", icon: Clock, label: "Signed out" },
  }
  const config = configs[status] ?? configs["signed-out"]
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption font-medium ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
  } catch {
    return iso
  }
}

export function AccountSection({
  configured,
  email,
  loading,
  error,
  sync,
  onSignIn,
  onSignUp,
  onSignOut,
  onRetrySync,
  onPullNow,
  onPushNow,
  onClearFailedItems,
  onRetryFailedItem,
  onDropFailedItem,
  onForcePushAndMerge,
  onForcePushAndOverwrite,
  onAcceptRemote,
  onKeepLocal,
  onDismissConflict,
  onClearConflicts,
}: AccountSectionProps) {
  const [formEmail, setFormEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [formError, setFormError] = useState<string | null>(null)
  const [showForcePush, setShowForcePush] = useState(false)

  const submit = async () => {
    setFormError(null)
    try {
      if (mode === "sign-in") {
        await onSignIn(formEmail.trim(), password)
      } else {
        await onSignUp(formEmail.trim(), password)
      }
      setPassword("")
    } catch (e) {
      setFormError(String(e))
    }
  }

  return (
    <section className={SETTINGS_SECTION_CLASS}>
      <div>
        <h2 className="text-sm font-medium">Account Sync</h2>
        <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
          Supabase is Focal's app-owned multi-device sync. Local-only mode still works when signed out.
        </p>
      </div>

      {!configured ? (
        <p className="mt-4 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable account sync.
        </p>
      ) : email ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{email}</p>
            <SyncStatusBadge status={sync.isOnline === false ? "error" : sync.status} />
          </div>

          {/* Sync status detail */}
          <div className="mt-2 space-y-1.5">
            {sync.isOnline === false && (
              <p className="text-caption text-amber-500 inline-flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                Offline — sync paused until connection is restored
              </p>
            )}
            {sync.status === "error" && sync.error && sync.isOnline && (
              <p className="text-caption text-destructive">{sync.error}</p>
            )}
            {sync.status === "pending" && (
              <p className="text-caption text-muted-foreground">
                {sync.pendingCount} local change{sync.pendingCount === 1 ? "" : "s"} queued for next sync
                {sync.details ? ` (${sync.details})` : ""}
              </p>
            )}
            {sync.status === "syncing" && sync.details && (
              <p className="text-caption text-muted-foreground">{sync.details}</p>
            )}
            {sync.lastSuccessfulSyncAt && (
              <p className="text-caption text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last successful sync: {formatDateTime(sync.lastSuccessfulSyncAt)}
              </p>
            )}
          </div>

          {/* Table stats grid */}
          {sync.tableStats && sync.tableStats.length > 0 && (
            <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
              {sync.tableStats.map((stat) => (
                <div
                  key={stat.table}
                  className="rounded-md border border-border/60 bg-background/50 px-2 py-1.5"
                >
                  <p className="text-[11px] font-medium text-muted-foreground capitalize">{stat.table.replace("_", " ")}</p>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-caption">
                    {stat.pulled !== undefined && stat.pulled > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">{stat.pulled} pulled</span>
                    )}
                    {stat.pushed !== undefined && stat.pushed > 0 && (
                      <span className="text-primary">{stat.pushed} pushed</span>
                    )}
                    {stat.failed !== undefined && stat.failed > 0 && (
                      <span className="text-destructive">{stat.failed} failed</span>
                    )}
                    {(stat.pulled === 0 || stat.pulled === undefined) &&
                      (stat.pushed === 0 || stat.pushed === undefined) &&
                      (stat.failed === 0 || stat.failed === undefined) && (
                      <span className="text-muted-foreground/50">No changes</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Failed items with actions */}
          {sync.failedItems && sync.failedItems.length > 0 && (
            <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption text-destructive font-medium inline-flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {sync.failedItems.length} failed item{sync.failedItems.length === 1 ? "" : "s"}
                </p>
                {onClearFailedItems && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-caption text-destructive/70 hover:text-destructive"
                    onClick={() => onClearFailedItems()}
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear all
                  </Button>
                )}
              </div>
              <ul className="mt-1 space-y-1">
                {sync.failedItems.map((item, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded bg-background/40 px-2 py-1">
                    <span className="text-caption text-destructive/80 min-w-0 truncate">
                      <span className="font-medium capitalize">{item.table.replace("_", " ")}</span>{" "}
                      <code className="rounded bg-background/60 px-1 font-mono text-[10px]">{item.rowId.slice(0, 8)}</code>
                      {item.error && ` — ${item.error}`}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {onRetryFailedItem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          title="Retry this item"
                          onClick={() => onRetryFailedItem(item.table, item.rowId)}
                        >
                          <RotateCw className="h-3 w-3" />
                        </Button>
                      )}
                      {onDropFailedItem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive/50 hover:text-destructive"
                          title="Drop this item"
                          onClick={async () => {
                            const confirmed = await confirmDestructiveAction({
                              title: "Drop this sync item?",
                              description: `This permanently removes the failed ${item.table.replace("_", " ")} item from the sync queue. Local data is not affected.`,
                              actionLabel: "Drop",
                            })
                            if (confirmed) onDropFailedItem(item.table, item.rowId)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}


          {/* Sync conflicts */}
          {sync.conflicts && sync.conflicts.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-caption text-amber-700 dark:text-amber-400 font-medium inline-flex items-center gap-1">
                  <GitMerge className="h-3 w-3" />
                  {sync.conflicts.length} conflict{sync.conflicts.length === 1 ? "" : "s"} detected
                </p>
                {onClearConflicts && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-caption text-amber-700/70 dark:text-amber-400/70 hover:text-amber-700"
                    onClick={() => onClearConflicts()}
                  >
                    <X className="h-3 w-3" />
                    Dismiss all
                  </Button>
                )}
              </div>
              <p className="mt-1 text-caption text-amber-700/70 dark:text-amber-400/70">
                Items were modified on both this device and another. Choose which version to keep.
              </p>
              <ul className="mt-2 space-y-1.5">
                {sync.conflicts.map((conflict, i) => (
                  <li key={i} className="rounded bg-background/40 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-caption font-medium truncate">{conflict.label}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {onKeepLocal && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 text-caption border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-700"
                          onClick={() => onKeepLocal(conflict.table, conflict.rowId)}
                        >
                          <UploadCloud className="h-3 w-3" />
                          Keep local
                        </Button>
                      )}
                      {onAcceptRemote && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 text-caption border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-700"
                          onClick={() => onAcceptRemote(conflict.table, conflict.rowId)}
                        >
                          <Download className="h-3 w-3" />
                          Accept remote
                        </Button>
                      )}
                      {onDismissConflict && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 text-caption text-muted-foreground hover:text-foreground"
                          onClick={() => onDismissConflict(conflict.table, conflict.rowId)}
                        >
                          <X className="h-3 w-3" />
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Manual sync actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {onPullNow && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-caption"
                onClick={() => void onPullNow()}
                disabled={loading || sync.status === "syncing"}
              >
                <Download className="h-3 w-3" />
                Pull now
              </Button>
            )}
            {onPushNow && sync.pendingCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-caption"
                onClick={() => void onPushNow()}
                disabled={loading || sync.status === "syncing"}
              >
                <UploadCloud className="h-3 w-3" />
                Push {sync.pendingCount} pending
              </Button>
            )}
            {sync.status === "error" && sync.isOnline && onRetrySync && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-caption"
                onClick={() => void onRetrySync()}
                disabled={loading || (sync.status as string) === "syncing"}
              >
                <RefreshCw className="h-3 w-3" />
                Retry sync
              </Button>
            )}
          </div>

          {/* Force push controls */}
          <div className="mt-4 border-t border-border/40 pt-3">
            <button
              type="button"
              onClick={() => setShowForcePush((v) => !v)}
              className="flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground transition-colors"
            >
              <CloudCog className="h-3 w-3" />
              {showForcePush ? "Hide force push options" : "Force push options"}
            </button>
            {showForcePush && (
              <div className="mt-2 space-y-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                <p className="text-caption text-amber-700 dark:text-amber-400">
                  Use these when data on this device is not reaching other devices. Both operations push everything from this machine to Supabase.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-caption border-amber-500/30 hover:bg-amber-500/10"
                    onClick={async () => {
                      const confirmed = await confirmDestructiveAction({
                        title: "Force push & merge?",
                        description: "This pushes ALL local data to Supabase, then pulls remote data back to merge. Any pending queued changes will be dropped and re-queued. Use this when you want this device to win but still keep any remote-only items.",
                        actionLabel: "Push & Merge",
                      })
                      if (confirmed) void onForcePushAndMerge?.()
                    }}
                    disabled={loading || sync.status === "syncing"}
                  >
                    <UploadCloud className="h-3 w-3" />
                    Push & Merge
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-caption border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={async () => {
                      const confirmed = await confirmDestructiveAction({
                        title: "Force push & overwrite?",
                        description: "This pushes ALL local data to Supabase and overwrites remote data for items that exist locally. Any pending queued changes will be dropped and re-queued. Remote-only items that don't exist locally are untouched.",
                        actionLabel: "Push & Overwrite",
                      })
                      if (confirmed) void onForcePushAndOverwrite?.()
                    }}
                    disabled={loading || sync.status === "syncing"}
                  >
                    <Flame className="h-3 w-3" />
                    Push & Overwrite
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <Button variant="outline" size="sm" className="gap-1.5" disabled={loading} onClick={() => void onSignOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2">
            <Input
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={formEmail}
              onChange={(event) => setFormEmail(event.target.value)}
            />
            <Input
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {(formError ?? error) && (
            <p className="text-caption text-destructive">{formError ?? error}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" disabled={loading} onClick={() => void submit()}>
              {mode === "sign-in" ? <Mail className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
            >
              {mode === "sign-in" ? "Need an account?" : "Have an account?"}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
