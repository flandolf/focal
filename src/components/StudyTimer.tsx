import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useReducer,
  useMemo,
  memo,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  RotateCcw,
  Timer,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MOTION_EASE, REDUCED_TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  VCE_SUBJECTS,
  type Project,
  type StudySession,
  type ConfidenceScore,
  type Subject,
} from "@/lib/types";
import { FocusView } from "@/components/timer/FocusView";
import { TimerControls } from "@/components/timer/TimerControls";
import { SubjectPicker } from "@/components/timer/SubjectPicker";
import { DurationInputs } from "@/components/timer/DurationInputs";
import { RecoveryDialog } from "@/components/timer/RecoveryDialog";

const TIMER_SETTINGS_KEY = "focal-pomodoro-settings";
const TIMER_STATE_KEY = "focal-pomodoro-state";
const DEFAULT_SETTINGS = {
  workMinutes: 25,
  breakMinutes: 5,
  longBreakMinutes: 15,
};
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 180;
const EXTRA_BREAK_MINUTES = 5;

type TimerMode = "work" | "break" | "long-break";

interface TimerSettings {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
}

interface TimerState {
  running: boolean;
  mode: TimerMode;
  secondsLeft: number;
  cycles: number;
  studyOvertime: boolean;
  overtimeSeconds: number;
}

type TimerAction =
  | { type: "TICK"; settings: TimerSettings; seconds: number }
  | { type: "TOGGLE" }
  | { type: "RESET"; settings: TimerSettings }
  | { type: "SKIP_BREAK"; settings: TimerSettings }
  | { type: "ADD_BREAK_TIME"; minutes: number }
  | { type: "START_STUDY_OVERTIME"; settings: TimerSettings }
  | { type: "RETURN_TO_BREAK" }
  | {
      type: "SYNC_SETTINGS";
      settings: TimerSettings;
      previousSettings: TimerSettings;
    };

interface StoredTimerState {
  running: boolean;
  mode: TimerMode;
  secondsLeft: number;
  cycles: number;
  studyOvertime?: boolean;
  overtimeSeconds?: number;
  activeSessionId?: string | null;
  updatedAt: number;
}

function getDurationSeconds(mode: TimerMode, settings: TimerSettings) {
  if (mode === "work") return settings.workMinutes * 60;
  if (mode === "long-break") return settings.longBreakMinutes * 60;
  return settings.breakMinutes * 60;
}

