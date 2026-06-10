import { Component, type ErrorInfo, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { AlertTriangle, RotateCcw, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  REDUCED_TRANSITION,
  staggerContainer,
  staggerItem,
} from "@/lib/motion"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  /** Monotonic counter — increments on reset so consumers can also remount. */
  resetKey: number
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, resetKey: 0 }

  static getDerivedStateFromError(error: Error): Pick<ErrorBoundaryState, "hasError" | "error"> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surfaced for the developer console. Wire a telemetry sink here later.
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1,
    }))
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          key={this.state.resetKey}
          error={this.state.error}
          onReset={this.handleReset}
          onReload={this.handleReload}
        />
      )
    }
    return this.props.children
  }
}

interface ErrorFallbackProps {
  error: Error | null
  onReset: () => void
  onReload: () => void
}

function ErrorFallback({ error, onReset, onReload }: ErrorFallbackProps) {
  const reduceMotion = useReducedMotion() === true
  const message = error?.message ?? "An unknown error occurred."
  // Show full stack in dev only — production surfaces the message and lets the
  // user dig into devtools if they need to.
  const showStack = import.meta.env.DEV && Boolean(error?.stack)

  return (
    <div className="focal-shell relative h-screen w-full overflow-hidden px-2 pb-2 pt-(--app-titlebar-inset) text-foreground min-[1200px]:px-3 min-[1200px]:pb-3">
      <div
        data-tauri-drag-region
        className="app-titlebar-drag-region absolute inset-x-0 top-0 z-20"
        aria-hidden
      />
      <div className="hairline-grid pointer-events-none absolute inset-0 opacity-80" aria-hidden />
      <motion.div
        role="alert"
        aria-live="assertive"
        className="glass-panel relative z-10 mx-auto flex h-full w-full max-w-md flex-col items-center justify-center rounded-2xl px-6 py-10 text-center min-[1200px]:rounded-[1.35rem]"
        variants={staggerContainer(0.08, 0.1)}
        initial="initial"
        animate="animate"
      >
        <motion.div
          variants={staggerItem}
          className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive"
        >
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </motion.div>
        <motion.h1
          variants={staggerItem}
          className="font-heading text-xl font-semibold tracking-tight"
        >
          Something went wrong
        </motion.h1>
        <motion.p
          variants={staggerItem}
          className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
        >
          Focal hit an unexpected error and the current view couldn't recover. Your data is safe on disk, so try again, or reload the app if the problem persists.
        </motion.p>
        <motion.div
          variants={staggerItem}
          className="mt-6 flex w-full max-w-xs flex-col-reverse gap-2 sm:flex-row sm:justify-center"
        >
          <Button
            type="button"
            size="sm"
            onClick={onReset}
            className="w-full gap-1.5 sm:w-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReload}
            className="w-full gap-1.5 sm:w-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Reload app
          </Button>
        </motion.div>
        <motion.details
          variants={staggerItem}
          className="mt-5 w-full max-w-sm text-left"
        >
          <summary className="cursor-pointer text-caption font-medium text-muted-foreground/80 transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
            Technical details
          </summary>
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-caption text-muted-foreground">
            <p className="break-words font-mono text-[0.625rem] leading-relaxed">
              {message}
            </p>
            {showStack && error?.stack && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.5625rem] leading-relaxed text-muted-foreground/80">
                {error.stack}
              </pre>
            )}
          </div>
        </motion.details>
        <motion.p
          variants={staggerItem}
          transition={reduceMotion ? REDUCED_TRANSITION : undefined}
          className="mt-5 text-micro text-muted-foreground/60"
        >
          Reloading will not delete any of your projects, sessions, or settings.
        </motion.p>
      </motion.div>
    </div>
  )
}
