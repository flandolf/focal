import { useState, useEffect, useRef, useCallback, useReducer, useMemo } from "react"
import { Play, Pause, RotateCcw, Timer, ChevronUp, ChevronDown, CheckCircle2, Plus, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { VCE_SUBJECTS, type Project, type StudySession, type Subject } from "@/lib/types"

const TIMER_SETTINGS_KEY = "focal-pomodoro-settings"
const TIMER_STATE_KEY = "focal-pomodoro-state"
const DEFAULT_SETTINGS = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
}
const MIN_DURATION_MINUTES = 1
const MAX_DURATION_MINUTES = 180
const EXTRA_BREAK_MINUTES = 5

type TimerMode = "work" | "break" | "long-break"

interface TimerSettings {
  workMinutes: number
  breakMinutes: number
  longBreakMinutes: number
}

interface TimerState {
  running: boolean
  mode: TimerMode
  secondsLeft: number
  cycles: number
}

type TimerAction =
  | { type: "TICK"; settings: TimerSettings }
  | { type: "TOGGLE" }
  | { type: "RESET"; settings: TimerSettings }
  | { type: "SKIP_BREAK"; settings: TimerSettings }
  | { type: "ADD_BREAK_TIME"; minutes: number }
  | { type: "SYNC_SETTINGS"; settings: TimerSettings; previousSettings: TimerSettings }

interface StoredTimerState {
  running: boolean
  mode: TimerMode
  secondsLeft: number
  cycles: number
  activeSessionId?: string | null
  updatedAt: number
}

function getDurationSeconds(mode: TimerMode, settings: TimerSettings) {
  if (mode === "work") return settings.workMinutes * 60
  if (mode === "long-break") return settings.longBreakMinutes * 60
  return settings.breakMinutes * 60
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return MIN_DURATION_MINUTES
  return Math.min(MAX_DURATION_MINUTES, Math.max(MIN_DURATION_MINUTES, Math.round(value)))
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const secs = safeSeconds % 60
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

function parseSettings(value: string | null): TimerSettings {
  if (!value) return DEFAULT_SETTINGS
  try {
    const parsed = JSON.parse(value) as Partial<TimerSettings>
    return {
      workMinutes: clampMinutes(parsed.workMinutes ?? DEFAULT_SETTINGS.workMinutes),
      breakMinutes: clampMinutes(parsed.breakMinutes ?? DEFAULT_SETTINGS.breakMinutes),
      longBreakMinutes: clampMinutes(parsed.longBreakMinutes ?? DEFAULT_SETTINGS.longBreakMinutes),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function getInitialSettings() {
  return parseSettings(localStorage.getItem(TIMER_SETTINGS_KEY))
}

function isValidMode(mode: unknown): mode is TimerMode {
  return mode === "work" || mode === "break" || mode === "long-break"
}

function getInitialState(settings: TimerSettings): TimerState {
  const fallback: TimerState = {
    running: false,
    mode: "work",
    secondsLeft: getDurationSeconds("work", settings),
    cycles: 0,
  }

  try {
    const stored = localStorage.getItem(TIMER_STATE_KEY)
    if (!stored) return fallback

    const parsed = JSON.parse(stored) as Partial<StoredTimerState>
    const mode = isValidMode(parsed.mode) ? parsed.mode : fallback.mode
    const duration = getDurationSeconds(mode, settings)
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now()
    const elapsedSeconds = parsed.running ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000)) : 0
    const cycles = Math.max(0, Math.round(parsed.cycles ?? 0))

    if (parsed.running) {
      const rawSeconds = Math.round(parsed.secondsLeft ?? duration)
      const secondsLeft = Math.max(1, rawSeconds - elapsedSeconds)

      if (secondsLeft <= 0) {
        if (mode === "work") {
          const newCycles = cycles + 1
          const nextMode = newCycles % 4 === 0 ? "long-break" : "break"
          return { running: true, mode: nextMode, secondsLeft: getDurationSeconds(nextMode, settings), cycles: newCycles }
        }
        return { running: false, mode: "work", secondsLeft: getDurationSeconds("work", settings), cycles }
      }

      return { running: true, mode, secondsLeft, cycles }
    }

    return {
      running: false,
      mode,
      secondsLeft: Math.min(duration, Math.max(1, Math.round(parsed.secondsLeft ?? duration))),
      cycles,
    }
  } catch {
    return fallback
  }
}

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "TICK":
      if (state.secondsLeft <= 1) {
        if (state.mode === "work") {
          const newCycles = state.cycles + 1
          const nextMode = newCycles % 4 === 0 ? "long-break" : "break"
          return { running: true, mode: nextMode, secondsLeft: getDurationSeconds(nextMode, action.settings), cycles: newCycles }
        }
        return { running: false, mode: "work", secondsLeft: getDurationSeconds("work", action.settings), cycles: state.cycles }
      }
      return { ...state, secondsLeft: state.secondsLeft - 1 }
    case "TOGGLE":
      return { ...state, running: !state.running }
    case "RESET":
      return { running: false, mode: "work", secondsLeft: getDurationSeconds("work", action.settings), cycles: 0 }
    case "SKIP_BREAK":
      if (state.mode === "work") return state
      return { running: false, mode: "work", secondsLeft: getDurationSeconds("work", action.settings), cycles: state.cycles }
    case "ADD_BREAK_TIME":
      if (state.mode === "work") return state
      return { ...state, secondsLeft: state.secondsLeft + action.minutes * 60 }
    case "SYNC_SETTINGS": {
      const oldDuration = getDurationSeconds(state.mode, action.previousSettings)
      const nextDuration = getDurationSeconds(state.mode, action.settings)
      const secondsLeft = state.secondsLeft === oldDuration ? nextDuration : Math.min(state.secondsLeft, nextDuration)
      return { ...state, secondsLeft }
    }
    default:
      return state
  }
}

