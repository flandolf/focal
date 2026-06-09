import { useState, useEffect, useRef, useCallback, useReducer, useMemo } from "react"
import { createPortal } from "react-dom"
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  RotateCcw,
  Timer,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { VCE_SUBJECTS, type Project, type StudySession, type ConfidenceScore, type Subject } from "@/lib/types"
import { FocusView } from "@/components/timer/FocusView"
import { TimerControls } from "@/components/timer/TimerControls"
import { SubjectPicker } from "@/components/timer/SubjectPicker"
import { DurationInputs } from "@/components/timer/DurationInputs"
import { RecoveryDialog } from "@/components/timer/RecoveryDialog"

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
  onDeleteSession?: (id: string) => Promise<void>
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

export function StudyTimer({
  isCollapsed = false,
  onExpand,
  customSubjects = [],
  availableSubjects,
  sessions = [],
  selectedProject,
  onStartSession,
  onUpdateSession,
  onDeleteSession,
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
  const [reflectionSessionId, setReflectionSessionId] = useState<string | null>(null)
  const [reflectionConfidence, setReflectionConfidence] = useState<ConfidenceScore | undefined>(undefined)
  const [reflectionBlockers, setReflectionBlockers] = useState("")
  const [reflectionNextAction, setReflectionNextAction] = useState("")
  const [recoverySessionId, setRecoverySessionId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(TIMER_STATE_KEY)
      if (!stored) return null
      const parsed = JSON.parse(stored) as Record<string, unknown>
      if (parsed.running && typeof parsed.activeSessionId === "string" && parsed.activeSessionId) {
        return parsed.activeSessionId
      }
    } catch { /* ignore parse errors */ }
    return null
  })
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(recoverySessionId !== null)

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
      setReflectionSessionId(sessionId)
      setReflectionConfidence(undefined)
      setReflectionBlockers("")
      setReflectionNextAction("")
    } catch (e) {
      console.error("Failed to complete session:", e)
    } finally {
      activeSessionIdRef.current = null
      setActiveSessionId(null)
    }
  }, [onUpdateSession])

  const handleRecoveryResume = useCallback(() => {
    setRecoveryDialogOpen(false)
    setRecoverySessionId(null)
  }, [])

  const handleRecoveryFinish = useCallback(async () => {
    if (!recoverySessionId) return
    try {
      await onUpdateSession(recoverySessionId, {
        endTime: new Date().toISOString(),
        status: "completed",
        completedAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error("Failed to complete recovered session:", e)
    } finally {
      activeSessionIdRef.current = null
      setActiveSessionId(null)
      setRecoverySessionId(null)
      setRecoveryDialogOpen(false)
      dispatch({ type: "RESET", settings })
    }
  }, [recoverySessionId, onUpdateSession, settings])

  const handleRecoveryDiscard = useCallback(async () => {
    if (!recoverySessionId) return
    try {
      if (onDeleteSession) {
        await onDeleteSession(recoverySessionId)
      }
    } catch (e) {
      console.error("Failed to discard recovered session:", e)
    } finally {
      activeSessionIdRef.current = null
      setActiveSessionId(null)
      setRecoverySessionId(null)
      setRecoveryDialogOpen(false)
      dispatch({ type: "RESET", settings })
    }
  }, [recoverySessionId, onDeleteSession, settings])

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
  const modeColor = mode === "work" || isStudyOvertime ? "" : "text-emerald-500"
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
    setReflectionSessionId(null)
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

const saveReflection = useCallback(async () => {
    const sessionId = reflectionSessionId
    if (!sessionId) return
    setSaving(true)
    try {
      await onUpdateSession(sessionId, {
        confidence: reflectionConfidence,
        blockers: reflectionBlockers.trim() ? reflectionBlockers : undefined,
        nextAction: reflectionNextAction.trim() ? reflectionNextAction : undefined,
      })
      setReflectionSessionId(null)
    } catch (e) {
      console.error("Failed to save reflection:", e)
    } finally {
      setSaving(false)
    }
  }, [reflectionSessionId, reflectionConfidence, reflectionBlockers, reflectionNextAction, onUpdateSession])

  const dismissReflection = useCallback(() => {
    setReflectionSessionId(null)
  }, [])

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

  const focusPortal = focusViewOpen ? createPortal(
    <FocusView
      running={running}
      mode={mode}
      isStudyOvertime={isStudyOvertime}
      secondsLeft={secondsLeft}
      overtimeSeconds={overtimeSeconds}
      totalSeconds={totalSeconds}
      progress={progress}
      timeDisplay={timeDisplay}
      modeLabel={modeLabel}
      modeColor={modeColor}
      nextModeLabel={nextModeLabel}
      timerStageDetail={timerStageDetail}
      timerActionLabel={timerActionLabel}
      canStartFocus={canStartFocus}
      saving={saving}
      cycles={cycles}
      activeSessionId={activeSessionId}
      elapsedSeconds={elapsedSeconds}
      progressDetail={progressDetail}
      currentBlockDetail={currentBlockDetail}
      todayAnalytics={todayAnalytics}
      subjects={subjects}
      selectedSubjectIds={selectedSubjectIds}
      settings={settings}
      selectedProject={selectedProject}
      workbenchTitle={workbenchTitle}
      sessionScopeLabel={sessionScopeLabel}
      sessionStateLabel={sessionStateLabel}
      onToggle={handleToggle}
      onReset={handleReset}
      onReturnToBreak={handleReturnToBreak}
      onFinish={handleFinish}
      onSkipBreak={handleSkipBreak}
      onStartStudyOvertime={handleStartStudyOvertime}
      onMoreBreakTime={handleMoreBreakTime}
      onSubjectClick={handleSubjectClick}
      onChangeDuration={updateDuration}
      onClose={closeFocusView}
      closeButtonRef={focusCloseButtonRef}
    />,
    document.body,
  ) : null

  if (isCollapsed) {
    return (
      <>
        {focusPortal}
        <RecoveryDialog
          open={recoveryDialogOpen}
          onOpenChange={setRecoveryDialogOpen}
          sessionId={recoverySessionId ?? ""}
          onResume={handleRecoveryResume}
          onFinish={handleRecoveryFinish}
          onDiscard={handleRecoveryDiscard}
        />
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
        <RecoveryDialog
          open={recoveryDialogOpen}
          onOpenChange={setRecoveryDialogOpen}
          sessionId={recoverySessionId ?? ""}
          onResume={handleRecoveryResume}
          onFinish={handleRecoveryFinish}
          onDiscard={handleRecoveryDiscard}
        />
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
      <RecoveryDialog
        open={recoveryDialogOpen}
        onOpenChange={setRecoveryDialogOpen}
        sessionId={recoverySessionId ?? ""}
        onResume={handleRecoveryResume}
        onFinish={handleRecoveryFinish}
        onDiscard={handleRecoveryDiscard}
      />
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

      <DurationInputs
        variant="sidebar"
        settings={settings}
        onChange={updateDuration}
      />

      <SubjectPicker
        variant="sidebar"
        subjects={subjects}
        selectedSubjectIds={selectedSubjectIds}
        activeSessionId={activeSessionId}
        onSubjectClick={handleSubjectClick}
      />

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
                mode === "work" || isStudyOvertime ? "text-background" : "text-emerald-500"
              )}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-heading text-lg font-semibold leading-tight tabular-nums">{timeDisplay}</span>
          </div>
        </div>

        <TimerControls
          variant="sidebar"
          running={running}
          mode={mode}
          isStudyOvertime={isStudyOvertime}
          canStartFocus={canStartFocus}
          saving={saving}
          hasActiveSession={!!activeSessionId}
          timerActionLabel={timerActionLabel}
          onToggle={handleToggle}
          onReturnToBreak={handleReturnToBreak}
          onFinish={handleFinish}
          onSkipBreak={handleSkipBreak}
          onStartStudyOvertime={handleStartStudyOvertime}
          onMoreBreakTime={handleMoreBreakTime}
        />
        {reflectionSessionId && (
          <div className="mt-3 space-y-3 border-t border-border/30 pt-3">
            <p className="text-xs font-semibold text-foreground/80">Review this session</p>
            <div>
              <p className="text-micro font-medium text-muted-foreground mb-1.5">Confidence</p>
              <div className="grid grid-cols-5 gap-1">
                {([1, 2, 3, 4, 5] as ConfidenceScore[]).map((score) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => setReflectionConfidence(score)}
                    aria-pressed={reflectionConfidence === score}
                    className={cn(
                      "h-7 rounded-md border text-xs font-medium transition-colors",
                      reflectionConfidence === score
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 bg-background/45 text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-micro font-medium text-muted-foreground mb-1">Blockers</p>
              <textarea
                placeholder="What felt unclear?"
                value={reflectionBlockers}
                onChange={(e) => setReflectionBlockers(e.target.value)}
                rows={2}
                className="min-h-0 w-full resize-none rounded-lg border border-input bg-background/65 px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
            <div>
              <p className="text-micro font-medium text-muted-foreground mb-1">Next action</p>
              <textarea
                placeholder="e.g. redo practice exam"
                value={reflectionNextAction}
                onChange={(e) => setReflectionNextAction(e.target.value)}
                rows={2}
                className="min-h-0 w-full resize-none rounded-lg border border-input bg-background/65 px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveReflection}
                disabled={saving}
                className="flex-1 h-7 rounded-lg bg-primary text-primary-foreground text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={dismissReflection}
                disabled={saving}
                className="flex-1 h-7 rounded-lg border border-border/70 bg-background/45 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </>
  )
}
