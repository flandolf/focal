import { useEffect, useCallback, useRef } from "react"

interface ShortcutHandlers {
  onSearch?: () => void
  onNewAssessment?: () => void
  onNewEvent?: () => void
  onNewSession?: () => void
  onGoHome?: () => void
  onGoAnalytics?: () => void
  onToggleSidebar?: () => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const isInputFocused = useCallback(() => {
    const el = document.activeElement
    if (!el) return false
    const tag = el.tagName.toLowerCase()
    return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      // Cmd/Ctrl + K: Search
      if (meta && key === "k") {
        e.preventDefault()
        handlersRef.current.onSearch?.()
        return
      }

      // Cmd/Ctrl + N: New assessment
      if (meta && key === "n" && !e.shiftKey) {
        e.preventDefault()
        handlersRef.current.onNewAssessment?.()
        return
      }

      // Cmd/Ctrl + Shift + N: New event
      if (meta && key === "n" && e.shiftKey) {
        e.preventDefault()
        handlersRef.current.onNewEvent?.()
        return
      }

      // Cmd/Ctrl + Shift + S: New study session
      if (meta && key === "s" && e.shiftKey) {
        e.preventDefault()
        handlersRef.current.onNewSession?.()
        return
      }

      // Don't handle single-key shortcuts when typing in inputs
      if (isInputFocused()) return

      // H: Go home
      if (key === "h" && !meta && !e.altKey && !e.shiftKey) {
        handlersRef.current.onGoHome?.()
        return
      }

      // A: Go analytics
      if (key === "a" && !meta && !e.altKey && !e.shiftKey) {
        handlersRef.current.onGoAnalytics?.()
        return
      }

      // [ : Toggle sidebar
      if (key === "[" && !meta && !e.altKey && !e.shiftKey) {
        handlersRef.current.onToggleSidebar?.()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isInputFocused])
}
