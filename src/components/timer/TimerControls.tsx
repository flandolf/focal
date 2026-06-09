import {
  BookOpen,
  CheckCircle2,
  Coffee,
  Pause,
  Play,
  Plus,
  SkipForward,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const EXTRA_BREAK_MINUTES = 5

interface TimerControlsProps {
  variant: "focus" | "sidebar"
  running: boolean
  mode: "work" | "break" | "long-break"
  isStudyOvertime: boolean
  canStartFocus: boolean
  saving: boolean
  hasActiveSession: boolean
  timerActionLabel: string
  onToggle: () => void
  onReturnToBreak: () => void
  onFinish: () => void
  onSkipBreak: () => void
  onStartStudyOvertime: () => void
  onMoreBreakTime: () => void
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
  if (variant === "focus") {
    return (
      <div className="mx-auto mt-3 w-full max-w-3xl border-t border-border/55 pt-3">
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            onClick={onToggle}
            disabled={mode === "work" && !canStartFocus && !running}
            size="lg"
            variant={running ? "outline" : "default"}
            className="h-11 flex-1 gap-2 rounded-md text-sm"
          >
            {running ? (
              <p className="flex items-center justify-center gap-2 text-background">
                <Pause className="h-4 w-4" /> Pause
              </p>
            ) : (
              <p className="flex items-center justify-center gap-2 text-background">
                <Play className="h-4 w-4" /> {timerActionLabel}
              </p>
            )}
          </Button>
          {isStudyOvertime ? (
            <Button
              onClick={onReturnToBreak}
              disabled={saving}
              size="lg"
              variant="default"
              className="h-11 flex-1 gap-2 rounded-md text-sm text-primary-foreground"
            >
              <Coffee className="h-4 w-4" />
              break time!
            </Button>
          ) : hasActiveSession && (
            <Button
              onClick={onFinish}
              disabled={saving}
              size="lg"
              variant="outline"
              className="h-11 flex-1 gap-2 rounded-md text-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              Finish & save
            </Button>
          )}
        </div>

        {mode !== "work" && !isStudyOvertime && (
          <div className="mt-2 grid grid-cols-1 gap-2 min-[520px]:grid-cols-3">
            <Button
              onClick={onSkipBreak}
              size="sm"
              variant="ghost"
              className="h-10 gap-2 rounded-md text-sm"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
            <Button
              onClick={onStartStudyOvertime}
              disabled={!canStartFocus}
              size="sm"
              variant="outline"
              className="h-10 min-w-0 gap-2 rounded-md text-sm"
            >
              <BookOpen className="h-4 w-4" />
              Study overtime
            </Button>
            <Button
              onClick={onMoreBreakTime}
              size="sm"
              variant="outline"
              className="h-10 gap-2 rounded-md text-sm"
            >
              <Plus className="h-4 w-4" />
              {EXTRA_BREAK_MINUTES} min
            </Button>
          </div>
        )}
      </div>
    )
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
      ) : hasActiveSession && (
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
  )
}