function clampMinutes(value: number) {
  if (!Number.isFinite(value)) return MIN_DURATION_MINUTES;
  return Math.min(
    MAX_DURATION_MINUTES,
    Math.max(MIN_DURATION_MINUTES, Math.round(value)),
  );
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function parseSettings(value: string | null): TimerSettings {
  if (!value) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(value) as Partial<TimerSettings>;
    return {
      workMinutes: clampMinutes(
        parsed.workMinutes ?? DEFAULT_SETTINGS.workMinutes,
      ),
      breakMinutes: clampMinutes(
        parsed.breakMinutes ?? DEFAULT_SETTINGS.breakMinutes,
      ),
      longBreakMinutes: clampMinutes(
        parsed.longBreakMinutes ?? DEFAULT_SETTINGS.longBreakMinutes,
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getInitialSettings() {
  return parseSettings(localStorage.getItem(TIMER_SETTINGS_KEY));
}

function isValidMode(mode: unknown): mode is TimerMode {
  return mode === "work" || mode === "break" || mode === "long-break";
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for the runnable timer self-check
export function advanceTimer(
  state: TimerState,
  settings: TimerSettings,
  elapsedSeconds: number,
): TimerState {
  let next = state;
  let remaining = Math.max(0, Math.floor(elapsedSeconds));

  if (next.studyOvertime) {
    return { ...next, overtimeSeconds: next.overtimeSeconds + remaining };
  }

  while (remaining > 0 && next.running) {
    if (remaining < next.secondsLeft) {
      return { ...next, secondsLeft: next.secondsLeft - remaining };
    }

    remaining -= next.secondsLeft;
    if (next.mode === "work") {
      const cycles = next.cycles + 1;
      const mode = cycles % 4 === 0 ? "long-break" : "break";
      next = {
        running: true,
        mode,
        secondsLeft: getDurationSeconds(mode, settings),
        cycles,
        studyOvertime: false,
        overtimeSeconds: 0,
      };
    } else {
      return {
        running: false,
        mode: "work",
        secondsLeft: getDurationSeconds("work", settings),
        cycles: next.cycles,
        studyOvertime: false,
        overtimeSeconds: 0,
      };
    }
  }

  return next;
}

function getInitialState(settings: TimerSettings): TimerState {
  const fallback: TimerState = {
    running: false,
    mode: "work",
    secondsLeft: getDurationSeconds("work", settings),
    cycles: 0,
    studyOvertime: false,
    overtimeSeconds: 0,
  };

  try {
    const stored = localStorage.getItem(TIMER_STATE_KEY);
    if (!stored) return fallback;

    const parsed = JSON.parse(stored) as Partial<StoredTimerState>;
    const mode = isValidMode(parsed.mode) ? parsed.mode : fallback.mode;
    const duration = getDurationSeconds(mode, settings);
    const updatedAt =
      typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now();
    const elapsedSeconds = parsed.running
      ? Math.max(0, Math.floor((Date.now() - updatedAt) / 1000))
      : 0;
    const cycles = Math.max(0, Math.round(parsed.cycles ?? 0));
    const studyOvertime = parsed.studyOvertime === true && mode !== "work";
    const overtimeSeconds = Math.max(
      0,
      Math.round(parsed.overtimeSeconds ?? 0),
    );

    if (studyOvertime) {
      return {
        running: parsed.running === true,
        mode,
        secondsLeft: Math.min(
          duration,
          Math.max(1, Math.round(parsed.secondsLeft ?? duration)),
        ),
        cycles,
        studyOvertime: true,
        overtimeSeconds: parsed.running
          ? overtimeSeconds + elapsedSeconds
          : overtimeSeconds,
      };
    }

    if (parsed.running) {
      return advanceTimer({
        running: true,
        mode,
        secondsLeft: Math.min(
          duration,
          Math.max(1, Math.round(parsed.secondsLeft ?? duration)),
        ),
        cycles,
        studyOvertime: false,
        overtimeSeconds: 0,
      }, settings, elapsedSeconds);
    }

    return {
      running: false,
      mode,
      secondsLeft: Math.min(
        duration,
        Math.max(1, Math.round(parsed.secondsLeft ?? duration)),
      ),
      cycles,
      studyOvertime: false,
      overtimeSeconds: 0,
    };
  } catch {
    return fallback;
  }
}

function timerReducer(state: TimerState, action: TimerAction): TimerState {
  switch (action.type) {
    case "TICK":
      return advanceTimer(state, action.settings, action.seconds);
    case "TOGGLE":
      return { ...state, running: !state.running };
    case "RESET":
      return {
        running: false,
        mode: "work",
        secondsLeft: getDurationSeconds("work", action.settings),
        cycles: 0,
        studyOvertime: false,
        overtimeSeconds: 0,
      };
    case "SKIP_BREAK":
      if (state.mode === "work" || state.studyOvertime) return state;
      return {
        running: false,
        mode: "work",
        secondsLeft: getDurationSeconds("work", action.settings),
        cycles: state.cycles,
        studyOvertime: false,
        overtimeSeconds: 0,
      };
    case "ADD_BREAK_TIME":
      if (state.mode === "work" || state.studyOvertime) return state;
      return { ...state, secondsLeft: state.secondsLeft + action.minutes * 60 };
    case "START_STUDY_OVERTIME": {
      if (state.mode === "work") return state;
      const totalBreakSeconds = getDurationSeconds(state.mode, action.settings);
      const elapsedBreakSeconds = totalBreakSeconds - state.secondsLeft;
      return {
        ...state,
        running: true,
        studyOvertime: true,
        overtimeSeconds: elapsedBreakSeconds,
      };
    }
    case "RETURN_TO_BREAK":
      if (!state.studyOvertime) return state;
      return {
        ...state,
        running: true,
        studyOvertime: false,
        overtimeSeconds: 0,
      };
    case "SYNC_SETTINGS": {
      const oldDuration = getDurationSeconds(
        state.mode,
        action.previousSettings,
      );
      const nextDuration = getDurationSeconds(state.mode, action.settings);
      const secondsLeft =
        state.secondsLeft === oldDuration
          ? nextDuration
          : Math.min(state.secondsLeft, nextDuration);
      return { ...state, secondsLeft };
    }
    default:
      return state;
  }
}

interface StudyTimerProps {
  isCollapsed?: boolean;
  onExpand?: () => void;
  customSubjects?: Subject[];
  availableSubjects?: Subject[];
  sessions?: StudySession[];
  selectedProject?: Project;
  onSearch?: () => void;
  onSettings?: () => void;
  onStartSession: (data: {
    subjectIds: string[];
    durationSeconds: number;
    projectId?: string;
    cycleNumber: number;
  }) => Promise<StudySession>;
  onUpdateSession: (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>,
  ) => Promise<void>;
  onDeleteSession?: (id: string) => Promise<void>;
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getSessionMinutes(session: StudySession, now?: Date) {
  const startMs = new Date(session.startTime).getTime();
  const plannedEndMs = new Date(session.endTime).getTime();
  const endMs =
    session.status === "in-progress" && now
      ? Math.min(plannedEndMs, now.getTime())
      : plannedEndMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
    return 0;
  return Math.round((endMs - startMs) / 60000);
}

function getTodayRange(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

const StudyTimerInner = memo(function StudyTimerInner({
  isCollapsed = false,
  onExpand,
  customSubjects = [],
  availableSubjects,
  sessions = [],
  selectedProject,
  onSearch,
  onSettings,
  onStartSession,
  onUpdateSession,
  onDeleteSession,
}: StudyTimerProps) {
  const [expanded, setExpanded] = useState(false);
  const [focusViewOpen, setFocusViewOpen] = useState(false);
  const [analyticsNow, setAnalyticsNow] = useState(() => new Date());
  const [settings, setSettings] = useState<TimerSettings>(getInitialSettings);
  const [state, dispatch] = useReducer(timerReducer, settings, getInitialState);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>(() =>
    selectedProject?.subjectId ? [selectedProject.subjectId] : [],
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(TIMER_STATE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as Partial<StoredTimerState>;
      return typeof parsed.activeSessionId === "string"
        ? parsed.activeSessionId
        : null;
    } catch {
      return null;
    }
  });
  const [saving, setSaving] = useState(false);
  const [reflectionSessionId, setReflectionSessionId] = useState<string | null>(
    null,
  );
  const [reflectionConfidence, setReflectionConfidence] = useState<
    ConfidenceScore | undefined
  >(undefined);
  const [reflectionBlockers, setReflectionBlockers] = useState("");
  const [reflectionNextAction, setReflectionNextAction] = useState("");
  const [recoverySessionId, setRecoverySessionId] = useState<string | null>(
    () => {
      try {
        const stored = localStorage.getItem(TIMER_STATE_KEY);
        if (!stored) return null;
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        if (
          parsed.running &&
          typeof parsed.activeSessionId === "string" &&
          parsed.activeSessionId
        ) {
          return parsed.activeSessionId;
        }
      } catch {
        /* ignore parse errors */
      }
      return null;
    },
  );      const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(
    recoverySessionId !== null,
  );
  const reduceMotion = useReducedMotion() === true;
  const expandedRef = useRef<HTMLDivElement>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const activeSessionRef = useRef<StudySession | null>(null);
  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  const lastTickAtRef = useRef(Date.now());
  const isInitialMountRef = useRef(true);
  const completionInFlightRef = useRef(false);
  const savingRef = useRef(false);
  const focusCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedProjectSubjectId = selectedProject?.subjectId;

  const setFocusViewWithTransition = useCallback((nextOpen: boolean) => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // ponytail: broadcast focus-state changes so siblings (AI Assistant Panel)
    // can react without prop-drilling through the Sidebar — same pattern as
    // `focal-timetable-updated` / `focal-sync-data-changed`.
    window.dispatchEvent(
      new CustomEvent("focal-focus-mode-changed", { detail: { active: nextOpen } }),
    )

    const apply = () => setFocusViewOpen(nextOpen)

    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(apply)
      return;
    }

    apply()
  }, []);

  const openFocusView = useCallback(
    () => setFocusViewWithTransition(true),
    [setFocusViewWithTransition],
  );
  const closeFocusView = useCallback(
    () => setFocusViewWithTransition(false),
    [setFocusViewWithTransition],
  );

  const subjects = useMemo(() => {
    const baseSubjects = availableSubjects ?? [
      ...VCE_SUBJECTS,
      ...customSubjects,
    ];
    if (
      !selectedProjectSubjectId ||
      baseSubjects.some((subject) => subject.id === selectedProjectSubjectId)
    ) {
      return baseSubjects;
    }
    const projectSubject = [...VCE_SUBJECTS, ...customSubjects].find(
      (subject) => subject.id === selectedProjectSubjectId,
    );
    return projectSubject ? [projectSubject, ...baseSubjects] : baseSubjects;
  }, [availableSubjects, customSubjects, selectedProjectSubjectId]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    activeSessionRef.current = activeSessionId
      ? sessions.find((session) => session.id === activeSessionId) ??
        activeSessionRef.current
      : null;
  }, [activeSessionId, sessions]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setAnalyticsNow(new Date()),
      60000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedProject?.subjectId || activeSessionIdRef.current) return;
    setSelectedSubjectIds((current) =>
      current.length > 0 || !selectedProject.subjectId
        ? current
        : [selectedProject.subjectId],
    );
  }, [selectedProject?.subjectId]);

  const completeActiveSession = useCallback(
    async (nextEndTime = new Date()) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId || completionInFlightRef.current) return false;
      completionInFlightRef.current = true;

      try {
        const session =
          activeSessionRef.current ??
          sessions.find((item) => item.id === sessionId) ??
          null;
        const endTime = nextEndTime.toISOString();
        const activeDurations = session?.activeDurations?.map((period, index, periods) =>
          index === periods.length - 1 ? { ...period, end: endTime } : period,
        );
        const updates = {
          endTime,
          ...(activeDurations ? { activeDurations } : {}),
          status: "completed",
          completedAt: endTime,
        } satisfies Partial<Omit<StudySession, "id" | "created_at">>;
        await onUpdateSession(sessionId, updates);
        activeSessionRef.current = session ? { ...session, ...updates } : null;
        setReflectionSessionId(sessionId);
        setReflectionConfidence(undefined);
        setReflectionBlockers("");
        setReflectionNextAction("");
        activeSessionIdRef.current = null;
        activeSessionRef.current = null;
        setActiveSessionId(null);
        return true;
      } catch (e) {
        console.error("Failed to complete session:", e);
        return false;
      } finally {
        completionInFlightRef.current = false;
      }
    },
    [onUpdateSession, sessions],
  );

  const handleRecoveryResume = useCallback(() => {
    setRecoveryDialogOpen(false);
    setRecoverySessionId(null);
  }, []);

  const handleRecoveryFinish = useCallback(async () => {
    if (!recoverySessionId) return;
    try {
      const completedAt = new Date().toISOString();
      await onUpdateSession(recoverySessionId, {
        endTime: completedAt,
        status: "completed",
        completedAt,
      });
      activeSessionIdRef.current = null;
      activeSessionRef.current = null;
      setActiveSessionId(null);
      setRecoverySessionId(null);
      setRecoveryDialogOpen(false);
      dispatch({ type: "RESET", settings });
    } catch (e) {
      console.error("Failed to complete recovered session:", e);
    }
  }, [recoverySessionId, onUpdateSession, settings]);

  const handleRecoveryDiscard = useCallback(async () => {
    if (!recoverySessionId || !onDeleteSession) return;
    try {
      await onDeleteSession(recoverySessionId);
      activeSessionIdRef.current = null;
      activeSessionRef.current = null;
      setActiveSessionId(null);
      setRecoverySessionId(null);
      setRecoveryDialogOpen(false);
      dispatch({ type: "RESET", settings });
    } catch (e) {
      console.error("Failed to discard recovered session:", e);
    }
  }, [recoverySessionId, onDeleteSession, settings]);

  useEffect(() => {
    if (!isInitialMountRef.current) return;
    isInitialMountRef.current = false;
    if (
      state.mode !== "work" &&
      !state.studyOvertime &&
      activeSessionIdRef.current
    ) {
      void completeActiveSession();
    }
  }, [state.mode, state.studyOvertime, completeActiveSession]);

  useEffect(() => {
    localStorage.setItem(TIMER_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(
      TIMER_STATE_KEY,
      JSON.stringify({
        ...state,
        activeSessionId,
        updatedAt: Date.now(),
      } satisfies StoredTimerState),
    );
  }, [activeSessionId, settings, state]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const onTick = useCallback(() => {
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - lastTickAtRef.current) / 1000);
    if (elapsedSeconds < 1) return;
    const current = stateRef.current;
    if (
      current.running &&
      current.mode === "work" &&
      !current.studyOvertime &&
      elapsedSeconds >= current.secondsLeft
    ) {
      void completeActiveSession(new Date(
        lastTickAtRef.current + current.secondsLeft * 1000,
      ));
    }
    lastTickAtRef.current += elapsedSeconds * 1000;
    dispatch({
      type: "TICK",
      settings: settingsRef.current,
      seconds: elapsedSeconds,
    });
  }, [completeActiveSession]);

  useEffect(() => {
    if (!state.running) {
      clearTimer();
      return;
    }

    clearTimer();
    lastTickAtRef.current = Date.now();
    intervalRef.current = setInterval(onTick, 250);
    return clearTimer;
  }, [state.running, onTick, clearTimer]);

  const { running, mode, secondsLeft, cycles, studyOvertime, overtimeSeconds } =
    state;
  const isStudyOvertime = studyOvertime && mode !== "work";
  const totalSeconds = getDurationSeconds(mode, settings);
  const progress = isStudyOvertime
    ? 1
    : Math.min(1, Math.max(0, 1 - secondsLeft / totalSeconds));
  const timeDisplay = isStudyOvertime
    ? `+${formatTimer(overtimeSeconds)}`
    : formatTimer(secondsLeft);
  const modeLabel = isStudyOvertime
    ? "Overtime"
    : mode === "work"
      ? "Focus"
      : mode === "long-break"
        ? "Long Break"
        : "Break";
  const modeColor =
    mode === "work" || isStudyOvertime ? "" : "text-emerald-500";
  const activeSubjects = subjects.filter((subject) =>
    selectedSubjectIds.includes(subject.id),
  );
  const activeSubjectLabel =
    activeSubjects.length === 0
      ? "No subject"
      : activeSubjects.length === 1
        ? activeSubjects[0].shortCode
        : `${activeSubjects.length} subjects`;
  const activeProjectId =
    selectedProject &&
    selectedSubjectIds.includes(selectedProject.subjectId ?? "")
      ? selectedProject.id
      : undefined;
  const canStartFocus = selectedSubjectIds.length > 0 && !saving;
  const elapsedSeconds = isStudyOvertime
    ? overtimeSeconds
    : Math.max(0, totalSeconds - secondsLeft);
  const nextModeLabel =
    mode === "work"
      ? (cycles + 1) % 4 === 0
        ? "Long break next"
        : "Break next"
      : isStudyOvertime
        ? "Break held"
        : "Focus next";
  const sessionStateLabel = activeSessionId
    ? isStudyOvertime
      ? "Overtime study is logging"
      : "Timer is active"
    : mode === "work"
      ? "Start focus to create a study session"
      : "Rest period is not logged";
  const todayAnalytics = useMemo(() => {
    const { startMs, endMs } = getTodayRange(analyticsNow);
    const todaySessions = sessions.filter((session) => {
      const startMsValue = new Date(session.startTime).getTime();
      return (
        Number.isFinite(startMsValue) &&
        startMsValue >= startMs &&
        startMsValue < endMs
      );
    });
    const totalMinutes = todaySessions.reduce(
      (sum, session) => sum + getSessionMinutes(session, analyticsNow),
      0,
    );
    const completedBlocks = todaySessions.filter(
      (session) => session.status === "completed",
    ).length;
    const activeBlocks = todaySessions.filter(
      (session) => session.status === "in-progress",
    ).length;
    const subjectMinutes = new Map<string, number>();

    todaySessions.forEach((session) => {
      const minutes = getSessionMinutes(session, analyticsNow);
      if (session.subjectIds.length === 0) return;
      const minutesPerSubject = minutes / session.subjectIds.length;
      session.subjectIds.forEach((subjectId) => {
        subjectMinutes.set(
          subjectId,
          (subjectMinutes.get(subjectId) ?? 0) + minutesPerSubject,
        );
      });
    });

    const topSubject = Array.from(subjectMinutes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([subjectId, minutes]) => {
        const subject = subjects.find((item) => item.id === subjectId);
        return { subject, minutes };
      })[0];

    return {
      totalMinutes,
      completedBlocks,
      activeBlocks,
      topSubject,
    };
  }, [analyticsNow, sessions, subjects]);
  const projectedFocusMinutes =
    mode === "work" ? Math.ceil(secondsLeft / 60) : settings.workMinutes;
  const currentBlockDetail = isStudyOvertime
    ? `${formatMinutes(Math.ceil(secondsLeft / 60))} break held`
    : mode === "work"
      ? `${formatMinutes(projectedFocusMinutes)} focus remaining`
      : `${formatMinutes(Math.ceil(secondsLeft / 60))} rest remaining`;
  const progressPercent = Math.round(progress * 100);
  const progressDetail = isStudyOvertime
    ? "overtime"
    : `${progressPercent}% complete`;
  const timerStageDetail = isStudyOvertime
    ? "Break held · overtime"
    : `${nextModeLabel} · ${progressPercent}% complete`;
  const timerActionLabel =
    selectedSubjectIds.length === 0
      ? "Pick a subject"
      : isStudyOvertime
        ? "Resume overtime"
        : secondsLeft === totalSeconds
          ? "Start Focus"
          : "Resume";
  const workbenchTitle =
    activeSubjects.length > 0
      ? activeSubjects.map((subject) => subject.shortCode).join(" + ")
      : "Focus timer";
  const sessionScopeLabel = selectedProject
    ? selectedProject.name
    : activeSubjects.length > 0
      ? activeSubjects.map((subject) => subject.name).join(", ")
      : "No subject selected";

  const updateDuration = (key: keyof TimerSettings, value: string) => {
    const nextValue = clampMinutes(Number(value));
    setSettings((current) => {
      const next = { ...current, [key]: nextValue };
      dispatch({
        type: "SYNC_SETTINGS",
        settings: next,
        previousSettings: current,
      });
      return next;
    });
  };

  const syncActiveSessionSubjects = useCallback(
    async (nextSubjectIds: string[]) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;
      try {
        await onUpdateSession(sessionId, { subjectIds: nextSubjectIds });
        if (activeSessionRef.current) {
          activeSessionRef.current = {
            ...activeSessionRef.current,
            subjectIds: nextSubjectIds,
          };
        }
      } catch (e) {
        console.error("Failed to sync session subjects:", e);
      }
    },
    [onUpdateSession],
  );

  const handleSubjectClick = (subjectId: string) => {
    setSelectedSubjectIds((current) => {
      const next = activeSessionIdRef.current
        ? current.includes(subjectId)
          ? current
          : [...current, subjectId]
        : current.includes(subjectId)
          ? current.filter((id) => id !== subjectId)
          : [...current, subjectId];

      if (activeSessionIdRef.current && next !== current) {
        void syncActiveSessionSubjects(next);
      }

      return next;
    });
  };

  const startTimerSession = async (
    durationSeconds: number,
  ): Promise<boolean> => {
    if (activeSessionIdRef.current || selectedSubjectIds.length === 0)
      return false;
    const session = await onStartSession({
      subjectIds: selectedSubjectIds,
      durationSeconds,
      projectId: activeProjectId,
      cycleNumber: cycles + 1,
    });
    activeSessionIdRef.current = session.id;
    activeSessionRef.current = session;
    setActiveSessionId(session.id);
    setReflectionSessionId(null);
    return true;
  };

  const startFocusSession = async (): Promise<boolean> => {
    if (mode !== "work") return false;
    return startTimerSession(secondsLeft);
  };

  const handleToggle = async () => {
    if (savingRef.current) return;
    if (!running && mode === "work" && !activeSessionIdRef.current) {
      if (!canStartFocus) return;
      savingRef.current = true;
      setSaving(true);
      try {
        const started = await startFocusSession();
        if (started) dispatch({ type: "TOGGLE" });
      } catch (e) {
        console.error("Failed to start session:", e);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      return;
    }

    if (activeSessionIdRef.current && (mode === "work" || isStudyOvertime)) {
      savingRef.current = true;
      setSaving(true);
      try {
        const session = activeSessionRef.current;
        if (!session) return;
        const now = new Date();
        const nowIso = now.toISOString();
        const activeDurations = session.activeDurations?.length
          ? running
            ? session.activeDurations.map((period, index, periods) =>
                index === periods.length - 1 ? { ...period, end: nowIso } : period,
              )
            : [
                ...session.activeDurations,
                {
                  start: nowIso,
                  end: new Date(
                    now.getTime() +
                      (isStudyOvertime
                        ? settings.workMinutes * 60
                        : secondsLeft) *
                        1000,
                  ).toISOString(),
                },
              ]
          : [{ start: session.startTime, end: nowIso }];
        const endTime = activeDurations[activeDurations.length - 1].end;
        await onUpdateSession(session.id, { activeDurations, endTime });
        activeSessionRef.current = { ...session, activeDurations, endTime };
      } catch (e) {
        console.error(`Failed to ${running ? "pause" : "resume"} session:`, e);
        return;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }
    dispatch({ type: "TOGGLE" });
  };

  const handleFinish = async () => {
    if (!activeSessionIdRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (await completeActiveSession()) {
        dispatch({ type: "RESET", settings });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (savingRef.current) return;
    if (activeSessionIdRef.current) {
      savingRef.current = true;
      setSaving(true);
      try {
        if (!(await completeActiveSession())) return;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }
    dispatch({ type: "RESET", settings });
  };

  const handleStartStudyOvertime = async () => {
    if (
      mode === "work" ||
      isStudyOvertime ||
      activeSessionIdRef.current ||
      !canStartFocus
    )
      return;

    savingRef.current = true;
    setSaving(true);
    try {
      const started = await startTimerSession(settings.workMinutes * 60);
      if (started) {
        dispatch({ type: "START_STUDY_OVERTIME", settings: settingsRef.current });
      }
    } catch (e) {
      console.error("Failed to start overtime session:", e);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const saveReflection = useCallback(async () => {
    const sessionId = reflectionSessionId;
    if (!sessionId) return;
    setSaving(true);
    try {
      await onUpdateSession(sessionId, {
        confidence: reflectionConfidence,
        blockers: reflectionBlockers.trim() ? reflectionBlockers : undefined,
        nextAction: reflectionNextAction.trim()
          ? reflectionNextAction
          : undefined,
      });
      setReflectionSessionId(null);
    } catch (e) {
      console.error("Failed to save reflection:", e);
    } finally {
      setSaving(false);
    }
  }, [
    reflectionSessionId,
    reflectionConfidence,
    reflectionBlockers,
    reflectionNextAction,
    onUpdateSession,
  ]);

  const dismissReflection = useCallback(() => {
    setReflectionSessionId(null);
  }, []);

  const handleReturnToBreak = async () => {
    if (!isStudyOvertime || savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    try {
      if (await completeActiveSession()) {
        dispatch({ type: "RETURN_TO_BREAK" });
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSkipBreak = () => {
    if (mode === "work" || isStudyOvertime) return;
    dispatch({ type: "SKIP_BREAK", settings });
  };

  const handleMoreBreakTime = () => {
    if (mode === "work" || isStudyOvertime) return;
    dispatch({ type: "ADD_BREAK_TIME", minutes: EXTRA_BREAK_MINUTES });
  };

  const focusPortal = focusViewOpen
    ? createPortal(
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
          onSearch={onSearch}
          onSettings={onSettings}
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
      )
    : null;

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
        <div className="flex flex-col items-center gap-1 py-1">
          <button
            onClick={onExpand}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-xl outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring/35",
              running
                ? modeColor
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Expand Pomodoro timer"
            title={
              running
                ? `${timeDisplay} - ${modeLabel} - ${activeSubjectLabel}`
                : "Pomodoro"
            }
          >
            <Timer className="h-4 w-4" />
          </button>
          <button
            onClick={openFocusView}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
            aria-label="Open full screen timer"
            title="Open full screen timer"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </>
    );
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
      <div className="border-t border-sidebar-border/70">
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex min-h-8 flex-1 items-center gap-2 rounded-xl py-1 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-label={expanded ? "Collapse Pomodoro timer" : "Expand Pomodoro timer"}
            >
              <Timer className="h-3.5 w-3.5 shrink-0" />
              <span
                className={cn("font-heading tabular-nums", running && modeColor)}
              >
                {running ? timeDisplay : "Pomodoro"}
              </span>
              {running && (
                <span className={cn("text-micro font-medium ml-auto", modeColor)}>
                  {activeSubjectLabel}
                </span>
              )}
              {expanded ? (
                <ChevronDown className="h-3 w-3 ml-auto" />
              ) : (
                <ChevronUp className="h-3 w-3 ml-auto" />
              )}
            </button>
            <button
              onClick={openFocusView}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-label="Open full screen timer"
              title="Open full screen timer"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            <button
              onClick={handleReset}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-label="Reset timer"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              ref={expandedRef}
              key="expanded"
              initial={reduceMotion ? "visible" : "hidden"}
              animate="visible"
              exit={reduceMotion ? "visible" : "hidden"}
              variants={{
                hidden: { height: 0, opacity: 0, overflow: "hidden" },
                visible: { height: "auto", opacity: 1 },
              }}
              transition={reduceMotion ? REDUCED_TRANSITION : { duration: 0.22, ease: MOTION_EASE }}
              className="overflow-hidden"
              onAnimationComplete={() => {
                expandedRef.current?.style.setProperty("overflow", "visible");
              }}
            >
              <div className="space-y-2 px-3 py-2">
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

                <div className="rounded-2xl border border-sidebar-border/70 bg-background/25 p-2">
                  <div className="mx-auto relative h-16 w-16">
                    {/* Flow pressure indicator — pulsing dot when timer is running */}
                    {running && (
                      <div className="flow-pressure absolute -top-0.5 -right-0.5 z-10 h-2.5 w-2.5 rounded-full bg-primary" />
                    )}
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-muted/20"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 34}`}
                        strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress)}`}
                        strokeLinecap="round"
                        className={cn(
                          "transition-[stroke-dashoffset] duration-1000",
                          mode === "work" || isStudyOvertime
                            ? "text-background"
                            : "text-emerald-500",
                        )}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-heading text-lg font-semibold leading-tight tabular-nums">
                        {timeDisplay}
                      </span>
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
                    <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
                      <p className="text-xs font-semibold text-foreground/80">
                        Review this session
                      </p>
                      <div>
                        <p className="text-micro font-medium text-muted-foreground mb-1.5">
                          Confidence
                        </p>
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
                        <p className="text-micro font-medium text-muted-foreground mb-1">
                          Blockers
                        </p>
                        <textarea
                          placeholder="What felt unclear?"
                          value={reflectionBlockers}
                          onChange={(e) => setReflectionBlockers(e.target.value)}
                          rows={2}
                          className="min-h-0 w-full resize-none rounded-lg border border-input bg-background/65 px-2 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                        />
                      </div>
                      <div>
                        <p className="text-micro font-medium text-muted-foreground mb-1">
                          Next action
                        </p>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
});

export const StudyTimer = StudyTimerInner;
