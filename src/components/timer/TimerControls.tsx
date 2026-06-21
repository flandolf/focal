import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  Coffee,
  Pause,
  Play,
  Plus,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_EASE, pressable } from "@/lib/motion";

const EXTRA_BREAK_MINUTES = 5;

const iconSwapTransition = {
  initial: { opacity: 0, rotate: -12, scale: 0.85 },
  animate: { opacity: 1, rotate: 0, scale: 1 },
  exit: { opacity: 0, rotate: 12, scale: 0.85 },
  transition: { duration: 0.2, ease: MOTION_EASE },
} as const;

type TimerVariant = "footer" | "sidebar";
type TimerTone = "primary" | "outline" | "ghost";
type TimerSize = "footer" | "sidebar" | "sidebar-tight";

interface TimerButtonProps {
  size: TimerSize;
  tone: TimerTone;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  reduceMotion: boolean;
}

function TimerButton({
  size,
  tone,
  onClick,
  disabled = false,
  ariaLabel,
  icon,
  children,
  className,
  reduceMotion,
}: TimerButtonProps) {
  const isFooter = size === "footer";
  const toneStyles: Record<TimerTone, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border-border bg-background text-foreground hover:bg-muted",
    ghost:
      "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  };
  const sizeStyles =
    size === "footer"
      ? "h-11 gap-2 px-3 text-sm"
      : size === "sidebar"
        ? "h-8 gap-1.5 px-2.5 text-xs"
        : "h-8 min-w-0 gap-1.5 px-1.5 text-xs";
  const radiusStyles = isFooter ? "rounded-lg" : "rounded-xl";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      {...pressable(reduceMotion)}
      className={cn(
        "relative inline-flex flex-1 items-center justify-center whitespace-nowrap border font-medium outline-none select-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
        radiusStyles,
        sizeStyles,
        toneStyles[tone],
        className,
      )}
    >
      {icon}
      {children && <span className="truncate">{children}</span>}
    </motion.button>
  );
}

interface IconSwapProps {
  running: boolean;
  children: ReactNode;
  className?: string;
}

function IconSwap({ running, children, className }: IconSwapProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={running ? "pause" : "play"}
        className={cn(
          "flex items-center justify-center gap-2 motion-reduce:transition-none",
          className,
        )}
        {...iconSwapTransition}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

interface TimerControlsProps {
  variant: TimerVariant;
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
  const reduceMotion = useReducedMotion() === true;
  const isFooter = variant === "footer";
  const sidebarSize: TimerSize = "sidebar";
  const iconClass = isFooter ? "h-4 w-4" : "h-3 w-3";
  const toggleDisabled = mode === "work" && !canStartFocus && !running;
  const sidebarSpacing = isFooter ? "" : "mt-1.5";

  const toggle = (
    <TimerButton
      size={isFooter ? "footer" : sidebarSize}
      tone={running ? "outline" : "primary"}
      onClick={onToggle}
      disabled={toggleDisabled}
      reduceMotion={reduceMotion}
      ariaLabel={running ? "Pause" : timerActionLabel}
    >
      <IconSwap running={running} className={isFooter ? undefined : "gap-1.5"}>
        {running ? (
          <Pause className={iconClass} />
        ) : (
          <Play className={iconClass} />
        )}
        {running ? "Pause" : timerActionLabel}
      </IconSwap>
    </TimerButton>
  );

  const returnToBreak = isStudyOvertime ? (
    <TimerButton
      size={isFooter ? "footer" : sidebarSize}
      tone="primary"
      onClick={onReturnToBreak}
      disabled={saving}
      reduceMotion={reduceMotion}
      ariaLabel="Return to break"
      icon={<Coffee className={iconClass} />}
      className={sidebarSpacing}
    >
      Break time!
    </TimerButton>
  ) : null;

  const finish =
    !isStudyOvertime && hasActiveSession ? (
      <TimerButton
        size={isFooter ? "footer" : sidebarSize}
        tone={isFooter ? "outline" : "ghost"}
        onClick={onFinish}
        disabled={saving}
        reduceMotion={reduceMotion}
        ariaLabel="Finish and save session"
        icon={<CheckCircle2 className={iconClass} />}
        className={sidebarSpacing}
      >
        Finish &amp; save
      </TimerButton>
    ) : null;

  const secondaryAction = returnToBreak ?? finish;

  const breakActions =
    mode !== "work" && !isStudyOvertime ? (
      isFooter ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <TimerButton
            size="footer"
            tone="ghost"
            onClick={onSkipBreak}
            reduceMotion={reduceMotion}
            ariaLabel="Skip break"
            icon={<SkipForward className={iconClass} />}
          >
            Skip
          </TimerButton>
          <TimerButton
            size="footer"
            tone="outline"
            onClick={onStartStudyOvertime}
            disabled={!canStartFocus}
            reduceMotion={reduceMotion}
            ariaLabel="Start study overtime"
            icon={<BookOpen className={iconClass} />}
          >
            Study overtime
          </TimerButton>
          <TimerButton
            size="footer"
            tone="outline"
            onClick={onMoreBreakTime}
            reduceMotion={reduceMotion}
            ariaLabel={`Add ${EXTRA_BREAK_MINUTES} more break minutes`}
            icon={<Plus className={iconClass} />}
          >
            {EXTRA_BREAK_MINUTES} min
          </TimerButton>
        </div>
      ) : (
        <div className="mt-1.5 grid grid-cols-1 gap-1.5 min-[240px]:grid-cols-3">
          <TimerButton
            size="sidebar"
            tone="ghost"
            onClick={onSkipBreak}
            reduceMotion={reduceMotion}
            ariaLabel="Skip break"
            icon={<SkipForward className={iconClass} />}
          >
            Skip
          </TimerButton>
          <TimerButton
            size="sidebar-tight"
            tone="outline"
            onClick={onStartStudyOvertime}
            disabled={!canStartFocus}
            reduceMotion={reduceMotion}
            ariaLabel="Start study overtime"
            icon={<BookOpen className={iconClass} />}
          >
            Study
          </TimerButton>
          <TimerButton
            size="sidebar"
            tone="outline"
            onClick={onMoreBreakTime}
            reduceMotion={reduceMotion}
            ariaLabel={`Add ${EXTRA_BREAK_MINUTES} more break minutes`}
            icon={<Plus className={iconClass} />}
          >
            {EXTRA_BREAK_MINUTES} min
          </TimerButton>
        </div>
      )
    ) : null;

  if (isFooter) {
    return (
      <div
        className={cn(
          "timer-floating-bar fixed bottom-4 left-1/2 z-60 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 px-3 py-3 sm:bottom-6 sm:w-[calc(100%-3rem)] sm:px-4",
          running && "timer-floating-bar-glow",
        )}
      >
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {toggle}
          {secondaryAction}
        </div>
        {breakActions}
      </div>
    );
  }

  return (
    <>
      <div className="mt-3">{toggle}</div>
      {secondaryAction}
      {breakActions}
    </>
  );
}
