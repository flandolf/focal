import { useState, useEffect, useRef, useCallback, useReducer, useMemo, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coffee,
  Gauge,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Target,
  Timer,
} from "lucide-react"
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
  studyOvertime: boolean
  overtimeSeconds: number
}

type TimerAction =
  | { type: "TICK"; settings: TimerSettings }
  | { type: "TOGGLE" }
  | { type: "RESET"; settings: TimerSettings }
  | { type: "SKIP_BREAK"; settings: TimerSettings }
  | { type: "ADD_BREAK_TIME"; minutes: number }
  | { type: "START_STUDY_OVERTIME"; settings: TimerSettings }
  | { type: "RETURN_TO_BREAK" }
  | { type: "SYNC_SETTINGS"; settings: TimerSettings; previousSettings: TimerSettings }

interface StoredTimerState {
  running: boolean
  mode: TimerMode
  secondsLeft: number
  cycles: number
  studyOvertime?: boolean
  overtimeSeconds?: number
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
    studyOvertime: false,
    overtimeSeconds: 0,
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
    const studyOvertime = parsed.studyOvertime === true && mode !== "work"
    const overtimeSeconds = Math.max(0, Math.round(parsed.overtimeSeconds ?? 0))

    if (studyOvertime) {
      return {
        running: parsed.running === true,
        mode,
        secondsLeft: Math.min(duration, Math.max(1, Math.round(parsed.secondsLeft ?? duration))),
        cycles,
        studyOvertime: true,
        overtimeSeconds: parsed.running ? overtimeSeconds + elapsedSeconds : overtimeSeconds,
      }
    }

    if (parsed.running) {
      const rawSeconds = Math.round(parsed.secondsLeft ?? duration)
      const secondsLeft = Math.max(1, rawSeconds - elapsedSeconds)

      if (secondsLeft <= 0) {
        if (mode === "work") {
          const newCycles = cycles + 1
          const nextMode = newCycles % 4 === 0 ? "long-break" : "break"
          return {
            running: true,
            mode: nextMode,
            secondsLeft: getDurationSeconds(nextMode, settings),
            cycles: newCycles,
            studyOvertime: false,
            overtimeSeconds: 0,
          }
        }
        return {
          running: false,
          mode: "work",
          secondsLeft: getDurationSeconds("work", settings),
          cycles,
          studyOvertime: false,
          overtimeSeconds: 0,
        }
      }

      return { running: true, mode, secondsLeft, cycles, studyOvertime: false, overtimeSeconds: 0 }
    }

    return {
      running: false,
      mode,
      secondsLeft: Math.min(duration, Math.max(1, Math.round(parsed.secondsLeft ?? duration))),
      cycles,
      studyOvertime: false,
      overtimeSeconds: 0,
    }
  } catch {
    return fallback
  }
}

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "TICK":
      if (state.studyOvertime) {
        return { ...state, overtimeSeconds: state.overtimeSeconds + 1 }
      }
      if (state.secondsLeft <= 1) {
        if (state.mode === "work") {
          const newCycles = state.cycles + 1
          const nextMode = newCycles % 4 === 0 ? "long-break" : "break"
          return {
            running: true,
            mode: nextMode,
            secondsLeft: getDurationSeconds(nextMode, action.settings),
            cycles: newCycles,
            studyOvertime: false,
            overtimeSeconds: 0,
          }
        }
        return {
          running: false,
          mode: "work",
          secondsLeft: getDurationSeconds("work", action.settings),
          cycles: state.cycles,
          studyOvertime: false,
          overtimeSeconds: 0,
        }
      }
      return { ...state, secondsLeft: state.secondsLeft - 1 }
    case "TOGGLE":
      return { ...state, running: !state.running }
    case "RESET":
      return {
        running: false,
        mode: "work",
        secondsLeft: getDurationSeconds("work", action.settings),
        cycles: 0,
        studyOvertime: false,
        overtimeSeconds: 0,
      }
    case "SKIP_BREAK":
      if (state.mode === "work" || state.studyOvertime) return state
      return {
        running: false,
        mode: "work",
        secondsLeft: getDurationSeconds("work", action.settings),
        cycles: state.cycles,
        studyOvertime: false,
        overtimeSeconds: 0,
      }
    case "ADD_BREAK_TIME":
      if (state.mode === "work" || state.studyOvertime) return state
      return { ...state, secondsLeft: state.secondsLeft + action.minutes * 60 }
    case "START_STUDY_OVERTIME": {
      if (state.mode === "work") return state
      const totalBreakSeconds = getDurationSeconds(state.mode, action.settings)
      const elapsedBreakSeconds = totalBreakSeconds - state.secondsLeft
      return { ...state, running: true, studyOvertime: true, overtimeSeconds: elapsedBreakSeconds }
    }
    case "RETURN_TO_BREAK":
      if (!state.studyOvertime) return state
      return { ...state, running: true, studyOvertime: false, overtimeSeconds: 0 }
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
  sessions?: StudySession[]
  selectedProject?: Project
  onStartSession: (data: {
    subjectIds: string[]
    durationSeconds: number
    projectId?: string
    cycleNumber: number
  }) => Promise<StudySession>
  onUpdateSession: (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => Promise<void>
}
interface FocusStatProps {
  label: string
  value: string
  icon: ReactNode
  detail?: string
}

