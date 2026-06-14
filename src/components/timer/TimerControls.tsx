import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  Coffee,
  Pause,
  Play,
  Plus,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TRANSITION } from "@/lib/motion";

const EXTRA_BREAK_MINUTES = 5;

/* Spring press animation for buttons */
const springPress = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.94 },
  transition: { type: "spring" as const, stiffness: 520, damping: 30, mass: 0.6 },
} as const;

/* Icon swap transition */
const iconTransition = {
  initial: { opacity: 0, rotate: -12, scale: 0.8 },
  animate: { opacity: 1, rotate: 0, scale: 1 },
  exit: { opacity: 0, rotate: 12, scale: 0.8 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const },
} as const;

interface TimerControlsProps {
  variant: "sidebar" | "footer";
  running: boolean;
  mode: "work" | "break" | "long-break";
  isStudyOvertime: boolean;
  canStartFocus: boolean;
  saving: boolean;
  hasActiveSession: boolean;
  timerActionLabel: string;
  onToggle: () => void;
  onReturnToBreak: () => void;
  onFinish: () => void;
  onSkipBreak: () => void;
  onStartStudyOvertime: () => void;
  onMoreBreakTime: () => void;
}

export function TimerControls({
  variant,
  running,
  mode,
  isStudyOvertime,
  canStartFocus,
  saving,
  hasActiveSession,
  timerActionLabel,
  onToggle,
  onReturnToBreak,
  onFinish,
  onSkipBreak,
  onStartStudyOvertime,
  onMoreBreakTime,
}: TimerControlsProps) {
  const toggleIconKey = running ? "pause" : "play";

  if (variant === "footer") {
    return (
      <div
        className={cn(
          "timer-floating-bar fixed bottom-4 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 px-3 py-3 sm:bottom-6 sm:w-[calc(100%-3rem)] sm:px-4",
          running && "timer-floating-bar-glow",
        )}
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <motion.button
            onClick={onToggle}
            disabled={mode === "work" && !canStartFocus && !running}
            {...springPress}
            className={cn(
              "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap border outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
              running
                ? "border-border bg-background text-foreground hover:bg-muted"
                : "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
            )}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={toggleIconKey}
                className="flex items-center justify-center gap-2"
                {...iconTransition}
              >
                {running ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {running ? "Pause" : timerActionLabel}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          {isStudyOvertime ? (
            <motion.button
              onClick={onReturnToBreak}
              disabled={saving}
              {...springPress}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap border border-transparent bg-primary text-primary-foreground outline-none select-none transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              <Coffee className="h-4 w-4" />
              Break time!
            </motion.button>
          ) : (
            hasActiveSession && (
              <motion.button
                onClick={onFinish}
                disabled={saving}
                {...springPress}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap border border-border bg-background text-foreground outline-none select-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Finish & save
              </motion.button>
            )
          )}
        </div>

        {mode !== "work" && !isStudyOvertime && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <motion.button
              onClick={onSkipBreak}
              {...springPress}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap border border-transparent text-muted-foreground outline-none select-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </motion.button>
            <motion.button
              onClick={onStartStudyOvertime}
              disabled={!canStartFocus}
              {...springPress}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap border border-border bg-background text-foreground outline-none select-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              <BookOpen className="h-4 w-4" />
              Study overtime
            </motion.button>
            <motion.button
              onClick={onMoreBreakTime}
              {...springPress}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap border border-border bg-background text-foreground outline-none select-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Plus className="h-4 w-4" />
              {EXTRA_BREAK_MINUTES} min
            </motion.button>
          </div>
        )}
      </div>
    );
  }

  const sidebarToggleKey = running ? "sidebar-pause" : "sidebar-play";

  return (
    <>
      <motion.button
        onClick={onToggle}
        disabled={mode === "work" && !canStartFocus && !running}
        {...springPress}
        className={cn(
          "mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-caption font-medium whitespace-nowrap border outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          running
            ? "border-border bg-background text-foreground hover:bg-muted"
            : "bg-primary text-primary-foreground border-transparent",
        )}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={sidebarToggleKey}
            className="flex items-center justify-center gap-1.5"
            {...iconTransition}
          >
            {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            {running ? "Pause" : timerActionLabel}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {isStudyOvertime ? (
        <motion.button
          onClick={onReturnToBreak}
          disabled={saving}
          {...springPress}
          className="mt-1.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-control font-medium whitespace-nowrap border border-transparent bg-primary text-primary-foreground outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <Coffee className="h-3 w-3" />
          break time!
        </motion.button>
      ) : (
        hasActiveSession && (
          <motion.button
            onClick={onFinish}
            disabled={saving}
            {...springPress}
            className="mt-1.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-control font-medium whitespace-nowrap border border-transparent text-muted-foreground outline-none select-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <CheckCircle2 className="h-3 w-3" />
            Finish & save
          </motion.button>
        )
      )}

      {mode !== "work" && !isStudyOvertime && (
        <div className="mt-1.5 grid grid-cols-1 gap-1.5 min-[240px]:grid-cols-3">
          <motion.button
            onClick={onSkipBreak}
            {...springPress}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl text-control font-medium whitespace-nowrap border border-transparent text-muted-foreground outline-none select-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SkipForward className="h-3 w-3" />
            Skip
          </motion.button>
          <motion.button
            onClick={onStartStudyOvertime}
            disabled={!canStartFocus}
            {...springPress}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 text-control font-medium whitespace-nowrap border border-border bg-background text-foreground outline-none select-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <BookOpen className="h-3 w-3" />
            Study
          </motion.button>
          <motion.button
            onClick={onMoreBreakTime}
            {...springPress}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl text-control font-medium whitespace-nowrap border border-border bg-background text-foreground outline-none select-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Plus className="h-3 w-3" />
            {EXTRA_BREAK_MINUTES} min
          </motion.button>
        </div>
      )}
    </>
  );
}
