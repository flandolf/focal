import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  Check,
  Coffee,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import { TitleBar } from "@/components/TitleBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FocusViewProps {
  running: boolean;
  mode: "work" | "break" | "long-break";
  isStudyOvertime: boolean;
  secondsLeft: number;
  totalSeconds: number;
  progress: number;
  timeDisplay: string;
  modeLabel: string;
  timerActionLabel: string;
  canStartFocus: boolean;
  saving: boolean;
  cycles: number;
  activeSessionId: string | null;
  subjectLabel: string;
  projectLabel?: string;
  onSearch?: () => void;
  onSettings?: () => void;
  onToggle: () => void;
  onFinish: () => void;
  onReset: () => void;
  onSkipBreak: () => void;
  onMoreBreakTime: () => void;
  onClose: () => void;
  closeButtonRef?: RefObject<HTMLButtonElement | null>;
}

function finishTime(secondsLeft: number) {
  return new Date(Date.now() + secondsLeft * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

// eslint-disable-next-line react-refresh/only-export-components -- used by the runnable timer self-check
export function isTimerShortcutTarget(target: EventTarget | null) {
  const tagName = (target as { tagName?: string } | null)?.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "BUTTON";
}

export function FocusView({
  running,
  mode,
  isStudyOvertime,
  secondsLeft,
  totalSeconds,
  progress,
  timeDisplay,
  modeLabel,
  timerActionLabel,
  canStartFocus,
  saving,
  cycles,
  activeSessionId,
  subjectLabel,
  projectLabel,
  onSearch,
  onSettings,
  onToggle,
  onFinish,
  onReset,
  onSkipBreak,
  onMoreBreakTime,
  onClose,
  closeButtonRef,
}: FocusViewProps) {
  const fallbackCloseRef = useRef<HTMLButtonElement | null>(null);
  const resolvedCloseRef = closeButtonRef ?? fallbackCloseRef;
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const isFocus = mode === "work" || isStudyOvertime;
  const safeProgress = Math.min(1, Math.max(0, progress));
  const progressPercent = Math.round(safeProgress * 100);
  const projectedFinish = useMemo(
    () => finishTime(isStudyOvertime ? 0 : secondsLeft),
    [isStudyOvertime, secondsLeft],
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const focusTimeout = window.setTimeout(() => primaryButtonRef.current?.focus(), 50);
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.code !== "Space" || isTimerShortcutTarget(event.target) || saving) return;
      event.preventDefault();
      onToggle();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, onToggle, resolvedCloseRef, saving]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${running || !activeSessionId ? timeDisplay : "Paused"} · ${subjectLabel} · Focal`;
    return () => {
      document.title = previousTitle;
    };
  }, [activeSessionId, running, subjectLabel, timeDisplay]);

  const status = activeSessionId
    ? running
      ? "Logging to calendar"
      : "Paused — calendar stopped"
    : isFocus
      ? "Ready to start"
      : "Break — not logged";

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-background text-foreground"
      role="dialog"
      aria-modal="true"
      aria-label="Focus timer"
    >
      <TitleBar onSearch={onSearch} onSettings={onSettings} />
      <Button
        ref={resolvedCloseRef}
        variant="ghost"
        size="icon"
        className="absolute right-3 top-12 z-10"
        onClick={onClose}
        aria-label="Close focus view"
      >
        <X />
      </Button>

      <main className="grid min-h-0 flex-1 place-items-center overflow-hidden p-4 sm:p-8">
        <Card className="w-full max-w-2xl gap-0 py-0">
          <CardContent className="flex flex-col items-center px-5 py-8 text-center sm:px-10 sm:py-12">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant={activeSessionId ? "success" : "secondary"}>
                <Timer />
                {status}
              </Badge>
              <Badge variant="outline">Cycle {cycles + 1}</Badge>
            </div>

            <p className="mt-6 text-sm font-medium text-muted-foreground">
              {modeLabel}
            </p>
            <h1 className="mt-2 font-heading text-7xl font-semibold tabular-nums tracking-[-0.05em] sm:text-8xl lg:text-9xl">
              {timeDisplay}
            </h1>

            <div className="mt-7 w-full max-w-lg">
              <div
                role="progressbar"
                aria-label={`${modeLabel} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-1000 motion-reduce:transition-none",
                    isFocus ? "bg-primary" : "bg-success",
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                <span>{progressPercent}% complete</span>
                <span>
                  {isStudyOvertime
                    ? "Open-ended focus"
                    : running
                      ? `Finishes ${projectedFinish}`
                      : `${Math.ceil(totalSeconds / 60)} min block`}
                </span>
              </div>
            </div>

            <div className="mt-8 min-w-0">
              <p className="truncate text-base font-semibold">{subjectLabel}</p>
              {projectLabel && (
                <p className="mt-1 max-w-md truncate text-sm text-muted-foreground">
                  {projectLabel}
                </p>
              )}
            </div>

            {isFocus ? (
              <div className="mt-8 flex w-full max-w-lg flex-col gap-2 sm:flex-row">
                <Button
                  ref={primaryButtonRef}
                  size="lg"
                  className="flex-1"
                  onClick={onToggle}
                  disabled={saving || (!activeSessionId && !canStartFocus)}
                >
                  {running ? <Pause /> : <Play />}
                  {timerActionLabel}
                </Button>
                {activeSessionId && (
                  <Button
                    size="lg"
                    className="flex-1"
                    variant="outline"
                    onClick={onFinish}
                    disabled={saving}
                  >
                    <Check />
                    Finish &amp; save
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-8 grid w-full max-w-lg grid-cols-3 gap-2">
                <Button ref={primaryButtonRef} size="lg" onClick={onToggle} disabled={saving}>
                  {running ? <Pause /> : <Coffee />}
                  {running ? "Pause" : "Resume"}
                </Button>
                <Button size="lg" variant="outline" onClick={onSkipBreak}>
                  <SkipForward />
                  Skip
                </Button>
                <Button size="lg" variant="outline" onClick={onMoreBreakTime}>
                  <Plus />
                  5 min
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="mt-4 text-muted-foreground"
              onClick={onReset}
              disabled={saving}
            >
              <RotateCcw />
              Reset timer
            </Button>
          </CardContent>
        </Card>
      </main>

      <p className="shrink-0 pb-4 text-center text-xs text-muted-foreground">
        Space to {running ? "pause" : activeSessionId ? "resume" : isFocus ? "start" : "resume break"} · Esc to close
      </p>
      <span className="sr-only" aria-live="polite">
        {status}. {timeDisplay} remaining.
      </span>
    </div>
  );
}