interface FocusMetricProps {
  label: string
  value: string
  detail?: string
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function getSessionMinutes(session: StudySession, now?: Date) {
  const startMs = new Date(session.startTime).getTime()
  const plannedEndMs = new Date(session.endTime).getTime()
  const endMs = session.status === "in-progress" && now
    ? Math.min(plannedEndMs, now.getTime())
    : plannedEndMs
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
  return Math.round((endMs - startMs) / 60000)
}

function getTodayRange(now: Date) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return { startMs: start.getTime(), endMs: end.getTime() }
}

function FocusStat({ label, value, icon, detail }: FocusStatProps) {
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 px-1 py-2.5">
      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 bg-muted/35 text-muted-foreground" aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
          <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        {detail && <p className="mt-1 text-xs leading-4 text-muted-foreground">{detail}</p>}
      </div>
    </div>
  )
}

function FocusMetric({ label, value, detail }: FocusMetricProps) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-background/45 px-2.5 py-1.5 min-[520px]:px-3">
      <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground min-[520px]:text-base">{value}</p>
      {detail && <p className="mt-0.5 truncate text-caption text-muted-foreground">{detail}</p>}
    </div>
  )
}

export function StudyTimer({
  isCollapsed = false,
  onExpand,
  customSubjects = [],
  availableSubjects,
  sessions = [],
  selectedProject,
  onStartSession,
  onUpdateSession,
}: StudyTimerProps) {
  const [expanded, setExpanded] = useState(true)
  const [focusViewOpen, setFocusViewOpen] = useState(false)
  const [analyticsNow, setAnalyticsNow] = useState(() => new Date())
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
  const focusCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const selectedProjectSubjectId = selectedProject?.subjectId

  const setFocusViewWithTransition = useCallback((nextOpen: boolean) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(() => setFocusViewOpen(nextOpen))
      return
    }

    setFocusViewOpen(nextOpen)
  }, [])

  const openFocusView = useCallback(() => setFocusViewWithTransition(true), [setFocusViewWithTransition])
  const closeFocusView = useCallback(() => setFocusViewWithTransition(false), [setFocusViewWithTransition])

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
    const interval = window.setInterval(() => setAnalyticsNow(new Date()), 60000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!focusViewOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.setTimeout(() => focusCloseButtonRef.current?.focus(), 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFocusView()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [closeFocusView, focusViewOpen])

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
      if (state.mode !== "work" && !state.studyOvertime && activeSessionIdRef.current) {
        void completeActiveSession()
      }
      return
    }

    const prevMode = prevModeRef.current
    prevModeRef.current = state.mode

    if (prevMode === "work" && state.mode !== "work" && !state.studyOvertime && activeSessionIdRef.current) {
      void completeActiveSession()
    }
  }, [state.mode, state.studyOvertime, completeActiveSession])

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

  const { running, mode, secondsLeft, cycles, studyOvertime, overtimeSeconds } = state
  const isStudyOvertime = studyOvertime && mode !== "work"
  const totalSeconds = getDurationSeconds(mode, settings)
  const progress = isStudyOvertime ? 1 : Math.min(1, Math.max(0, 1 - secondsLeft / totalSeconds))
  const timeDisplay = isStudyOvertime ? `+${formatTimer(overtimeSeconds)}` : formatTimer(secondsLeft)
  const modeLabel = isStudyOvertime ? "Overtime" : mode === "work" ? "Focus" : mode === "long-break" ? "Long Break" : "Break"
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
  const elapsedSeconds = isStudyOvertime ? overtimeSeconds : Math.max(0, totalSeconds - secondsLeft)
  const nextModeLabel = mode === "work"
    ? (cycles + 1) % 4 === 0 ? "Long break next" : "Break next"
    : isStudyOvertime ? "Break held" : "Focus next"
  const sessionStateLabel = activeSessionId
    ? isStudyOvertime ? "Overtime study is logging" : "Calendar logging is active"
    : mode === "work"
      ? "Start focus to create a study session"
      : "Rest period is not logged"
  const todayAnalytics = useMemo(() => {
    const { startMs, endMs } = getTodayRange(analyticsNow)
    const todaySessions = sessions.filter((session) => {
      const startMsValue = new Date(session.startTime).getTime()
      return Number.isFinite(startMsValue) && startMsValue >= startMs && startMsValue < endMs
    })
    const totalMinutes = todaySessions.reduce((sum, session) => sum + getSessionMinutes(session, analyticsNow), 0)
    const completedBlocks = todaySessions.filter((session) => session.status === "completed").length
    const activeBlocks = todaySessions.filter((session) => session.status === "in-progress").length
    const subjectMinutes = new Map<string, number>()

    todaySessions.forEach((session) => {
      const minutes = getSessionMinutes(session, analyticsNow)
      if (session.subjectIds.length === 0) return
      const minutesPerSubject = minutes / session.subjectIds.length
      session.subjectIds.forEach((subjectId) => {
        subjectMinutes.set(subjectId, (subjectMinutes.get(subjectId) ?? 0) + minutesPerSubject)
      })
    })

    const topSubject = Array.from(subjectMinutes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([subjectId, minutes]) => {
        const subject = subjects.find((item) => item.id === subjectId)
        return { subject, minutes }
      })[0]

    return {
      totalMinutes,
      completedBlocks,
      activeBlocks,
      topSubject,
    }
  }, [analyticsNow, sessions, subjects])
  const projectedFocusMinutes = mode === "work"
    ? Math.ceil(secondsLeft / 60)
    : settings.workMinutes
  const currentBlockDetail = isStudyOvertime
    ? `${formatMinutes(Math.ceil(secondsLeft / 60))} break held`
    : mode === "work"
      ? `${formatMinutes(projectedFocusMinutes)} focus remaining`
      : `${formatMinutes(Math.ceil(secondsLeft / 60))} rest remaining`
  const progressPercent = Math.round(progress * 100)
  const progressDetail = isStudyOvertime ? "overtime" : `${progressPercent}% complete`
  const timerStageDetail = isStudyOvertime ? "Break held · overtime" : `${nextModeLabel} · ${progressPercent}% complete`
  const timerActionLabel = selectedSubjectIds.length === 0
    ? "Pick a subject"
    : isStudyOvertime ? "Resume overtime" : secondsLeft === totalSeconds ? "Start Focus" : "Resume"
  const workbenchTitle = activeSubjects.length > 0
    ? activeSubjects.map((subject) => subject.shortCode).join(" + ")
    : "Focus timer"
  const sessionScopeLabel = selectedProject
    ? selectedProject.name
    : activeSubjects.length > 0 ? activeSubjects.map((subject) => subject.name).join(", ") : "No subject selected"
  const focusTicks = Array.from({ length: 24 }, (_, index) => index)
  const renderFocusView = () => focusViewOpen ? (
    <div
      className="fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-background text-foreground"
      role="dialog"
      aria-modal="true"
      aria-label="Full screen study timer"
    >
      <div className="pointer-events-none absolute inset-0 hairline-grid opacity-30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-primary/8 to-transparent" />
      <div className="relative z-10 flex h-dvh min-h-0 flex-col px-4 pb-2 pt-[calc(var(--app-titlebar-inset)+0.25rem)] sm:px-5 min-[1200px]:px-6">
        <header className="grid shrink-0 gap-2 border-b border-border/60 pb-2 min-[640px]:grid-cols-[minmax(0,1fr)_auto] min-[640px]:items-end">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                "inline-flex h-6 items-center rounded-md border px-2 text-micro font-semibold uppercase tracking-normal",
                mode === "work" || isStudyOvertime
                  ? "border-primary/25 bg-primary/10 text-primary"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
              )}>
                {modeLabel}
              </span>
              <span className="inline-flex h-6 items-center rounded-md border border-border/60 bg-background/55 px-2 text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                Cycle {cycles + 1}
              </span>
              <span className="inline-flex h-6 items-center rounded-md border border-border/60 bg-background/55 px-2 text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                {nextModeLabel}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-heading text-lg font-semibold tracking-normal text-foreground min-[1200px]:text-xl">
                {workbenchTitle}
              </h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{sessionScopeLabel}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 min-[640px]:justify-end">
            <Button
              onClick={handleReset}
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-md bg-background/60"
              aria-label="Reset timer"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              ref={focusCloseButtonRef}
              onClick={closeFocusView}
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-md bg-background/60"
              aria-label="Close full screen timer"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto py-3 min-[740px]:grid-cols-[minmax(0,1fr)_15rem] min-[740px]:overflow-hidden min-[1080px]:grid-cols-[minmax(0,1fr)_20rem] min-[1400px]:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="relative flex min-h-[30rem] flex-col overflow-hidden rounded-lg border border-border/60 bg-card/35 shadow-xs min-[740px]:min-h-0">
            <div className="grid shrink-0 grid-cols-1 border-b border-border/55 bg-background/35 min-[520px]:grid-cols-3">
              <FocusMetric label="Elapsed" value={formatMinutes(Math.ceil(elapsedSeconds / 60))} detail={progressDetail} />
              <FocusMetric label="Remaining" value={formatMinutes(Math.ceil(secondsLeft / 60))} detail={currentBlockDetail} />
              <FocusMetric label="Logged" value={activeSessionId ? "Active" : "Ready"} detail={activeSessionId ? isStudyOvertime ? "Overtime session" : "Calendar session" : "Awaiting start"} />
            </div>

            <div className="relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] px-3 py-3 sm:px-4 min-[1200px]:px-6">
              <div className="pointer-events-none absolute inset-x-4 top-5 h-px bg-border/55" />
              <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-col items-center justify-center text-center">
                <div
                  className={cn(
                    "relative aspect-square w-full max-w-[min(34vh,21rem)] min-[900px]:max-w-[min(38vh,23rem)] min-[1200px]:max-w-[min(42vh,26rem)]",
                    running && "motion-safe:animate-[pulse_4s_ease-in-out_infinite]"
                  )}
                >
                  <svg className="h-full w-full -rotate-90 drop-shadow-sm" viewBox="0 0 260 260" aria-hidden="true">
                    <circle
                      cx="130"
                      cy="130"
                      r="112"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray="2 10"
                      className="text-muted-foreground/18"
                    />
                    <circle
                      cx="130"
                      cy="130"
                      r="96"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-border/70"
                    />
                    <circle
                      cx="130"
                      cy="130"
                      r="112"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-muted-foreground/10"
                    />
                    <circle
                      cx="130"
                      cy="130"
                      r="112"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 112}`}
                      strokeDashoffset={`${2 * Math.PI * 112 * (1 - progress)}`}
                      strokeLinecap="round"
                      className={cn(
                        "transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none",
                        mode === "work" || isStudyOvertime ? "text-primary" : "text-emerald-500"
                      )}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
                    <span className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                      {running ? "Timer running" : activeSessionId ? "Timer paused" : "Ready to start"}
                    </span>
                    <span className="mt-2 font-heading text-4xl font-semibold leading-none tabular-nums tracking-normal text-foreground min-[520px]:text-5xl min-[1200px]:text-6xl">
                      {timeDisplay}
                    </span>
                    <span className={cn("mt-4 text-sm font-semibold", modeColor)}>
                      {timerStageDetail}
                    </span>
                  </div>
                </div>

                <div className="mt-4 w-full max-w-3xl">
                  <div className="grid grid-cols-6 gap-1" aria-hidden="true">
                    {focusTicks.map((tick) => {
                      const isFilled = tick / (focusTicks.length - 1) <= progress
                      return (
                        <span
                          key={tick}
                          className={cn(
                            "h-1.5 rounded-full transition-colors duration-700 motion-reduce:transition-none",
                            isFilled
                              ? mode === "work" || isStudyOvertime ? "bg-primary" : "bg-emerald-500"
                              : "bg-muted"
                          )}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                    <span>0m</span>
                    <span>{formatMinutes(Math.ceil(totalSeconds / 60))}</span>
                  </div>
                </div>

              </div>

              <div className="mx-auto mt-3 w-full max-w-3xl border-t border-border/55 pt-3">
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={handleToggle}
                    disabled={mode === "work" && !canStartFocus && !running}
                    size="lg"
                    variant={running ? "outline" : "default"}
                    className="h-11 flex-1 gap-2 rounded-md text-sm"
                  >
                    {running ? (
                      <>
                        <Pause className="h-4 w-4" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> {timerActionLabel}
                      </>
                    )}
                  </Button>
                  {isStudyOvertime ? (
                    <Button
                      onClick={handleReturnToBreak}
                      disabled={saving}
                      size="lg"
                      variant="default"
                      className="h-11 flex-1 gap-2 rounded-md text-sm"
                    >
                      <Coffee className="h-4 w-4" />
                      break time!
                    </Button>
                  ) : activeSessionId && (
                    <Button
                      onClick={handleFinish}
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
                      onClick={handleSkipBreak}
                      size="sm"
                      variant="ghost"
                      className="h-10 gap-2 rounded-md text-sm"
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip
                    </Button>
                    <Button
                      onClick={handleStartStudyOvertime}
                      disabled={!canStartFocus}
                      size="sm"
                      variant="outline"
                      className="h-10 min-w-0 gap-2 rounded-md text-sm"
                    >
                      <BookOpen className="h-4 w-4" />
                      Study overtime
                    </Button>
                    <Button
                      onClick={handleMoreBreakTime}
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
            </div>
          </main>

          <aside className="flex min-h-0 flex-col gap-3 min-[740px]:overflow-y-auto min-[740px]:pr-1">
            <section className="rounded-lg border border-border/60 bg-card/45 px-3 py-1.5 shadow-xs">
              <div className="flex items-center justify-between gap-3 border-b border-border/55 py-2.5">
                <div>
                  <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">Focus Record</p>
                  <p className="mt-1 text-sm font-medium text-foreground">Today&apos;s timer context</p>
                </div>
                <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <FocusStat
                label="Today"
                value={formatMinutes(todayAnalytics.totalMinutes)}
                detail={`${todayAnalytics.completedBlocks} completed block${todayAnalytics.completedBlocks === 1 ? "" : "s"}${todayAnalytics.activeBlocks > 0 ? " · active now" : ""}`}
                icon={<BarChart3 className="h-4 w-4" />}
              />
              <FocusStat
                label="Current Block"
                value={formatMinutes(Math.ceil(elapsedSeconds / 60))}
                detail={currentBlockDetail}
                icon={<Timer className="h-4 w-4" />}
              />
              <FocusStat
                label="Momentum"
                value={`${cycles}`}
                detail={`Completed focus cycle${cycles === 1 ? "" : "s"} in this Pomodoro run`}
                icon={<Target className="h-4 w-4" />}
              />
              <FocusStat
                label="Top Subject"
                value={todayAnalytics.topSubject?.subject?.shortCode ?? "None"}
                detail={todayAnalytics.topSubject ? `${formatMinutes(todayAnalytics.topSubject.minutes)} logged today` : "Start a block to build today's focus record"}
                icon={<BookOpen className="h-4 w-4" />}
              />
            </section>

            <section className="rounded-lg border border-border/60 bg-card/45 p-3 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">Session</p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">{sessionStateLabel}</p>
                </div>
                <Coffee className={cn("h-5 w-5 shrink-0", mode === "work" || isStudyOvertime ? "text-muted-foreground" : "text-emerald-500")} />
              </div>

              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">Subjects</p>
                    <span className="text-micro font-medium text-muted-foreground">{activeSubjects.length} selected</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {subjects.map((subject) => {
                      const selected = selectedSubjectIds.includes(subject.id)
                      return (
                        <button
                          key={subject.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => handleSubjectClick(subject.id)}
                          className={cn(
                            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/35",
                            selected
                              ? "border-transparent bg-primary/10 text-primary"
                              : "border-border/70 bg-background/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          )}
                          style={selected ? {
                            backgroundColor: `${subject.color}18`,
                            borderColor: `${subject.color}40`,
                            color: subject.color,
                          } : undefined}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: subject.color }} />
                          {subject.shortCode}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["workMinutes", "Focus"],
                    ["breakMinutes", "Break"],
                    ["longBreakMinutes", "Long"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="space-y-1">
                      <span className="block text-micro font-semibold uppercase tracking-normal text-muted-foreground">{label}</span>
                      <Input
                        type="number"
                        min={MIN_DURATION_MINUTES}
                        max={MAX_DURATION_MINUTES}
                        step={1}
                        value={settings[key]}
                        onChange={(event) => updateDuration(key, event.target.value)}
                        className="h-8 rounded-md px-2 text-center text-sm tabular-nums"
                        aria-label={`${label} minutes`}
                      />
                    </label>
                  ))}
                </div>

                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">Block Signal</p>
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {activeSessionId ? isStudyOvertime ? "Overtime is extending calendar study" : "Session is writing to the calendar" : mode === "work" ? "Starting focus will create a calendar block" : "Breaks stay off the calendar"}
                  </p>
                </div>

                {selectedProject && (
                  <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                    <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">Assessment Link</p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{selectedProject.name}</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  ) : null

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

  const startTimerSession = async (durationSeconds: number): Promise<boolean> => {
    if (activeSessionIdRef.current || selectedSubjectIds.length === 0) return false
    const session = await onStartSession({
      subjectIds: selectedSubjectIds,
      durationSeconds,
      projectId: activeProjectId,
      cycleNumber: cycles + 1,
    })
    activeSessionIdRef.current = session.id
    setActiveSessionId(session.id)
    return true
  }

  const startFocusSession = async (): Promise<boolean> => {
    if (mode !== "work") return false
    return startTimerSession(secondsLeft)
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

  const handleStartStudyOvertime = async () => {
    if (mode === "work" || isStudyOvertime || activeSessionIdRef.current || !canStartFocus) return

    dispatch({ type: "START_STUDY_OVERTIME", settings: settingsRef.current })
    setSaving(true)
    try {
      const started = await startTimerSession(settings.workMinutes * 60)
      if (!started) dispatch({ type: "RETURN_TO_BREAK" })
    } catch (e) {
      console.error("Failed to start overtime session:", e)
      dispatch({ type: "RETURN_TO_BREAK" })
    } finally {
      setSaving(false)
    }
  }

  const handleReturnToBreak = async () => {
    if (!isStudyOvertime) return

    setSaving(true)
    try {
      await completeActiveSession()
    } finally {
      setSaving(false)
      dispatch({ type: "RETURN_TO_BREAK" })
    }
  }

  const handleSkipBreak = () => {
    if (mode === "work" || isStudyOvertime) return
    dispatch({ type: "SKIP_BREAK", settings })
  }

  const handleMoreBreakTime = () => {
    if (mode === "work" || isStudyOvertime) return
    dispatch({ type: "ADD_BREAK_TIME", minutes: EXTRA_BREAK_MINUTES })
  }

  const focusPortal = focusViewOpen ? createPortal(renderFocusView(), document.body) : null

  if (isCollapsed) {
    return (
      <>
        {focusPortal}
        <div className="flex justify-center py-2">
          <button
            onClick={onExpand}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring/35",
              running ? modeColor : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Expand Pomodoro timer"
            title={running ? `${timeDisplay} - ${modeLabel} - ${activeSubjectLabel}` : "Pomodoro"}
          >
            <Timer className="h-4 w-4" />
          </button>
        </div>
      </>
    )
  }

  if (!expanded) {
    return (
      <>
        {focusPortal}
        <div className="border-t border-sidebar-border/70 px-3 py-2">
          <button
            onClick={() => setExpanded(true)}
            className="flex min-h-8 w-full items-center gap-2 rounded-xl py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
            aria-label="Expand Pomodoro timer"
          >
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span className={cn("font-heading tabular-nums", running && modeColor)}>
              {running ? timeDisplay : "Pomodoro"}
            </span>
            {running && (
              <span className={cn("text-micro font-medium ml-auto", modeColor)}>{activeSubjectLabel}</span>
            )}
            <ChevronUp className="h-3 w-3 ml-auto" />
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {focusPortal}
      <div className="space-y-3 border-t border-sidebar-border/70 px-3 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setExpanded(false)}
            className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-xl py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
            aria-label="Collapse Pomodoro timer"
          >
            <Timer className="h-3.5 w-3.5" />
            Pomodoro
            <ChevronDown className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={openFocusView}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-label="Open full screen timer"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            <button
              onClick={handleReset}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-label="Reset timer"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
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
              className="h-8 rounded-lg px-2 text-center text-control tabular-nums"
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
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/35",
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
                mode === "work" || isStudyOvertime ? "text-primary" : "text-emerald-500"
              )}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-heading text-lg font-semibold leading-tight tabular-nums">{timeDisplay}</span>
          </div>
        </div>

        <Button
          onClick={handleToggle}
          disabled={mode === "work" && !canStartFocus && !running}
          size="sm"
          variant={running ? "outline" : "default"}
          className="mt-3 h-8 w-full gap-1.5 rounded-xl text-control"
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
            onClick={handleReturnToBreak}
            disabled={saving}
            size="sm"
            variant="default"
            className="mt-1.5 h-8 w-full gap-1.5 rounded-xl text-control"
          >
            <Coffee className="h-3 w-3" />
            break time!
          </Button>
        ) : activeSessionId && (
          <Button
            onClick={handleFinish}
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
              onClick={handleSkipBreak}
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 rounded-xl text-control text-muted-foreground hover:text-foreground"
            >
              <SkipForward className="h-3 w-3" />
              Skip
            </Button>
            <Button
              onClick={handleStartStudyOvertime}
              disabled={!canStartFocus}
              size="sm"
              variant="outline"
              className="h-8 min-w-0 gap-1.5 rounded-xl px-1.5 text-control"
            >
              <BookOpen className="h-3 w-3" />
              Study
            </Button>
            <Button
              onClick={handleMoreBreakTime}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 rounded-xl text-control"
            >
              <Plus className="h-3 w-3" />
              {EXTRA_BREAK_MINUTES} min
            </Button>
          </div>
        )}
      </div>
    </div>
  </>
  )
}
