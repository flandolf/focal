import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  BookOpen,
  Coffee,
  Gauge,
  Minimize2,
  PenLine,
  RotateCcw,
  Target,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project, Subject } from "@/lib/types";
import { TitleBar } from "@/components/TitleBar";
import { TimerControls } from "@/components/timer/TimerControls";
import { SubjectPicker } from "@/components/timer/SubjectPicker";
import { DurationInputs } from "@/components/timer/DurationInputs";

interface FocusStatProps {
  label: string;
  value: string;
  icon: ReactNode;
  detail?: string;
}

function FocusStat({ label, value, icon, detail }: FocusStatProps) {
  return (
    <div className="group grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 rounded-md px-1.5 py-2.5 transition-colors duration-200 hover:bg-muted/35">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-muted-foreground ring-1 ring-border/55 transition-colors duration-200 group-hover:text-foreground"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
            {label}
          </p>
          <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
            {value}
          </p>
        </div>
        {detail && (
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

interface FocusMetricProps {
  label: string;
  value: string;
  detail?: string;
}

function FocusMetric({ label, value, detail }: FocusMetricProps) {
  return (
    <div className="focus-metric-glass min-w-0 px-2.5 py-1.5 min-[520px]:px-3">
      <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground min-[520px]:text-base">
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 truncate text-caption text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
}

interface FocusViewProps {
  running: boolean;
  mode: "work" | "break" | "long-break";
  isStudyOvertime: boolean;
  onSearch?: () => void;
  onSettings?: () => void;
  secondsLeft: number;
  overtimeSeconds: number;
  totalSeconds: number;
  progress: number;
  timeDisplay: string;
  modeLabel: string;
  modeColor: string;
  nextModeLabel: string;
  timerStageDetail: string;
  timerActionLabel: string;
  canStartFocus: boolean;
  saving: boolean;
  cycles: number;
  activeSessionId: string | null;
  elapsedSeconds: number;
  progressDetail: string;
  currentBlockDetail: string;
  todayAnalytics: {
    totalMinutes: number;
    completedBlocks: number;
    activeBlocks: number;
    topSubject: { subject: Subject | undefined; minutes: number } | undefined;
  };
  subjects: Subject[];
  selectedSubjectIds: string[];
  settings: {
    workMinutes: number;
    breakMinutes: number;
    longBreakMinutes: number;
  };
  selectedProject: Project | undefined;
  workbenchTitle: string;
  sessionScopeLabel: string;
  sessionStateLabel: string;
  onToggle: () => void;
  onReset: () => void;
  onReturnToBreak: () => void;
  onFinish: () => void;
  onSkipBreak: () => void;
  onStartStudyOvertime: () => void;
  onMoreBreakTime: () => void;
  onSubjectClick: (subjectId: string) => void;
  onChangeDuration: (
    key: "workMinutes" | "breakMinutes" | "longBreakMinutes",
    value: string,
  ) => void;
  onClose: () => void;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function FocusView({
  running,
  mode,
  isStudyOvertime,
  secondsLeft,
  overtimeSeconds: _overtimeSeconds,
  totalSeconds,
  progress,
  timeDisplay,
  modeLabel: _modeLabel,
  modeColor,
  nextModeLabel,
  timerStageDetail,
  timerActionLabel,
  canStartFocus,
  saving,
  cycles,
  activeSessionId,
  elapsedSeconds,
  progressDetail,
  currentBlockDetail,
  todayAnalytics,
  subjects,
  selectedSubjectIds,
  settings,
  selectedProject,
  workbenchTitle,
  sessionScopeLabel,
  sessionStateLabel,
  onSearch,
  onSettings,
  onToggle,
  onReset,
  onReturnToBreak,
  onFinish,
  onSkipBreak,
  onStartStudyOvertime,
  onMoreBreakTime,
  onSubjectClick,
  onChangeDuration,
  onClose,
  closeButtonRef,
}: FocusViewProps) {
  const closeButtonRefInternal = useRef<HTMLButtonElement | null>(null);
  const resolvedCloseRef = closeButtonRef ?? closeButtonRefInternal;
  const [sessionIntention, setSessionIntention] = useState("");

  useEffect(() => {
    window.setTimeout(() => resolvedCloseRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, resolvedCloseRef]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const focusTicks = Array.from({ length: 32 }, (_, index) => index);
  const orbitTicks = Array.from({ length: 48 }, (_, index) => index);
  const circumference = 2 * Math.PI * 112;
  const progressPercent = Math.round(progress * 100);
  const isFocusMode = mode === "work" || isStudyOvertime;
  const kineticStyle = {
    "--focus-progress": progress,
  } as CSSProperties;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-background text-foreground",
        running && "is-running",
      )}
      style={kineticStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Full screen study timer"
    >
      {/* Titlebar — reuses the app's TitleBar component for consistent window chrome */}
      <TitleBar onSearch={onSearch} onSettings={onSettings} />

      <div className="pointer-events-none absolute inset-0 hairline-grid opacity-35" />
      <div
        className={cn(
          "focus-field pointer-events-none absolute inset-0",
          isFocusMode ? "focus-field-work" : "focus-field-break",
          running && "ambient-drift",
        )}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-primary/10 to-transparent" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pt-0.5 sm:px-5 min-[1200px]:px-6 min-[1800px]:px-8 min-[2200px]:px-10">
        <header className="grid shrink-0 gap-2 border-b border-border/50 pb-2 min-[640px]:grid-cols-[minmax(0,1fr)_auto] min-[640px]:items-end">
          <div className="min-w-0">
            <h1 className="font-heading text-lg font-semibold tracking-tight text-foreground min-[520px]:text-xl">
              Study Timer
            </h1>

            <p className="mt-1 truncate text-xs text-muted-foreground">
              {workbenchTitle} · {sessionScopeLabel} · Next: {nextModeLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 min-[640px]:justify-end">
            <Button
              onClick={onReset}
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-md bg-background/70"
              aria-label="Reset timer"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              ref={resolvedCloseRef}
              onClick={onClose}
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-md bg-background/70"
              aria-label="Close full screen timer"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto py-3 min-[840px]:grid-cols-[minmax(0,1fr)_18rem] min-[840px]:overflow-hidden min-[1180px]:grid-cols-[minmax(0,1fr)_21rem] min-[1500px]:grid-cols-[minmax(0,1fr)_24rem] min-[1800px]:grid-cols-[minmax(0,1fr)_27rem] min-[2200px]:grid-cols-[minmax(0,1fr)_30rem] min-[1800px]:gap-4">
          <main className="relative flex min-h-0 flex-col overflow-hidden rounded-xl bg-card/50 ring-1 ring-border/55">
            <div className="grid shrink-0 grid-cols-1 gap-2 border-b border-border/50 bg-background/35 p-2.5 min-[560px]:grid-cols-3">
              <FocusMetric
                label="Elapsed"
                value={formatMinutes(Math.ceil(elapsedSeconds / 60))}
                detail={progressDetail}
              />
              <FocusMetric
                label="Remaining"
                value={formatMinutes(Math.ceil(secondsLeft / 60))}
                detail={currentBlockDetail}
              />
              <FocusMetric
                label="Logged"
                value={activeSessionId ? "Active" : "Ready"}
                detail={
                  activeSessionId
                    ? isStudyOvertime
                      ? "Overtime session"
                      : "Calendar session"
                    : "Awaiting start"
                }
              />
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col px-3 py-3 sm:px-4 min-[1200px]:px-6 min-[1600px]:px-8 min-[2200px]:px-10">
              <div className="pointer-events-none absolute inset-x-4 top-5 h-px bg-border/50" />
              <div
                className={cn(
                  "pointer-events-none absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none",
                  running ? "opacity-100" : "opacity-0",
                )}
                aria-hidden="true"
              >
                <div
                  className={cn(
                    "absolute inset-0 transition-[background] duration-700 motion-reduce:transition-none",
                    isFocusMode
                      ? "bg-[radial-gradient(ellipse_50%_40%_at_50%_25%,oklch(0.48_0.085_242/0.06),transparent_70%)]"
                      : "bg-[radial-gradient(ellipse_50%_40%_at_50%_25%,oklch(0.62_0.12_155/0.06),transparent_70%)]",
                  )}
                />
              </div>
              <div
                className="pointer-events-none absolute inset-4 rounded-lg ring-1 ring-border/30"
                aria-hidden="true"
              />
              <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 grid-rows-[auto_minmax(0,1fr)_auto] items-center gap-3 text-center min-[1180px]:grid-cols-[minmax(0,0.82fr)_minmax(18rem,0.42fr)] min-[1180px]:grid-rows-1 min-[1180px]:text-left min-[1500px]:max-w-none min-[1500px]:grid-cols-[minmax(0,0.9fr)_minmax(19rem,0.36fr)] min-[1600px]:gap-5 min-[2200px]:grid-cols-[minmax(0,1fr)_minmax(22rem,0.34fr)]">
                <div
                  className={cn(
                    "relative mx-auto aspect-square w-full max-w-[min(51vh,31rem)] min-[1180px]:max-w-[min(60vh,36rem)] min-[1500px]:max-w-[min(66vh,44rem)] min-[2200px]:max-w-[min(72vh,52rem)]",
                    running &&
                      "motion-safe:animate-[focus-breathe_4.5s_ease-in-out_infinite]",
                  )}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.09_242/0.16),transparent_58%)] blur-2xl motion-reduce:hidden" />
                  <div
                    className={cn(
                      "focus-orbit pointer-events-none absolute inset-[4.5%] rounded-full motion-reduce:hidden",
                      isFocusMode ? "focus-orbit-work" : "focus-orbit-break",
                    )}
                    aria-hidden="true"
                  >
                    {orbitTicks.map((tick) => {
                      const isPassed = tick / orbitTicks.length <= progress;
                      return (
                        <span
                          key={tick}
                          className={cn(
                            "absolute left-1/2 top-1/2 h-1 w-3 origin-[0_0] rounded-full",
                            isPassed
                              ? isFocusMode
                                ? "bg-primary"
                                : "bg-success"
                              : "bg-muted-foreground/12",
                          )}
                          style={{
                            transform: `rotate(${tick * 7.5}deg) translateX(min(24rem, calc(min(45vw, 17rem) + max(0px, (100vw - 1500px) * 0.08))))`,
                          }}
                        />
                      );
                    })}
                  </div>
                  <svg
                    className="relative h-full w-full -rotate-90"
                    viewBox="0 0 260 260"
                    aria-hidden="true"
                  >
                    <defs>
                      <filter
                        id="ring-glow"
                        x="-25%"
                        y="-25%"
                        width="150%"
                        height="150%"
                      >
                        <feGaussianBlur
                          in="SourceGraphic"
                          stdDeviation="6"
                          result="blur"
                        />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>
                    <circle
                      cx="130"
                      cy="130"
                      r="112"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      strokeDasharray="2 10"
                      className="text-muted-foreground/20"
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
                      r="104"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="34"
                      className="text-muted/45"
                    />
                    {/* Glow behind the progress arc — only when running */}
                    {running && (
                      <circle
                        cx="130"
                        cy="130"
                        r="112"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={`${circumference}`}
                        strokeDashoffset={`${circumference * (1 - progress)}`}
                        strokeLinecap="round"
                        filter="url(#ring-glow)"
                        className={cn(
                          "timer-glow-pulse transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:hidden",
                          isFocusMode ? "text-primary" : "text-success",
                        )}
                      />
                    )}
                    <circle
                      cx="130"
                      cy="130"
                      r="112"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={`${circumference}`}
                      strokeDashoffset={`${circumference * (1 - progress)}`}
                      strokeLinecap="round"
                      className={cn(
                        "transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none",
                        isFocusMode ? "text-primary" : "text-success",
                      )}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                    <span
                      key={
                        running
                          ? "running"
                          : activeSessionId
                            ? "paused"
                            : "ready"
                      }
                      className="inline-block text-micro font-semibold uppercase tracking-normal text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-reduce:animate-none"
                    >
                      {running
                        ? "Timer running"
                        : activeSessionId
                          ? "Timer paused"
                          : "Ready to start"}
                    </span>
                    <span className="mt-2 font-heading text-[3.25rem] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground min-[520px]:text-[4.5rem] min-[1180px]:text-[5.75rem] min-[1500px]:text-[7rem] min-[2200px]:text-[8rem]">
                      {timeDisplay}
                    </span>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={mode + (isStudyOvertime ? '-overtime' : '')}
                        initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className={cn("mt-4 text-sm font-semibold", modeColor)}
                      >
                        {timerStageDetail}
                      </motion.span>
                    </AnimatePresence>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`progress-${progressPercent}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="mt-2 text-xs text-muted-foreground"
                      >
                        {progressPercent}% complete
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>

                <div className="w-full pr-8 min-w-0 max-w-3xl justify-self-center min-[1180px]:max-w-sm min-[1500px]:max-w-md min-[2200px]:max-w-lg">
                  <div className="mb-3 hidden min-[1180px]:block">
                    <p className="font-heading text-2xl font-semibold tracking-tight text-foreground min-[1500px]:text-3xl">
                      {sessionStateLabel}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-muted-foreground">
                      {activeSessionId
                        ? isStudyOvertime
                          ? "Overtime is extending the current study block."
                          : "Calendar logging is active for this block."
                        : mode === "work"
                          ? "Start focus to begin a calendar-backed study block."
                          : "Use the break, then return cleanly to focus."}
                    </p>
                  </div>
                  <div className="grid grid-cols-8 gap-1" aria-hidden="true">
                    {focusTicks.map((tick) => {
                      const isFilled =
                        tick / (focusTicks.length - 1) <= progress;
                      return (
                        <span
                          key={tick}
                          className={cn(
                            "h-1.5 rounded-full motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out motion-reduce:transition-colors motion-reduce:duration-300",
                            isFilled
                              ? isFocusMode
                                ? "bg-primary"
                                : "bg-success"
                              : "bg-muted",
                          )}
                          style={{ transitionDelay: `${tick * 35}ms` }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                    <span>0m</span>
                    <span>{formatMinutes(Math.ceil(totalSeconds / 60))}</span>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <aside className="flex min-h-0 flex-col gap-3 pb-28 min-[840px]:overflow-y-auto min-[840px]:pr-1">
            <section className="rounded-xl bg-card/55 px-3 py-1.5 ring-1 ring-border/55">
              <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5">
                <div>
                  <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                    Focus Record
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    Today&apos;s timer context
                  </p>
                </div>
                <div className="rounded-md bg-primary/10 p-1.5 text-primary ring-1 ring-primary/15">
                  <BarChart3 className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
              <div className="relative">
                <FocusStat
                  label="Today"
                  value={formatMinutes(todayAnalytics.totalMinutes)}
                  detail={`${todayAnalytics.completedBlocks} completed block${todayAnalytics.completedBlocks === 1 ? "" : "s"}${todayAnalytics.activeBlocks > 0 ? " · active now" : ""}`}
                  icon={<BarChart3 className="h-4 w-4" />}
                />
                {running && todayAnalytics.totalMinutes > 0 && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2" aria-hidden="true">
                    <svg
                      width="48"
                      height="20"
                      viewBox="0 0 48 20"
                      className="text-primary/40"
                    >
                      <polyline
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points="0,16 10,14 18,17 26,10 34,8 42,3 47,5"
                        className="sparkline-live"
                      />
                      <circle
                        cx="47"
                        cy="5"
                        r="1.5"
                        fill="currentColor"
                        className="sparkline-live"
                      />
                    </svg>
                  </div>
                )}
              </div>
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
                detail={
                  todayAnalytics.topSubject
                    ? `${formatMinutes(todayAnalytics.topSubject.minutes)} logged today`
                    : "Start a block to build today's focus record"
                }
                icon={<BookOpen className="h-4 w-4" />}
              />
            </section>

            <section className="rounded-xl bg-card/55 p-3 ring-1 ring-border/55">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                    Session
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {sessionStateLabel}
                  </p>
                </div>
                <Coffee
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isFocusMode ? "text-muted-foreground" : "text-success",
                  )}
                />
              </div>

              <div className="mt-3 space-y-3">
                <SubjectPicker
                  variant="focus"
                  subjects={subjects}
                  selectedSubjectIds={selectedSubjectIds}
                  activeSessionId={activeSessionId}
                  onSubjectClick={onSubjectClick}
                />

                <DurationInputs
                  variant="focus"
                  settings={settings}
                  onChange={onChangeDuration}
                />

                <div className="rounded-md bg-muted/35 px-3 py-2 ring-1 ring-border/50">
                  <div className="flex items-center gap-2">
                    <Gauge
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                      Block Signal
                    </p>
                  </div>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {activeSessionId
                      ? isStudyOvertime
                        ? "Overtime is extending calendar study"
                        : "Session is writing to the calendar"
                      : mode === "work"
                        ? "Starting focus will create a calendar block"
                        : "Breaks stay off the calendar"}
                  </p>
                </div>

                {selectedProject && (
                  <div className="rounded-md bg-muted/35 px-3 py-2 ring-1 ring-border/50">
                    <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                      Assessment Link
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {selectedProject.name}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl bg-card/55 p-3 ring-1 ring-border/55">
              <label
                className="flex items-center gap-2"
                htmlFor="focus-intention"
              >
                <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                  Focus Intention
                </span>
              </label>
              <textarea
                id="focus-intention"
                placeholder="What do you want to accomplish in this session?"
                value={sessionIntention}
                onChange={(event) => setSessionIntention(event.target.value)}
                className="mt-2 min-h-[4.5rem] w-full resize-none rounded-lg border border-input bg-background/65 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </section>
          </aside>
        </div>

        <TimerControls
          variant="footer"
          running={running}
          mode={mode}
          isStudyOvertime={isStudyOvertime}
          canStartFocus={canStartFocus}
          saving={saving}
          hasActiveSession={!!activeSessionId}
          timerActionLabel={timerActionLabel}
          onToggle={onToggle}
          onReturnToBreak={onReturnToBreak}
          onFinish={onFinish}
          onSkipBreak={onSkipBreak}
          onStartStudyOvertime={onStartStudyOvertime}
          onMoreBreakTime={onMoreBreakTime}
        />
      </div>
    </div>
  );
}
