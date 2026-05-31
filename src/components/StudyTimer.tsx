import { useState, useEffect, useRef, useCallback, useReducer } from "react"
import { Play, Pause, RotateCcw, Timer, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const WORK_TIME = 25 * 60
const BREAK_TIME = 5 * 60
const LONG_BREAK_TIME = 15 * 60

type TimerMode = "work" | "break" | "long-break"

interface TimerState {
  running: boolean
  mode: TimerMode
  secondsLeft: number
  cycles: number
}

type TimerAction =
  | { type: "TICK" }
  | { type: "TOGGLE" }
  | { type: "RESET" }

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "TICK":
      if (state.secondsLeft <= 1) {
        if (state.mode === "work") {
          const newCycles = state.cycles + 1
          const nextMode = newCycles % 4 === 0 ? "long-break" as const : "break" as const
          const nextSeconds = nextMode === "long-break" ? LONG_BREAK_TIME : BREAK_TIME
          return { running: false, mode: nextMode, secondsLeft: nextSeconds, cycles: newCycles }
        }
        return { running: false, mode: "work", secondsLeft: WORK_TIME, cycles: state.cycles }
      }
      return { ...state, secondsLeft: state.secondsLeft - 1 }
    case "TOGGLE":
      return { ...state, running: !state.running }
    case "RESET":
      return { running: false, mode: "work", secondsLeft: WORK_TIME, cycles: 0 }
    default:
      return state
  }
}

const initialState: TimerState = {
  running: false,
  mode: "work",
  secondsLeft: WORK_TIME,
  cycles: 0,
}

interface StudyTimerProps {
  isCollapsed?: boolean
  onExpand?: () => void
}

export function StudyTimer({ isCollapsed = false, onExpand }: StudyTimerProps) {
  const [expanded, setExpanded] = useState(true)
  const [state, dispatch] = useReducer(timerReducer, initialState)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const onTick = useCallback(() => {
    dispatch({ type: "TICK" })
  }, [])

  useEffect(() => {
    if (!state.running) {
      clearTimer()
      return
    }

    clearTimer()
    intervalRef.current = setInterval(onTick, 1000)
    return clearTimer
  }, [state.running, onTick, clearTimer])

  const handleToggle = () => dispatch({ type: "TOGGLE" })
  const handleReset = () => dispatch({ type: "RESET" })

  const { running, mode, secondsLeft, cycles } = state

  const totalSeconds = mode === "work"
    ? WORK_TIME
    : mode === "long-break"
      ? LONG_BREAK_TIME
      : BREAK_TIME

  const progress = 1 - secondsLeft / totalSeconds

  const minutes = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const timeDisplay = `${minutes}:${secs.toString().padStart(2, "0")}`

  const modeLabel = mode === "work" ? "Focus" : mode === "long-break" ? "Long Break" : "Break"
  const modeColor = mode === "work" ? "text-primary" : "text-emerald-500"

  if (isCollapsed) {
    return (
      <div className="flex justify-center py-2">
        <button
          onClick={onExpand}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-sidebar-accent/60",
            running ? modeColor : "text-muted-foreground hover:text-foreground"
          )}
          title={running ? `${timeDisplay} - ${modeLabel}` : "Pomodoro"}
        >
          <Timer className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (!expanded) {
    return (
      <div className="border-t border-sidebar-border/70 px-3 py-2">
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-2 rounded-xl py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Timer className="h-3.5 w-3.5 shrink-0" />
          <span className={cn("font-mono tabular-nums", running && modeColor)}>
            {running ? timeDisplay : "Pomodoro"}
          </span>
          {running && (
            <span className={cn("text-micro font-medium ml-auto", modeColor)}>{modeLabel}</span>
          )}
          <ChevronUp className="h-3 w-3 ml-auto" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-sidebar-border/70 px-3 py-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 rounded-xl py-1 text-xs text-muted-foreground transition-colors hover:text-foreground shrink-0"
        >
          <Timer className="h-3.5 w-3.5" />
          Pomodoro
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          onClick={handleReset}
          className="flex h-6 w-6 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground"
          aria-label="Reset timer"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className={cn("text-xs font-medium", modeColor)}>
        {modeLabel} · Cycle {cycles + 1}
      </div>

      <div className="rounded-2xl border border-sidebar-border/70 bg-background/25 p-3">
        <div className="mx-auto relative h-20 w-20">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-muted/20"
            />
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress)}`}
              strokeLinecap="round"
              className={cn(
                "transition-[stroke-dashoffset] duration-1000",
                mode === "work" ? "text-primary" : "text-emerald-500"
              )}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-mono tabular-nums font-semibold leading-tight">{timeDisplay}</span>
          </div>
        </div>

        <Button
          onClick={handleToggle}
          size="sm"
          variant={running ? "outline" : "default"}
          className="mt-3 h-7 w-full gap-1.5 rounded-xl text-xs"
        >
          {running ? (
            <>
              <Pause className="h-3 w-3" /> Pause
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> {secondsLeft === totalSeconds ? "Start" : "Resume"}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
