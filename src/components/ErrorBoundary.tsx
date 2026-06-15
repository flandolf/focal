import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  Copy,
  Check,
  Terminal,
  Bug,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  REDUCED_TRANSITION,
  staggerContainer,
  staggerItem,
} from "@/lib/motion";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  /** Monotonic counter — increments on reset so consumers can also remount. */
  resetKey: number;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    resetKey: 0,
  };

  static getDerivedStateFromError(
    error: Error,
  ): Pick<ErrorBoundaryState, "hasError" | "error"> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ errorInfo: info });
    console.error(
      "[ErrorBoundary] Uncaught render error:",
      error,
      info.componentStack,
    );
  }

  private handleReset = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      resetKey: prev.resetKey + 1,
    }));
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          key={this.state.resetKey}
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          onReload={this.handleReload}
        />
      );
    }
    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onReset: () => void;
  onReload: () => void;
}

function ErrorFallback({
  error,
  errorInfo,
  onReset,
  onReload,
}: ErrorFallbackProps) {
  const reduceMotion = useReducedMotion() === true;
  const message = error?.message ?? "An unknown error occurred.";
  const errorName = error?.name ?? "Error";
  const showDevDetails = import.meta.env.DEV;

  const fullErrorText = [
    `[${errorName}] ${message}`,
    error?.stack ?? "",
    errorInfo?.componentStack ?? "",
  ].join("\n\n--- Component Stack ---\n");

  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullErrorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback — silently ignore
    }
  };

  return (
    <div className="focal-shell relative flex h-screen w-full flex-col overflow-hidden text-foreground">
      {/* Tauri drag region */}
      <div
        data-tauri-drag-region
        className="app-titlebar-drag-region absolute inset-x-0 top-0 z-20 h-(--app-titlebar-inset)"
        aria-hidden
      />

      {/* Background layers */}
      <div
        className="hairline-grid pointer-events-none absolute inset-0 opacity-80"
        aria-hidden
      />
      <div
        className="ambient-shell pointer-events-none absolute inset-0 z-0 opacity-60"
        aria-hidden
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 pt-(--app-titlebar-inset)">
        <motion.div
          role="alert"
          aria-live="assertive"
          className="glass-panel flex w-full max-w-lg flex-col overflow-hidden rounded-2xl min-[1200px]:rounded-[1.35rem]"
          variants={staggerContainer(0.06, 0.08)}
          initial="initial"
          animate="animate"
        >
          {/* Icon + header */}
          <motion.div
            variants={staggerItem}
            className="flex flex-col items-center px-6 pt-10 text-center"
          >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" aria-hidden />
            </div>
            <h1
              className="font-heading text-xl font-semibold tracking-tight"
              style={{ textWrap: "balance" }}
            >
              Something went wrong
            </h1>
            <p
              className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
              style={{ textWrap: "balance" }}
            >
              Focal hit an unexpected error and the current view couldn't
              recover. Your data is safe on disk — try again, or reload the app
              if the problem persists.
            </p>
          </motion.div>

          {/* Dev badge in dev mode */}
          {showDevDetails && (
            <motion.div
              variants={staggerItem}
              className="mt-4 flex justify-center px-6"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                <Bug className="h-3 w-3" aria-hidden />
                Development mode
              </span>
            </motion.div>
          )}

          {/* Actions */}
          <motion.div
            variants={staggerItem}
            className="mt-6 flex flex-col-reverse gap-2 px-6 sm:flex-row sm:justify-center"
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

          {/* Reassuring footer */}
          <motion.p
            variants={staggerItem}
            className="mt-4 px-6 text-center text-micro text-muted-foreground/60"
          >
            Reloading will not delete any of your projects, sessions, or
            settings.
          </motion.p>

          {/* Technical details — expandable */}
          <motion.div variants={staggerItem} className="mt-5 px-6">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
              aria-expanded={showDetails}
            >
              <span className="flex items-center gap-2 text-caption font-medium text-muted-foreground">
                <Terminal className="h-3.5 w-3.5" aria-hidden />
                Technical details
              </span>
              <motion.span
                animate={{ rotate: showDetails ? 90 : 0 }}
                transition={
                  reduceMotion ? REDUCED_TRANSITION : { duration: 0.2 }
                }
              >
                <ChevronRight
                  className="h-3.5 w-3.5 text-muted-foreground/60"
                  aria-hidden
                />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={
                    reduceMotion
                      ? REDUCED_TRANSITION
                      : { duration: 0.25, ease: "easeOut" }
                  }
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                    {/* Error name + message */}
                    <div className="flex items-start justify-between gap-2">
                      <p className="wrap-break-word font-mono text-[0.625rem] leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-destructive">
                          {errorName}:
                        </span>{" "}
                        {message}
                      </p>
                      {showDevDetails && (
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                          aria-label={copied ? "Copied" : "Copy error details"}
                          title="Copy error details"
                        >
                          {copied ? (
                            <Check
                              className="h-3.5 w-3.5 text-success"
                              aria-hidden
                            />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Stack trace in dev */}
                    {showDevDetails && error?.stack && (
                      <div className="relative">
                        <pre className="max-h-48 overflow-auto rounded-md bg-background/60 p-2.5 whitespace-pre-wrap wrap-break-word font-mono text-[0.5625rem] leading-relaxed text-muted-foreground/80">
                          {error.stack}
                        </pre>
                      </div>
                    )}

                    {/* Component stack in dev */}
                    {showDevDetails && errorInfo?.componentStack && (
                      <div className="relative">
                        <div className="mb-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground/50">
                          Component Stack
                        </div>
                        <pre className="max-h-32 overflow-auto rounded-md bg-background/60 p-2.5 whitespace-pre-wrap wrap-break-word font-mono text-[0.5625rem] leading-relaxed text-muted-foreground/80">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}

                    {/* Production hint */}
                    {!showDevDetails && (
                      <p className="text-[0.5625rem] leading-relaxed text-muted-foreground/50">
                        Open the browser console (F12) to view the full stack
                        trace.
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Bottom spacer */}
          <div className="h-6" />
        </motion.div>
      </div>
    </div>
  );
}
