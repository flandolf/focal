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
  breakStartedAt?: number
  tickedAt?: number
  studyOvertime?: boolean
}

type TimerAction =
  | { type: "TICK"; settings: TimerSettings; now: number }
  | { type: "TOGGLE" }
  | { type: "RESET"; settings: TimerSettings }
  | { type: "SKIP_BREAK"; settings: TimerSettings }
  | { type: "ADD_BREAK_TIME"; minutes: number }
  | { type: "START_STUDY_OVERTIME" }
  | { type: "START_REST"; settings: TimerSettings }
  | { type: "SYNC_SETTINGS"; settings: TimerSettings; previousSettings: TimerSettings }

interface StoredTimerState extends TimerState {
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

function getInitialState(settings: TimerSettings): TimerState {
  const fallback = {
    running: false,
    mode: "work" as const,
    secondsLeft: getDurationSeconds("work", settings),
    cycles: 0,
  }

  try {
    const stored = localStorage.getItem(TIMER_STATE_KEY)
    if (!stored) return fallback

    const parsed = JSON.parse(stored) as Partial<StoredTimerState>
    const mode = parsed.mode === "break" || parsed.mode === "long-break" || parsed.mode === "work"
      ? parsed.mode
      : fallback.mode
    const duration = getDurationSeconds(mode, settings)
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now()
    const elapsedSeconds = parsed.running ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000)) : 0

    if (parsed.studyOvertime && mode !== "work") {
      return {
        running: Boolean(parsed.running),
        mode,
        secondsLeft: Math.max(0, Math.round(parsed.secondsLeft ?? 0) + elapsedSeconds),
        cycles: Math.max(0, Math.round(parsed.cycles ?? 0)),
        breakStartedAt: undefined,
        studyOvertime: true,
      }
    }

    if (mode !== "work" && typeof parsed.breakStartedAt === "number") {
      return {
        running: Boolean(parsed.running),
        mode,
        secondsLeft: Math.min(duration, Math.max(1, Math.round(parsed.secondsLeft ?? duration))),
        cycles: Math.max(0, Math.round(parsed.cycles ?? 0)),
        breakStartedAt: parsed.breakStartedAt,
        studyOvertime: false,
      }
    }

    const secondsLeft = Math.min(duration, Math.max(1, Math.round(parsed.secondsLeft ?? duration) - elapsedSeconds))

    if (parsed.running && elapsedSeconds >= (parsed.secondsLeft ?? duration)) {
      if (mode === "work") {
        const cycles = Math.max(0, Math.round(parsed.cycles ?? 0)) + 1
        const nextMode = cycles % 4 === 0 ? "long-break" as const : "break" as const
        return {
          running: true,
          mode: nextMode,
          secondsLeft: getDurationSeconds(nextMode, settings),
          cycles,
          breakStartedAt: updatedAt + Math.max(0, Math.round(parsed.secondsLeft ?? duration)) * 1000,
          studyOvertime: false,
        }
      }

      return {
        running: false,
        mode: "work",
        secondsLeft: getDurationSeconds("work", settings),
        cycles: Math.max(0, Math.round(parsed.cycles ?? 0)),
        breakStartedAt: undefined,
        studyOvertime: false,
      }
    }

