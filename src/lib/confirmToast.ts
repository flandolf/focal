import { toast } from "sonner"

interface ConfirmActionOptions {
  title: string
  description?: string
  actionLabel: string
  cancelLabel?: string
  duration?: number
}

export function confirmDestructiveAction({
  title,
  description,
  actionLabel,
  cancelLabel = "Keep",
  duration = 10000,
}: ConfirmActionOptions) {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const toastId = `confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const settle = (confirmed: boolean) => {
      if (settled) return
      settled = true
      toast.dismiss(toastId)
      resolve(confirmed)
    }

    toast.warning(title, {
      id: toastId,
      description,
      duration,
      action: {
        label: actionLabel,
        onClick: () => settle(true),
      },
      cancel: {
        label: cancelLabel,
        onClick: () => settle(false),
      },
      onDismiss: () => settle(false),
      onAutoClose: () => settle(false),
    })
  })
}
