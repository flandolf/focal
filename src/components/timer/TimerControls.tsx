import type { ReactNode } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const EXTRA_BREAK_MINUTES = 5;

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
  children: ReactNode;
  className?: string;
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
}: TimerButtonProps) {
  return (
    <Button
      size={size === "footer" ? "sm" : "xs"}
      variant={tone === "primary" ? "default" : tone}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "min-w-0 justify-center",
        size === "footer" && "h-9 flex-1 px-3",
        size === "sidebar" && "w-full",
        size === "sidebar-tight" && "w-full px-1.5",
        className,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </Button>
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
  const isFooter = variant === "footer";
  const iconClass = isFooter ? "h-4 w-4" : "h-3 w-3";
  const controlSize: TimerSize = isFooter ? "footer" : "sidebar";
  const toggleDisabled = mode === "work" && !canStartFocus && !running;

  const toggle = (
    <TimerButton
      size={controlSize}
      tone={running ? "outline" : "primary"}
      onClick={onToggle}
      disabled={toggleDisabled}
      ariaLabel={running ? "Pause timer" : timerActionLabel}
      icon={
        running ? (
          <Pause className={iconClass} />
        ) : (
          <Play className={iconClass} />
        )
      }
    >
      {running ? "Pause" : timerActionLabel}
    </TimerButton>
  );

  const secondaryAction = isStudyOvertime ? (
    <TimerButton
      size={controlSize}
      tone="primary"
      onClick={onReturnToBreak}
      disabled={saving}
      ariaLabel="Return to break"
      icon={<Coffee className={iconClass} />}
    >
      Break time
    </TimerButton>
  ) : hasActiveSession ? (
    <TimerButton
      size={controlSize}
      tone={isFooter ? "outline" : "ghost"}
      onClick={onFinish}
      disabled={saving}
      ariaLabel="Finish and save session"
      icon={<CheckCircle2 className={iconClass} />}
    >
      Finish &amp; save
    </TimerButton>
  ) : null;

  const breakActions =
    mode !== "work" && !isStudyOvertime ? (
      <div
        className={cn(
          "grid gap-1.5",
          isFooter
            ? "grid-cols-3"
            : "grid-cols-1 min-[240px]:grid-cols-3",
        )}
      >
        <TimerButton
          size={isFooter ? "footer" : "sidebar"}
          tone="ghost"
          onClick={onSkipBreak}
          ariaLabel="Skip break"
          icon={<SkipForward className={iconClass} />}
        >
          Skip
        </TimerButton>
        <TimerButton
          size={isFooter ? "footer" : "sidebar-tight"}
          tone="outline"
          onClick={onStartStudyOvertime}
          disabled={!canStartFocus}
          ariaLabel="Start study overtime"
          icon={<BookOpen className={iconClass} />}
        >
          Study
        </TimerButton>
        <TimerButton
          size={isFooter ? "footer" : "sidebar"}
          tone="outline"
          onClick={onMoreBreakTime}
          ariaLabel={`Add ${EXTRA_BREAK_MINUTES} more break minutes`}
          icon={<Plus className={iconClass} />}
        >
          {EXTRA_BREAK_MINUTES} min
        </TimerButton>
      </div>
    ) : null;

  if (!isFooter) {
    return (
      <div className="mt-3 grid gap-1.5">
        {toggle}
        {secondaryAction}
        {breakActions}
      </div>
    );
  }

  return (
    <Card className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 gap-0 bg-card py-0 sm:bottom-6 sm:w-[calc(100%-3rem)]">
      <CardContent className="grid gap-2 p-3 sm:p-4">
        <div
          className={cn(
            "grid gap-2",
            secondaryAction ? "sm:grid-cols-2" : "sm:grid-cols-1",
          )}
        >
          {toggle}
          {secondaryAction}
        </div>
        {breakActions}
      </CardContent>
    </Card>
  );
}
