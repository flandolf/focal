import { createPortal } from "react-dom"
import { CheckCircle2, Play, Timer, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface RecoveryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  onResume: () => void
  onFinish: () => void
  onDiscard: () => void
}

export function RecoveryDialog({
  open,
  onOpenChange,
  sessionId,
  onResume,
  onFinish,
  onDiscard,
}: RecoveryDialogProps) {
  void sessionId
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-background p-5">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Timer className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-heading text-lg font-semibold">Recover Study Session</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          You had an active Pomodoro session when the app was closed. What would you like to do?
        </p>
        <div className="mt-6 space-y-2">
          <Button
            onClick={() => { onResume(); onOpenChange(false) }}
            className="w-full justify-start gap-2 text-primary-foreground"
            variant="default"
          >
            <Play className="h-4 w-4" />
            Resume session
          </Button>
          <Button
            onClick={() => { onFinish(); onOpenChange(false) }}
            className="w-full justify-start gap-2"
            variant="outline"
          >
            <CheckCircle2 className="h-4 w-4" />
            Finish and save
          </Button>
          <Button
            onClick={() => { onDiscard(); onOpenChange(false) }}
            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
            Discard session
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
