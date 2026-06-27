import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Project, Subject } from "@/lib/types";
import { TitleBar } from "@/components/TitleBar";
import { TimerControls } from "@/components/timer/TimerControls";
import { SubjectPicker } from "@/components/timer/SubjectPicker";
import { DurationInputs } from "@/components/timer/DurationInputs";

const FOCUS_TICKS = Array.from({ length: 32 }, (_, index) => index);
const TIMER_CIRCUMFERENCE = 2 * Math.PI * 112;

interface FocusStatProps {
  label: string;
  value: string;
  icon: ReactNode;
  detail?: string;
}

function FocusStat({ label, value, icon, detail }: FocusStatProps) {
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 border-b border-border/60 py-3 last:border-b-0">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
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
    <div className="min-w-0 rounded-md bg-muted/70 px-3 py-2">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
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
    const focusTimeout = window.setTimeout(
      () => resolvedCloseRef.current?.focus(),
      0,
    );

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimeout);
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

  const safeProgress = Number.isFinite(progress)
    ? Math.min(1, Math.max(0, progress))
    : 0;
  const progressPercent = Math.round(safeProgress * 100);
  const isFocusMode = mode === "work" || isStudyOvertime;
  const hasActiveSession = !!activeSessionId;
  const statusLabel = running
    ? "Running"
    : hasActiveSession
      ? "Paused"
      : "Ready";
  const kineticStyle = {
    "--focus-progress": safeProgress,
  } as CSSProperties;

  return (
    <div
      className="fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-background text-foreground"
      style={kineticStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Full screen study timer"
    >
      <TitleBar onSearch={onSearch} onSettings={onSettings} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-3 pt-3 sm:px-5 min-[1200px]:px-6 min-[1800px]:px-8">
        <header className="grid shrink-0 gap-3 border-b border-border/60 pb-3 min-[680px]:grid-cols-[minmax(0,1fr)_auto] min-[680px]:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                Study Timer
              </h1>
              <Badge variant={running ? "default" : "outline"}>
                {statusLabel}
              </Badge>
              <Badge variant={isFocusMode ? "outline" : "success"}>
                {isFocusMode ? "Focus" : "Break"}
              </Badge>
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {workbenchTitle} / {sessionScopeLabel} / Next: {nextModeLabel}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 min-[680px]:justify-end">
            <Button
              onClick={onReset}
              variant="outline"
              size="icon"
              aria-label="Reset timer"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              ref={resolvedCloseRef}
              onClick={onClose}
              variant="outline"
              size="icon"
              aria-label="Close full screen timer"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto py-3 min-[900px]:grid-cols-[minmax(0,1fr)_20rem] min-[900px]:overflow-hidden min-[1280px]:grid-cols-[minmax(0,1fr)_23rem] min-[1800px]:grid-cols-[minmax(0,1fr)_27rem]">
          <Card className="min-h-[38rem] gap-0 bg-card py-0 min-[900px]:min-h-0">
            <CardHeader className="border-b py-3">
              <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span>{sessionStateLabel}</span>
              </CardTitle>
              <CardDescription className="truncate">
                {activeSessionId
                  ? isStudyOvertime
                    ? "Overtime is extending the current study block."
                    : "Calendar logging is active for this block."
                  : mode === "work"
                    ? "Start focus to begin a calendar-backed study block."
                    : "Use the break, then return cleanly to focus."}
              </CardDescription>
              <CardAction>
                <Badge variant={hasActiveSession ? "success" : "secondary"}>
                  {hasActiveSession ? "Logging" : "Not logged"}
                </Badge>
              </CardAction>
            </CardHeader>

            <CardContent className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 p-3 sm:p-4 min-[1280px]:p-5">
              <div className="grid gap-2 min-[560px]:grid-cols-3">
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
                  value={hasActiveSession ? "Active" : "Ready"}
                  detail={
                    hasActiveSession
                      ? isStudyOvertime
                        ? "Overtime session"
                        : "Calendar session"
                      : "Awaiting start"
                  }
                />
              </div>

              <div className="grid min-h-0 items-center gap-5 text-center min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)] min-[1180px]:text-left min-[1800px]:gap-8">
                <div className="relative mx-auto aspect-square w-full max-w-[min(54vh,33rem)] min-[1180px]:max-w-[min(64vh,42rem)] min-[1800px]:max-w-[min(70vh,50rem)]">
                  <svg
                    className="relative h-full w-full -rotate-90"
                    viewBox="0 0 260 260"
                    aria-hidden="true"
                  >
                    <circle
                      cx="130"
                      cy="130"
                      r="112"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-muted-foreground/25"
                    />
                    <circle
                      cx="130"
                      cy="130"
                      r="96"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1"
                      className="text-border"
                    />
                    <circle
                      cx="130"
                      cy="130"
                      r="104"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="32"
                      className="text-muted/55"
                    />
                    <circle
                      cx="130"
                      cy="130"
                      r="112"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={`${TIMER_CIRCUMFERENCE}`}
                      strokeDashoffset={`${TIMER_CIRCUMFERENCE * (1 - safeProgress)}`}
                      strokeLinecap="round"
                      className={cn(
                        "transition-[stroke-dashoffset] duration-1000 ease-out",
                        isFocusMode ? "text-primary" : "text-success",
                      )}
                    />
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
                    <Badge variant="outline">{statusLabel}</Badge>
                    <span className="mt-3 text-[3.5rem] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground sm:text-[4.75rem] min-[1180px]:text-[6.25rem] min-[1800px]:text-[8rem]">
                      {timeDisplay}
                    </span>
                    <span className={cn("mt-4 text-sm font-semibold", modeColor)}>
                      {timerStageDetail}
                    </span>
                    <span className="mt-2 text-xs text-muted-foreground">
                      {progressPercent}% complete
                    </span>
                  </div>
                </div>

                <div className="min-w-0 justify-self-center min-[1180px]:w-full min-[1180px]:max-w-md">
                  <div className="grid grid-cols-8 gap-1" aria-hidden="true">
                    {FOCUS_TICKS.map((tick) => {
                      const isFilled =
                        tick / (FOCUS_TICKS.length - 1) <= safeProgress;
                      return (
                        <span
                          key={tick}
                          className={cn(
                            "h-1.5 rounded-full",
                            isFilled
                              ? isFocusMode
                                ? "bg-primary"
                                : "bg-success"
                              : "bg-muted",
                          )}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                    <span>0m</span>
                    <span>{formatMinutes(Math.ceil(totalSeconds / 60))}</span>
                  </div>

                  <div className="mt-5 grid gap-2">
                    <Badge variant="secondary" className="justify-self-start">
                      {currentBlockDetail}
                    </Badge>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {progressDetail}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ScrollArea className="min-h-0 pb-28 min-[900px]:pb-0">
            <aside className="grid gap-3 pr-1">
              <Card size="sm" className="bg-card">
                <CardHeader className="border-b">
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    Focus Record
                  </CardTitle>
                  <CardDescription>Today&apos;s timer context</CardDescription>
                </CardHeader>
                <CardContent>
                  <FocusStat
                    label="Today"
                    value={formatMinutes(todayAnalytics.totalMinutes)}
                    detail={`${todayAnalytics.completedBlocks} completed block${todayAnalytics.completedBlocks === 1 ? "" : "s"}${todayAnalytics.activeBlocks > 0 ? " / active now" : ""}`}
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
                    detail={
                      todayAnalytics.topSubject
                        ? `${formatMinutes(todayAnalytics.topSubject.minutes)} logged today`
                        : "Start a block to build today's focus record"
                    }
                    icon={<BookOpen className="h-4 w-4" />}
                  />
                </CardContent>
              </Card>

              <Card size="sm" className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coffee
                      className={cn(
                        "h-4 w-4",
                        isFocusMode ? "text-muted-foreground" : "text-success",
                      )}
                    />
                    Session
                  </CardTitle>
                  <CardDescription className="truncate">
                    {sessionStateLabel}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
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

                  <div className="rounded-md bg-muted/70 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Gauge
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Block Signal
                      </p>
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {hasActiveSession
                        ? isStudyOvertime
                          ? "Overtime is extending calendar study"
                          : "Session is writing to the calendar"
                        : mode === "work"
                          ? "Starting focus will create a calendar block"
                          : "Breaks stay off the calendar"}
                    </p>
                  </div>

                  {selectedProject && (
                    <div className="rounded-md bg-muted/70 px-3 py-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Assessment Link
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">
                        {selectedProject.name}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card size="sm" className="bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-muted-foreground" />
                    Focus Intention
                  </CardTitle>
                  <CardDescription>
                    A short note for this block.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <label className="sr-only" htmlFor="focus-intention">
                    Focus intention
                  </label>
                  <Input
                    id="focus-intention"
                    placeholder="What should this session finish?"
                    value={sessionIntention}
                    onChange={(event) => setSessionIntention(event.target.value)}
                  />
                </CardContent>
              </Card>
            </aside>
          </ScrollArea>
        </div>

        <TimerControls
          variant="footer"
          running={running}
          mode={mode}
          isStudyOvertime={isStudyOvertime}
          canStartFocus={canStartFocus}
          saving={saving}
          hasActiveSession={hasActiveSession}
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
