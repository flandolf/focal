import { useState } from "react"
import { LogOut, Mail, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SETTINGS_SECTION_CLASS } from "@/components/settings/constants"
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
}: AccountSectionProps) {
  const [formEmail, setFormEmail] = useState("")
  const [password, setPassword] = useState("")
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [formError, setFormError] = useState<string | null>(null)

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
        <p className="mt-1 text-caption text-muted-foreground/70">
          Supabase is Focal's app-owned multi-device sync. Local-only mode still works when signed out.
        </p>
      </div>

      {!configured ? (
        <p className="mt-4 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable account sync.
        </p>
      ) : email ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border/70 bg-background/35 px-3 py-2">
            <p className="text-sm font-medium">{email}</p>
            <p className="mt-1 text-caption text-muted-foreground">
              {sync.status === "error"
                ? sync.error ?? "Sync error"
                : sync.status === "pending"
                  ? `${sync.pendingCount} pending local change${sync.pendingCount === 1 ? "" : "s"}`
                  : sync.status}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={loading} onClick={() => void onSignOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
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
