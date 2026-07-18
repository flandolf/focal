import { useState, useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  LogOut,
  Mail,
  UserPlus,
  RefreshCw,
  WifiOff,
  Clock,
  AlertTriangle,
  UploadCloud,
  CloudCog,
  Flame,
  Download,
  Trash2,
  RotateCw,
  GitMerge,
  X,
  Sparkles,
  Cloud,
  Shield,
  Layers,
  ChevronDown,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import type { SyncStatusSnapshot, SyncStatus } from "@/lib/sync/types"

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

// Quiet status pill: small dot + label, no tinted background by default.
function StatusPill({ status, online }: { status: SyncStatus; online: boolean }) {
  const effective: SyncStatus = online === false ? "error" : status
  const config: Record<SyncStatus, { dot: string; label: string }> = {
    synced: { dot: "bg-emerald-500", label: "Synced" },
    syncing: { dot: "bg-primary motion-safe:animate-pulse", label: "Syncing…" },
    pending: { dot: "bg-amber-500", label: "Pending" },
    error: { dot: "bg-destructive", label: "Error" },
    "signed-out": { dot: "bg-muted-foreground/40", label: "Signed out" },
  }
  const { dot, label } = config[effective]
  return (
    <span className="inline-flex items-center gap-1.5 text-micro font-medium text-muted-foreground/85">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden="true" />
      {label}
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

/** Minimal password strength — not zxcvbn; 0..4 from length + variety. */
function passwordStrength(value: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!value) return { score: 0, label: "" }
  let score = 0
  if (value.length >= 8) score++
  if (value.length >= 12) score++
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score++
  const labels = ["", "Weak", "Okay", "Strong", "Excellent"] as const
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] }
}

function StrengthMeter({ value }: { value: string }) {
  const { score, label } = useMemo(() => passwordStrength(value), [value])
  if (!value) return null
  const width = `${((score + 1) / 5) * 100}%`
  const color =
    score <= 1
      ? "bg-destructive"
      : score === 2
        ? "bg-amber-500"
        : "bg-emerald-500"
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-foreground/8">
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", color)}
          initial={false}
          animate={{ width }}
          transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.65 }}
        />
      </div>
      <span className="shrink-0 text-micro font-medium text-muted-foreground/80">{label}</span>
    </div>
  )
}

function WelcomeCard({ configured }: { configured: boolean }) {
  const reduceMotion = useReducedMotion()
  const features: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: Layers,
      title: "Projects, events, sessions",
      body: "Everything in Focal follows you across machines.",
    },
    {
      icon: Shield,
      title: "App-owned, no third parties",
      body: "Stored in your own Supabase project. End-to-end yours.",
    },
    {
      icon: Cloud,
      title: "Local-first when signed out",
      body: "Sync is opt-in. Without an account, Focal still works.",
    },
  ]
  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">Sync your work between devices</p>
          <p className="mt-1 text-xs text-muted-foreground/80 text-wrap-balance">
            Sign in to keep projects, events, and study sessions in lockstep on every machine you use.
            Local-only mode still works without an account.
          </p>
        </div>
      </div>
      <motion.ul
        initial={reduceMotion ? false : "initial"}
        animate="animate"
        variants={{
          initial: {},
          animate: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
        }}
        className="mt-3 grid gap-1"
      >
        {features.map((feature) => {
          const Icon = feature.icon
          return (
            <motion.li
              key={feature.title}
              variants={{
                initial: { opacity: 0, y: 3 },
                animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } },
              }}
              className="flex items-start gap-2 px-1.5 py-1"
            >
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              <div className="min-w-0">
                <p className="text-caption font-medium leading-tight">{feature.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70 text-wrap-balance">
                  {feature.body}
                </p>
              </div>
            </motion.li>
          )
        })}
      </motion.ul>
      {!configured && (
        <p className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 text-wrap-balance">
          Set <code className="font-mono text-[10px]">VITE_SUPABASE_URL</code> and{" "}
          <code className="font-mono text-[10px]">VITE_SUPABASE_PUBLISHABLE_KEY</code> to enable account sync in this build.
        </p>
      )}
    </div>
  )
}

