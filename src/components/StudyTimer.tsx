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

export function StudyTimer() {
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

  if (!expanded) {
    return (
      <div className="border-t border-sidebar-border px-3 py-2">
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 w-full text-xs text-muted-foreground hover:text-foreground transition-colors rounded py-0.5"
        >
          <Timer className="h-3.5 w-3.5 shrink-0" />
          <span className={cn("font-mono tabular-nums", running && modeColor)}>
            {running ? timeDisplay : "Pomodoro"}
          </span>
          {running && (
            <span className={cn("text-[10px] font-medium ml-auto", modeColor)}>{modeLabel}</span>
          )}
          <ChevronUp className="h-3 w-3 ml-auto" />
        </button>
      </div>
    )
  }

  return (
    <div className="border-t border-sidebar-border px-3 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded py-0.5"
        >
          <Timer className="h-3.5 w-3.5" />
          Pomodoro
          <ChevronDown className="h-3 w-3" />
        </button>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-medium", modeColor)}>
            {modeLabel} · Cycle {cycles + 1}
          </span>
          <button
            onClick={handleReset}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
            aria-label="Reset timer"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="relative w-20 h-20">
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
          className="w-full gap-1.5 h-7 text-xs"
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
