import { type ReactNode, useEffect, useRef } from "react"
import {
  BarChart3,
  BookOpen,
  Coffee,
  Gauge,
  Minimize2,
  RotateCcw,
  Target,
  Timer,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Project, Subject } from "@/lib/types"
import { TimerControls } from "@/components/timer/TimerControls"
import { SubjectPicker } from "@/components/timer/SubjectPicker"
import { DurationInputs } from "@/components/timer/DurationInputs"

interface FocusStatProps {
  label: string
  value: string
  icon: ReactNode
  detail?: string
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

interface FocusMetricProps {
  label: string
  value: string
  detail?: string
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

interface FocusViewProps {
  running: boolean
  mode: "work" | "break" | "long-break"
  isStudyOvertime: boolean
  secondsLeft: number
  overtimeSeconds: number
  totalSeconds: number
  progress: number
  timeDisplay: string
  modeLabel: string
  modeColor: string
  nextModeLabel: string
  timerStageDetail: string
  timerActionLabel: string
  canStartFocus: boolean
  saving: boolean
  cycles: number
  activeSessionId: string | null
  elapsedSeconds: number
  progressDetail: string
  currentBlockDetail: string
  todayAnalytics: {
    totalMinutes: number
    completedBlocks: number
    activeBlocks: number
    topSubject: { subject: Subject | undefined; minutes: number } | undefined
  }
  subjects: Subject[]
  selectedSubjectIds: string[]
  settings: {
    workMinutes: number
    breakMinutes: number
    longBreakMinutes: number
  }
  selectedProject: Project | undefined
  workbenchTitle: string
  sessionScopeLabel: string
  sessionStateLabel: string
  onToggle: () => void
  onReset: () => void
  onReturnToBreak: () => void
  onFinish: () => void
  onSkipBreak: () => void
  onStartStudyOvertime: () => void
  onMoreBreakTime: () => void
  onSubjectClick: (subjectId: string) => void
  onChangeDuration: (key: "workMinutes" | "breakMinutes" | "longBreakMinutes", value: string) => void
  onClose: () => void
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>
}

function formatMinutes(totalMinutes: number) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
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
  modeLabel,
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
  const closeButtonRefInternal = useRef<HTMLButtonElement | null>(null)
  const resolvedCloseRef = closeButtonRef ?? closeButtonRefInternal

  useEffect(() => {
    window.setTimeout(() => resolvedCloseRef.current?.focus(), 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose, resolvedCloseRef])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const focusTicks = Array.from({ length: 24 }, (_, index) => index)

  return (
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
                  ? "border-primary/25 bg-primary/10 text-background"
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
              onClick={onReset}
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-md bg-background/60"
              aria-label="Reset timer"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              ref={closeButtonRef}
              onClick={onClose}
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
                        mode === "work" || isStudyOvertime ? "text-background" : "text-emerald-500"
                      )}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-5">
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

              <TimerControls
                variant="focus"
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
  )
}
