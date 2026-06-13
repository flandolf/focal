import {
  BookOpen,
  CheckCircle2,
  Coffee,
  Pause,
  Play,
  Plus,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EXTRA_BREAK_MINUTES = 5;

interface TimerControlsProps {
  variant: "sidebar" | "footer";
  running: boolean;
  mode: "work" | "break" | "long-break";
  isStudyOvertime: boolean;
  canStartFocus: boolean;
  saving: boolean;
  hasActiveSession: boolean;
  timerActionLabel: string;
  onToggle: () => void;
  onReturnToBreak: () => void;
  onFinish: () => void;
  onSkipBreak: () => void;
  onStartStudyOvertime: () => void;
  onMoreBreakTime: () => void;
}

export function TimerControls({
  variant,
  running,
  mode,
  isStudyOvertime,
  canStartFocus,
  saving,
  hasActiveSession,
  timerActionLabel,
  onToggle,
  onReturnToBreak,
  onFinish,
  onSkipBreak,
  onStartStudyOvertime,
  onMoreBreakTime,
}: TimerControlsProps) {
  if (variant === "footer") {
    return (
      <div
        className={cn(
          "timer-floating-bar fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 px-3 py-3 sm:bottom-6 sm:w-[calc(100%-3rem)] sm:px-4",
          running && "timer-floating-bar-glow",
        )}
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            onClick={onToggle}
            disabled={mode === "work" && !canStartFocus && !running}
            size="lg"
            variant={running ? "outline" : "default"}
            className="h-11 flex-1 gap-2 rounded-lg text-sm transition duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <Pause className="h-4 w-4" /> Pause
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play className="h-4 w-4" /> {timerActionLabel}
              </span>
            )}
          </Button>
          {isStudyOvertime ? (
            <Button
              onClick={onReturnToBreak}
              disabled={saving}
              size="lg"
              variant="default"
              className="h-11 flex-1 gap-2 rounded-lg text-sm transition duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
            >
              <Coffee className="h-4 w-4" />
              Break time!
            </Button>
          ) : (
            hasActiveSession && (
              <Button
                onClick={onFinish}
                disabled={saving}
                size="lg"
                variant="outline"
                className="h-11 flex-1 gap-2 rounded-lg text-sm transition duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
              >
                <CheckCircle2 className="h-4 w-4" />
                Finish & save
              </Button>
            )
          )}
        </div>

        {mode !== "work" && !isStudyOvertime && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={onSkipBreak}
              size="sm"
              variant="ghost"
              className="h-9 gap-2 rounded-lg text-sm transition duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
            <Button
              onClick={onStartStudyOvertime}
              disabled={!canStartFocus}
              size="sm"
              variant="outline"
              className="h-9 gap-2 rounded-lg text-sm transition duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
            >
              <BookOpen className="h-4 w-4" />
              Study overtime
            </Button>
            <Button
              onClick={onMoreBreakTime}
              size="sm"
              variant="outline"
              className="h-9 gap-2 rounded-lg text-sm transition duration-150 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              {EXTRA_BREAK_MINUTES} min
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Button
        onClick={onToggle}
        disabled={mode === "work" && !canStartFocus && !running}
        size="sm"
        variant={running ? "outline" : "default"}
        className="mt-3 h-8 w-full gap-1.5 rounded-xl text-control text-primary-foreground"
      >
        {running ? (
          <>
            <Pause className="h-3 w-3" /> Pause
          </>
        ) : (
          <>
            <Play className="h-3 w-3" /> {timerActionLabel}
          </>
        )}
      </Button>

      {isStudyOvertime ? (
        <Button
          onClick={onReturnToBreak}
          disabled={saving}
          size="sm"
          variant="default"
          className="mt-1.5 h-8 w-full gap-1.5 rounded-xl text-control text-primary-foreground"
        >
          <Coffee className="h-3 w-3" />
          break time!
        </Button>
      ) : (
        hasActiveSession && (
          <Button
            onClick={onFinish}
            disabled={saving}
            size="sm"
            variant="ghost"
            className="mt-1.5 h-8 w-full gap-1.5 rounded-xl text-control text-muted-foreground hover:text-foreground"
          >
            <CheckCircle2 className="h-3 w-3" />
            Finish & save
          </Button>
        )
      )}

      {mode !== "work" && !isStudyOvertime && (
        <div className="mt-1.5 grid grid-cols-1 gap-1.5 min-[240px]:grid-cols-3">
          <Button
            onClick={onSkipBreak}
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 rounded-xl text-control text-muted-foreground hover:text-foreground"
          >
            <SkipForward className="h-3 w-3" />
            Skip
          </Button>
          <Button
            onClick={onStartStudyOvertime}
            disabled={!canStartFocus}
            size="sm"
            variant="outline"
            className="h-8 min-w-0 gap-1.5 rounded-xl px-1.5 text-control"
          >
            <BookOpen className="h-3 w-3" />
            Study
          </Button>
          <Button
            onClick={onMoreBreakTime}
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 rounded-xl text-control"
          >
            <Plus className="h-3 w-3" />
            {EXTRA_BREAK_MINUTES} min
          </Button>
        </div>
      )}
    </>
  );
}