    return {
      running: Boolean(parsed.running),
      mode,
      secondsLeft,
      cycles: Math.max(0, Math.round(parsed.cycles ?? 0)),
      breakStartedAt: typeof parsed.breakStartedAt === "number" ? parsed.breakStartedAt : undefined,
      studyOvertime: false,
    }
  } catch {
    return fallback
  }
}

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "TICK":
      if (state.studyOvertime) {
        return { ...state, secondsLeft: state.secondsLeft + 1, tickedAt: action.now }
      }
      if (state.mode !== "work" && state.breakStartedAt) {
        return { ...state, tickedAt: action.now }
      }
      if (state.secondsLeft <= 1) {
        if (state.mode === "work") {
          const newCycles = state.cycles + 1
          const nextMode = newCycles % 4 === 0 ? "long-break" as const : "break" as const
          const nextSeconds = getDurationSeconds(nextMode, action.settings)
          return { running: true, mode: nextMode, secondsLeft: nextSeconds, cycles: newCycles, breakStartedAt: action.now, tickedAt: action.now, studyOvertime: false }
        }
        return { running: false, mode: "work", secondsLeft: getDurationSeconds("work", action.settings), cycles: state.cycles, breakStartedAt: undefined, studyOvertime: false }
      }
      return { ...state, secondsLeft: state.secondsLeft - 1, tickedAt: action.now }
    case "TOGGLE":
      return { ...state, running: !state.running }
    case "RESET":
      return { running: false, mode: "work", secondsLeft: getDurationSeconds("work", action.settings), cycles: 0, studyOvertime: false }
    case "SKIP_BREAK":
      return { running: false, mode: "work", secondsLeft: getDurationSeconds("work", action.settings), cycles: state.cycles, breakStartedAt: undefined, studyOvertime: false }
    case "ADD_BREAK_TIME":
      if (state.mode === "work" || state.studyOvertime) return state
      return { ...state, secondsLeft: state.secondsLeft + action.minutes * 60 }
    case "START_STUDY_OVERTIME":
      if (state.mode === "work") return state
      return { ...state, running: true, secondsLeft: 0, breakStartedAt: undefined, studyOvertime: true }
    case "START_REST":
      if (state.mode === "work") return state
      return {
        ...state,
        running: true,
        secondsLeft: getDurationSeconds(state.mode, action.settings),
        breakStartedAt: undefined,
        studyOvertime: false,
      }
    case "SYNC_SETTINGS": {
      const oldDuration = getDurationSeconds(state.mode, action.previousSettings)
      const nextDuration = getDurationSeconds(state.mode, action.settings)
      const secondsLeft = state.secondsLeft === oldDuration
        ? nextDuration
        : Math.min(state.secondsLeft, nextDuration)
      if (state.studyOvertime) return state
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

  const subjects = useMemo(() => [...VCE_SUBJECTS, ...customSubjects], [customSubjects])

  useEffect(() => {
    if (!selectedProject?.subjectId || activeSessionIdRef.current) return
    setSelectedSubjectIds((current) => (
      current.length > 0 || !selectedProject.subjectId ? current : [selectedProject.subjectId]
    ))
  }, [selectedProject?.subjectId])

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    localStorage.setItem(TIMER_SETTINGS_KEY, JSON.stringify(settings))
    localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
      ...state,
      activeSessionId,
      updatedAt: Date.now(),
    } satisfies StoredTimerState))
  }, [activeSessionId, settings, state])

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const completeActiveSession = useCallback(async (nextEndTime = new Date()) => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId) return

    await onUpdateSession(sessionId, {
      endTime: nextEndTime.toISOString(),
      status: "completed",
      completedAt: nextEndTime.toISOString(),
    })
    activeSessionIdRef.current = null
    setActiveSessionId(null)
  }, [onUpdateSession])

  const onTick = useCallback(() => {
    if (state.mode !== "work" && !state.studyOvertime && state.running && state.secondsLeft <= 1 && activeSessionIdRef.current) {
      void completeActiveSession()
    }
    dispatch({ type: "TICK", settings, now: Date.now() })
  }, [completeActiveSession, settings, state.mode, state.running, state.secondsLeft, state.studyOvertime])

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

  const isStudyOvertime = Boolean(state.studyOvertime)
  const progress = isStudyOvertime ? 1 : Math.min(1, Math.max(0, 1 - secondsLeft / totalSeconds))

  const timeDisplay = `${isStudyOvertime ? "+" : ""}${formatTimer(secondsLeft)}`

  const modeLabel = isStudyOvertime ? "Focus overtime" : mode === "work" ? "Focus" : mode === "long-break" ? "Long Break" : "Break"
  const modeColor = mode === "work" || isStudyOvertime ? "text-primary" : "text-emerald-500"
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
  const awaitingRestConfirmation = mode !== "work" && Boolean(activeSessionId) && Boolean(state.breakStartedAt)
  const overtimeSeconds = awaitingRestConfirmation
    ? Math.max(0, Math.floor(((state.tickedAt ?? state.breakStartedAt ?? 0) - (state.breakStartedAt ?? 0)) / 1000))
    : 0
  const focusEndTime = state.breakStartedAt ? new Date(state.breakStartedAt) : undefined

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
    await onUpdateSession(sessionId, { subjectIds: nextSubjectIds })
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

  const startFocusSession = async () => {
    if (mode !== "work" || activeSessionIdRef.current || selectedSubjectIds.length === 0) return

    setSaving(true)
    try {
      const session = await onStartSession({
        subjectIds: selectedSubjectIds,
        durationSeconds: secondsLeft,
        projectId: activeProjectId,
      })
      activeSessionIdRef.current = session.id
      setActiveSessionId(session.id)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = () => {
    if (!running && mode === "work" && !activeSessionIdRef.current) {
      if (!canStartFocus) return
      void startFocusSession()
        .then(() => {
          dispatch({ type: "TOGGLE" })
        })
        .catch(() => undefined)
      return
    }

    dispatch({ type: "TOGGLE" })
  }

  const handleFinish = () => {
    if (!activeSessionIdRef.current) return
    setSaving(true)
    void completeActiveSession().finally(() => {
      setSaving(false)
      dispatch({ type: "RESET", settings })
    })
  }

  const handleReset = () => {
    if (activeSessionIdRef.current) {
      void completeActiveSession(focusEndTime)
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

  const handleStillStudying = () => {
    const sessionId = activeSessionIdRef.current
    if (!sessionId || mode === "work") return

    const now = new Date()
    setSaving(true)
    void onUpdateSession(sessionId, {
      endTime: now.toISOString(),
      status: "in-progress",
      completedAt: undefined,
    })
      .then(() => {
        dispatch({ type: "START_STUDY_OVERTIME" })
      })
      .catch(() => undefined)
      .finally(() => {
        setSaving(false)
      })
  }

  const handleStartRest = () => {
    if (mode === "work") return

    setSaving(true)
    void completeActiveSession(focusEndTime)
      .then(() => {
        dispatch({ type: "START_REST", settings })
      })
      .finally(() => {
        setSaving(false)
      })
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
          disabled={awaitingRestConfirmation || (mode === "work" && !canStartFocus && !running)}
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
        {activeSessionId && !awaitingRestConfirmation && !isStudyOvertime && (
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
        {isStudyOvertime && activeSessionId ? (
          <Button
            onClick={handleStartRest}
            disabled={saving}
            size="sm"
            variant="default"
            className="mt-1.5 h-7 w-full gap-1.5 rounded-xl text-xs"
          >
            break time!
          </Button>
        ) : awaitingRestConfirmation ? (
          <div className="mt-1.5 grid grid-cols-1 gap-1.5">
            <Button
              onClick={handleStillStudying}
              disabled={saving}
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-xl text-xs"
            >
              Still studying
              <span className="font-mono tabular-nums text-muted-foreground">+{formatTimer(overtimeSeconds)}</span>
            </Button>
            <Button
              onClick={handleStartRest}
              disabled={saving}
              size="sm"
              variant="default"
              className="h-7 gap-1.5 rounded-xl text-xs"
            >
              Rest time!
              <span className="font-mono tabular-nums opacity-80">{timeDisplay} remaining</span>
            </Button>
          </div>
        ) : mode !== "work" && (
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
