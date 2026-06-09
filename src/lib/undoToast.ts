import { toast } from "sonner"

interface UndoableActionOptions {
  message: string
  undoLabel?: string
  duration?: number
  onUndo: () => void | Promise<void>
}

export function showUndoToast({
  message,
  undoLabel = "Undo",
  duration = 8000,
  onUndo,
}: UndoableActionOptions) {
  let undone = false

  toast.success(message, {
    duration,
    action: {
      label: undoLabel,
      onClick: () => {
        if (undone) return
        undone = true
        void onUndo()
      },
    },
  })
}