interface StudyTimerProps {
  isCollapsed?: boolean
  onExpand?: () => void
  customSubjects?: Subject[]
  availableSubjects?: Subject[]
  selectedProject?: Project
  onStartSession: (data: {
    subjectIds: string[]
    durationSeconds: number
    projectId?: string
  }) => Promise<StudySession>
  onUpdateSession: (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => Promise<void>
}

export function StudyTimer({
  isCollapsed = false,
  onExpand,
  customSubjects = [],
  availableSubjects,
  selectedProject,
  onStartSession,
  onUpdateSession,
}: StudyTimerProps) {
  const [expanded, setExpanded] = useState(true)
  const [settings, setSettings] = useState<TimerSettings>(getInitialSettings)
  const [state, dispatch] = useReducer(timerReducer, settings, getInitialState)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(
    () => selectedProject?.subjectId ? [selectedProject.subjectId] : []
  )
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(TIMER_STATE_KEY)
      if (!stored) return null
      const parsed = JSON.parse(stored) as Partial<StoredTimerState>
      return typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : null
    } catch {
      return null
    }
  })
  const [saving, setSaving] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const stateRef = useRef(state)
  const settingsRef = useRef(settings)
  const prevModeRef = useRef<TimerMode | null>(null)
  const isInitialMountRef = useRef(true)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedProjectSubjectId = selectedProject?.subjectId

  const subjects = useMemo(() => {
    const baseSubjects = availableSubjects ?? [...VCE_SUBJECTS, ...customSubjects]
    if (!selectedProjectSubjectId || baseSubjects.some((subject) => subject.id === selectedProjectSubjectId)) {
      return baseSubjects
    }
    const projectSubject = [...VCE_SUBJECTS, ...customSubjects].find((subject) => subject.id === selectedProjectSubjectId)
    return projectSubject ? [projectSubject, ...baseSubjects] : baseSubjects
  }, [availableSubjects, customSubjects, selectedProjectSubjectId])

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { activeSessionIdRef.current = activeSessionId }, [activeSessionId])

  useEffect(() => {
    if (!selectedProject?.subjectId || activeSessionIdRef.current) return
    setSelectedSubjectIds((current) => (
      current.length > 0 || !selectedProject.subjectId ? current : [selectedProject.subjectId]
    ))
  }, [selectedProject?.subjectId])

  const completeActiveSession = useCallback(async (nextEndTime = new Date()) => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) return

    try {
      await onUpdateSession(sessionId, {
        endTime: nextEndTime.toISOString(),
        status: "completed",
        completedAt: nextEndTime.toISOString(),
      })
    } catch (e) {
      console.error("Failed to complete session:", e)
    } finally {
      activeSessionIdRef.current = null
      setActiveSessionId(null)
    }
  }, [onUpdateSession])

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false
      prevModeRef.current = state.mode
      if (state.mode !== "work" && activeSessionIdRef.current) {
        void completeActiveSession()
      }
      return
    }

    const prevMode = prevModeRef.current
    prevModeRef.current = state.mode

    if (prevMode === "work" && state.mode !== "work" && activeSessionIdRef.current) {
      void completeActiveSession()
    }
  }, [state.mode, completeActiveSession])

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(TIMER_SETTINGS_KEY, JSON.stringify(settings))
      localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
        ...state,
        activeSessionId,
        updatedAt: Date.now(),
      } satisfies StoredTimerState))
    }, 500)
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [activeSessionId, settings, state])

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const onTick = useCallback(() => {
    dispatch({ type: "TICK", settings: settingsRef.current })
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

  const { running, mode, secondsLeft, cycles } = state
  const totalSeconds = getDurationSeconds(mode, settings)
  const progress = Math.min(1, Math.max(0, 1 - secondsLeft / totalSeconds))
  const timeDisplay = formatTimer(secondsLeft)
  const modeLabel = mode === "work" ? "Focus" : mode === "long-break" ? "Long Break" : "Break"
  const modeColor = mode === "work" ? "text-primary" : "text-emerald-500"
  const activeSubjects = subjects.filter((subject) => selectedSubjectIds.includes(subject.id))
  const activeSubjectLabel = activeSubjects.length === 0
    ? "No subject"
    : activeSubjects.length === 1
      ? activeSubjects[0].shortCode
      : `${activeSubjects.length} subjects`
  const activeProjectId = selectedProject && selectedSubjectIds.includes(selectedProject.subjectId ?? "")
    ? selectedProject.id
    : undefined
  const canStartFocus = selectedSubjectIds.length > 0 && !saving

  const updateDuration = (key: keyof TimerSettings, value: string) => {
    const nextValue = clampMinutes(Number(value))
    setSettings((current) => {
      const next = { ...current, [key]: nextValue }
      dispatch({ type: "SYNC_SETTINGS", settings: next, previousSettings: current })
      return next
    })
  }

  const syncActiveSessionSubjects = useCallback(async (nextSubjectIds: string[]) => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) return
    try {
      await onUpdateSession(sessionId, { subjectIds: nextSubjectIds })
    } catch (e) {
      console.error("Failed to sync session subjects:", e)
    }
  }, [onUpdateSession])

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubjectIds((current) => {
      const next = activeSessionIdRef.current
        ? current.includes(subjectId) ? current : [...current, subjectId]
        : current.includes(subjectId) ? current.filter((id) => id !== subjectId) : [...current, subjectId]

      if (activeSessionIdRef.current && next !== current) {
        void syncActiveSessionSubjects(next)
      }

      return next
    })
  }

  const startFocusSession = async (): Promise<boolean> => {
    if (mode !== "work" || activeSessionIdRef.current || selectedSubjectIds.length === 0) return false

    const session = await onStartSession({
      subjectIds: selectedSubjectIds,
      durationSeconds: secondsLeft,
      projectId: activeProjectId,
    })
    activeSessionIdRef.current = session.id
    setActiveSessionId(session.id)
    return true
  }

  const handleToggle = async () => {
    if (!running && mode === "work" && !activeSessionIdRef.current) {
      if (!canStartFocus) return
      setSaving(true)
      try {
        const started = await startFocusSession()
        if (started) dispatch({ type: "TOGGLE" })
      } catch (e) {
        console.error("Failed to start session:", e)
      } finally {
        setSaving(false)
      }
      return
    }
    dispatch({ type: "TOGGLE" })
  }

  const handleFinish = async () => {
    if (!activeSessionIdRef.current) return
    setSaving(true)
    try {
      await completeActiveSession()
    } finally {
      setSaving(false)
      dispatch({ type: "RESET", settings })
    }
  }

  const handleReset = async () => {
    if (activeSessionIdRef.current) {
      setSaving(true)
      try {
        await completeActiveSession()
      } finally {
        setSaving(false)
      }
    }
    dispatch({ type: "RESET", settings })
  }

  const handleSkipBreak = () => {
    if (mode === "work") return
    dispatch({ type: "SKIP_BREAK", settings })
  }

  const handleMoreBreakTime = () => {
    if (mode === "work") return
    dispatch({ type: "ADD_BREAK_TIME", minutes: EXTRA_BREAK_MINUTES })
  }

  if (isCollapsed) {
    return (
      <div className="flex justify-center py-2">
        <button
          onClick={onExpand}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-sidebar-accent/60",
            running ? modeColor : "text-muted-foreground hover:text-foreground"
          )}
          title={running ? `${timeDisplay} - ${modeLabel} - ${activeSubjectLabel}` : "Pomodoro"}
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
            <span className={cn("text-micro font-medium ml-auto", modeColor)}>{activeSubjectLabel}</span>
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

      <div className="grid grid-cols-3 gap-1.5">
        {([
          ["workMinutes", "Focus"],
          ["breakMinutes", "Break"],
          ["longBreakMinutes", "Long"],
        ] as const).map(([key, label]) => (
          <label key={key} className="space-y-1">
            <span className="block text-micro font-semibold uppercase text-muted-foreground/70">{label}</span>
            <Input
              type="number"
              min={MIN_DURATION_MINUTES}
              max={MAX_DURATION_MINUTES}
              step={1}
              value={settings[key]}
              onChange={(event) => updateDuration(key, event.target.value)}
              className="h-7 rounded-lg px-2 text-center text-xs tabular-nums"
              aria-label={`${label} minutes`}
            />
          </label>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-micro font-semibold uppercase text-muted-foreground/70">Studying</span>
          {activeSessionId && (
            <span className="text-micro font-medium text-primary">Logging now</span>
          )}
        </div>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex w-max gap-1.5 pb-2">
            {subjects.map((subject) => {
              const selected = selectedSubjectIds.includes(subject.id)
              return (
                <button
                  key={subject.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleSubjectClick(subject.id)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors",
                    selected
                      ? "border-transparent text-foreground shadow-xs"
                      : "border-sidebar-border bg-background/35 text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                  )}
                  style={selected ? {
                    backgroundColor: `${subject.color}18`,
                    borderColor: `${subject.color}40`,
                    color: subject.color,
                  } : undefined}
                  title={activeSessionId && selected ? `${subject.name} is logged for this session` : subject.name}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  {subject.shortCode}
                </button>
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
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
          disabled={mode === "work" && !canStartFocus && !running}
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
              <Play className="h-3 w-3" /> {selectedSubjectIds.length === 0 ? "Pick a subject" : secondsLeft === totalSeconds ? "Start Focus" : "Resume"}
            </>
          )}
        </Button>

        {activeSessionId && (
          <Button
            onClick={handleFinish}
            disabled={saving}
            size="sm"
            variant="ghost"
            className="mt-1.5 h-7 w-full gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
          >
            <CheckCircle2 className="h-3 w-3" />
            Finish & save
          </Button>
        )}

        {mode !== "work" && (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <Button
              onClick={handleSkipBreak}
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
            >
              <SkipForward className="h-3 w-3" />
              Skip
            </Button>
            <Button
              onClick={handleMoreBreakTime}
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-xl text-xs"
            >
              <Plus className="h-3 w-3" />
              {EXTRA_BREAK_MINUTES} min
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