function AuthForm({
  configured,
  loading,
  error,
  onSignIn,
  onSignUp,
}: {
  configured: boolean
  loading: boolean
  error: string | null
  onSignIn: (email: string, password: string) => Promise<unknown>
  onSignUp: (email: string, password: string) => Promise<unknown>
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [formEmail, setFormEmail] = useState("")
  const [password, setPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail.trim()),
    [formEmail],
  )
  // Only enforce length on sign-up; existing accounts may have shorter passwords.
  const passwordValid = mode === "sign-up" ? password.length >= 8 : password.length > 0
  const canSubmit = emailValid && passwordValid && !loading && configured

  const clearFormError = () => {
    if (formError) setFormError(null)
  }

  const handleEmailChange = (value: string) => {
    setFormEmail(value)
    clearFormError()
  }
  const handlePasswordChange = (value: string) => {
    setPassword(value)
    clearFormError()
  }

  const submit = async () => {
    setTouched(true)
    if (!emailValid || !passwordValid) return
    setFormError(null)
    try {
      if (mode === "sign-in") {
        await onSignIn(formEmail.trim(), password)
      } else {
        await onSignUp(formEmail.trim(), password)
      }
      setPassword("")
      setTouched(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/30 p-3.5">
      <div
        role="tablist"
        aria-label="Authentication mode"
        className="inline-flex w-full rounded-md border border-border/60 bg-background/40 p-0.5"
      >
        <Button
          type="button"
          role="tab"
          aria-selected={mode === "sign-in"}
          onClick={() => setMode("sign-in")}
          variant={mode === "sign-in" ? "secondary" : "ghost"}
          size="sm"
          className="flex-1"
        >
          <Mail className="h-3 w-3" />
          Sign in
        </Button>
        <Button
          type="button"
          role="tab"
          aria-selected={mode === "sign-up"}
          onClick={() => setMode("sign-up")}
          variant={mode === "sign-up" ? "secondary" : "ghost"}
          size="sm"
          className="flex-1"
        >
          <UserPlus className="h-3 w-3" />
          Create account
        </Button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="mt-3 grid gap-2.5"
      >
        <div>
          <label
            htmlFor="auth-email"
            className="text-caption font-medium text-muted-foreground/85"
          >
            Email
          </label>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@school.edu"
            value={formEmail}
            onChange={(event) => handleEmailChange(event.target.value)}
            aria-invalid={touched && !emailValid}
            className="mt-1 h-9"
          />
          {touched && !emailValid && (
            <p className="mt-1 text-[11px] text-destructive">Use a valid email address.</p>
          )}
        </div>
        <div>
          <label
            htmlFor="auth-password"
            className="text-caption font-medium text-muted-foreground/85"
          >
            Password
          </label>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            placeholder={mode === "sign-in" ? "Your password" : "8+ characters"}
            value={password}
            onChange={(event) => handlePasswordChange(event.target.value)}
            aria-invalid={touched && !passwordValid}
            className="mt-1 h-9"
          />
          <StrengthMeter value={password} />
        </div>
        {(formError ?? error) && (
          <p className="text-caption text-destructive" role="alert">
            {formError ?? error}
          </p>
        )}
        <Button
          type="submit"
          size="sm"
          className="mt-1 h-9 gap-1.5"
          disabled={!canSubmit}
        >
          {mode === "sign-in" ? (
            <>
              <Mail className="h-3.5 w-3.5" />
              Sign in
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" />
              Create account
            </>
          )}
        </Button>
        <p className="text-[11px] text-muted-foreground/70 text-wrap-balance">
          {mode === "sign-in"
            ? "New to Focal? Switch tabs to create an account on the same form."
            : "Already have an account? Switch tabs to sign in."}
        </p>
      </form>
    </div>
  )
}

/**
 * Aggregated counts from `tableStats`, collapsing the per-table grid into
 * three headline numbers. Returns `null` when there is nothing meaningful to show.
 */
function aggregateActivity(tableStats: SyncStatusSnapshot["tableStats"]) {
  if (!tableStats) return null
  let pulled = 0
  let pushed = 0
  let failed = 0
  let any = false
  for (const stat of tableStats) {
    if (stat.pulled) { pulled += stat.pulled; any = true }
    if (stat.pushed) { pushed += stat.pushed; any = true }
    if (stat.failed) { failed += stat.failed; any = true }
  }
  if (!any) return null
  return { pulled, pushed, failed }
}

function FailedItemRow({
  item,
  onRetry,
  onDrop,
}: {
  item: { table: string; rowId: string; error: string }
  onRetry?: (table: string, rowId: string) => void
  onDrop?: (table: string, rowId: string) => void
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded bg-background/40 px-2 py-1">
      <span className="text-caption text-destructive/80 min-w-0 truncate">
        <span className="font-medium capitalize">{item.table.replace("_", " ")}</span>{" "}
        <code className="rounded bg-background/60 px-1 font-mono text-[10px]">{item.rowId.slice(0, 8)}</code>
        {item.error && ` — ${item.error}`}
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {onRetry && (
          <Button
            variant="ghost"
            size="icon-xs"
            title="Retry this item"
            aria-label="Retry this item"
            onClick={() => onRetry(item.table, item.rowId)}
          >
            <RotateCw className="h-3 w-3" />
          </Button>
        )}
        {onDrop && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-destructive/50 hover:text-destructive"
            title="Drop this item"
            aria-label="Drop this item"
            onClick={async () => {
              const confirmed = await confirmDestructiveAction({
                title: "Drop this sync item?",
                description: `This permanently removes the failed ${item.table.replace("_", " ")} item from the sync queue. Local data is not affected.`,
                actionLabel: "Drop",
              })
              if (confirmed) onDrop(item.table, item.rowId)
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </span>
    </li>
  )
}

function ConflictRow({
  conflict,
  onKeepLocal,
  onAcceptRemote,
  onDismiss,
}: {
  conflict: { table: string; rowId: string; label: string }
  onKeepLocal?: (table: string, rowId: string) => void
  onAcceptRemote?: (table: string, rowId: string) => void
  onDismiss?: (table: string, rowId: string) => void
}) {
  return (
    <li className="rounded bg-background/40 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium truncate">{conflict.label}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {onKeepLocal && (
          <Button
            variant="outline"
            size="xs"
            className="gap-1 text-caption border-emerald-500/30 hover:bg-success/15 hover:text-success"
            onClick={() => onKeepLocal(conflict.table, conflict.rowId)}
          >
            <UploadCloud className="h-3 w-3" />
            Keep local
          </Button>
        )}
        {onAcceptRemote && (
          <Button
            variant="outline"
            size="xs"
            className="gap-1 text-caption border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-700"
            onClick={() => onAcceptRemote(conflict.table, conflict.rowId)}
          >
            <Download className="h-3 w-3" />
            Accept remote
          </Button>
        )}
        {onDismiss && (
          <Button
            variant="ghost"
            size="xs"
            className="gap-1 text-caption text-muted-foreground hover:text-foreground"
            onClick={() => onDismiss(conflict.table, conflict.rowId)}
          >
            <X className="h-3 w-3" />
            Dismiss
          </Button>
        )}
      </div>
    </li>
  )
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
  const [showForcePush, setShowForcePush] = useState(false)

  const failedCount = sync.failedItems?.length ?? 0
  const conflictCount = sync.conflicts?.length ?? 0
  const hasIssues = failedCount + conflictCount > 0
  const activity = aggregateActivity(sync.tableStats)
  const offline = sync.isOnline === false
  const showError = sync.status === "error" && !!sync.error && !offline

  return (
    <div className="flex flex-col gap-3">
      {!email ? <WelcomeCard configured={configured} /> : null}

      {!configured ? (
        <p className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-caption text-muted-foreground">
          Sync is disabled in this build. Set the Supabase environment variables to enable it.
        </p>
      ) : email ? (
        <section className="rounded-lg border bg-card p-4">
          {/* Header: identity + quiet status */}
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium">{email}</p>
            <StatusPill status={sync.status} online={sync.isOnline !== false} />
          </div>

          {/* Subline: pending + last sync, one row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground/80">
            {sync.status === "pending" && (
              <span>
                {sync.pendingCount} local change{sync.pendingCount === 1 ? "" : "s"} queued
                {sync.details ? ` · ${sync.details}` : ""}
              </span>
            )}
            {sync.status === "syncing" && sync.details && (
              <span>{sync.details}</span>
            )}
            {sync.lastSuccessfulSyncAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last synced {formatDateTime(sync.lastSuccessfulSyncAt)}
              </span>
            )}
            {sync.status === "synced" && !sync.lastSuccessfulSyncAt && (
              <span className="text-muted-foreground/60">No sync history yet</span>
            )}
          </div>

          {/* Alerts: offline or error (single slot) */}
          {(offline || showError) && (
            <div
              className={cn(
                "mt-3 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-caption",
                offline
                  ? "border-amber-500/25 bg-amber-500/[0.06] text-amber-700 dark:text-amber-400"
                  : "border-destructive/25 bg-destructive/[0.06] text-destructive",
              )}
              role={showError ? "alert" : "status"}
            >
              {offline ? (
                <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                {offline
                  ? "Offline — sync is paused until your connection is back."
                  : sync.error}
              </span>
            </div>
          )}

          {/* Activity summary — collapsed to one row of headline numbers */}
          {activity && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-caption">
              <span className="text-muted-foreground/65">This sync</span>
              {activity.pulled > 0 && (
                <span className="inline-flex items-center gap-1 text-success">
                  <Download className="h-3 w-3" />
                  <span className="tabular-nums">{activity.pulled}</span> pulled
                </span>
              )}
              {activity.pushed > 0 && (
                <span className="inline-flex items-center gap-1 text-primary">
                  <UploadCloud className="h-3 w-3" />
                  <span className="tabular-nums">{activity.pushed}</span> pushed
                </span>
              )}
              {activity.failed > 0 && (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="tabular-nums">{activity.failed}</span> failed
                </span>
              )}
            </div>
          )}

          {/* Unified issues block: failed items + conflicts */}
          {hasIssues && (
            <div
              className={cn(
                "mt-3 rounded-lg border px-2.5 py-2",
                conflictCount > 0
                  ? "border-amber-500/25 bg-amber-500/[0.05]"
                  : "border-destructive/25 bg-destructive/[0.05]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    "text-caption font-medium inline-flex items-center gap-1.5",
                    conflictCount > 0
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-destructive",
                  )}
                >
                  {conflictCount > 0 ? (
                    <GitMerge className="h-3 w-3" />
                  ) : (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {conflictCount > 0 && failedCount > 0
                    ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"} · ${failedCount} failed item${failedCount === 1 ? "" : "s"}`
                    : conflictCount > 0
                      ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"} detected`
                      : `${failedCount} failed item${failedCount === 1 ? "" : "s"}`}
                </p>
                <div className="flex items-center gap-1">
                  {conflictCount > 0 && onClearConflicts && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="gap-1 text-caption text-amber-700/70 dark:text-amber-400/70 hover:text-amber-700"
                      onClick={onClearConflicts}
                    >
                      <X className="h-3 w-3" />
                      Dismiss all
                    </Button>
                  )}
                  {failedCount > 0 && onClearFailedItems && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="gap-1 text-caption text-destructive/70 hover:text-destructive"
                      onClick={onClearFailedItems}
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear all
                    </Button>
                  )}
                </div>
              </div>

              {conflictCount > 0 && (
                <p className="mt-1.5 text-xs text-amber-700/80 dark:text-amber-400/80 text-wrap-balance">
                  Items were modified on this device and another. Choose which version to keep.
                </p>
              )}

              <ul className="mt-2 space-y-1.5">
                {sync.conflicts?.map((conflict) => (
                  <ConflictRow
                    key={`c-${conflict.table}-${conflict.rowId}`}
                    conflict={conflict}
                    onKeepLocal={onKeepLocal}
                    onAcceptRemote={onAcceptRemote}
                    onDismiss={onDismissConflict}
                  />
                ))}
                {sync.failedItems?.map((item) => (
                  <FailedItemRow
                    key={`f-${item.table}-${item.rowId}`}
                    item={item}
                    onRetry={onRetryFailedItem}
                    onDrop={onDropFailedItem}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* Manual actions — flat row */}
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
            {sync.status === "error" && !offline && onRetrySync && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-caption"
                onClick={() => void onRetrySync()}
                disabled={loading}
              >
                <RefreshCw className="h-3 w-3" />
                Retry sync
              </Button>
            )}
          </div>

          {/* Force push — collapsed, separated, destructive intent visible */}
          <div className="mt-4 border-t border-border/40 pt-3">
            <Button
              type="button"
              onClick={() => setShowForcePush((v) => !v)}
              aria-expanded={showForcePush}
              variant="ghost"
              size="sm"
            >
              <CloudCog className="h-3 w-3" />
              {showForcePush ? "Hide force push options" : "Force push options"}
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform duration-200 ease-out",
                  showForcePush && "rotate-180",
                )}
                aria-hidden="true"
              />
            </Button>
            {showForcePush && (
              <div className="mt-2 space-y-2 rounded-md border border-amber-500/25 bg-amber-500/[0.05] px-3 py-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-400 text-wrap-balance">
                  Use these when data on this device is not reaching other devices. Both operations push
                  everything from this machine to Supabase.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-caption border-amber-500/30 hover:bg-amber-500/10"
                    onClick={async () => {
                      const confirmed = await confirmDestructiveAction({
                        title: "Force push & merge?",
                        description:
                          "This pushes ALL local data to Supabase, then pulls remote data back to merge. Any pending queued changes will be dropped and re-queued. Use this when you want this device to win but still keep any remote-only items.",
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
                    className="h-7 gap-1 text-caption border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={async () => {
                      const confirmed = await confirmDestructiveAction({
                        title: "Force push & overwrite?",
                        description:
                          "This pushes ALL local data to Supabase and overwrites remote data for items that exist locally. Any pending queued changes will be dropped and re-queued. Remote-only items that don't exist locally are untouched.",
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

          {/* Sign out — separated */}
          <div className="mt-4 border-t border-border/40 pt-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading}
              onClick={() => void onSignOut()}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </section>
      ) : (
        <AuthForm
          configured={configured}
          loading={loading}
          error={error}
          onSignIn={onSignIn}
          onSignUp={onSignUp}
        />
      )}
    </div>
  )
}
