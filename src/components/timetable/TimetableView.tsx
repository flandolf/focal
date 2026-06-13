import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Clock,
  Pencil,
  Trash2,
  AlertCircle,
  CalendarDays,
  ChevronDown,
  Edit3,
  MapPin,
  Pin,
  PinOff,
  Wand2,
  Sparkles,
  Sun,
  CheckCircle2,
  Settings2,
  Eye,
  EyeOff,
  Copy,
  CheckSquare,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getSubjectById, formatTime } from "@/lib/utils";
import {
  getDayLabelForDate,
  getTimetableEntriesForDay,
  getCurrentPeriodInfo,
} from "@/lib/timetable";
import {
  getTimetableConfig,
  setTimetableConfig,
  setTimetableCurrentDayOverride,
} from "@/lib/settings";
import { TimetableDialog } from "@/components/TimetableDialog";
import { InlineEditDayDialog } from "@/components/timetable/InlineEditDayDialog";
import { TimetableAiEditor } from "@/components/timetable/TimetableAiEditor";
import {
  MOTION_DURATION,
  MOTION_EASE,
  staggerContainer,
  staggerItem,
} from "@/lib/motion";
import { DEFAULT_VIEW_SETTINGS } from "@/lib/settings";
import type {
  TimetableDayLabel,
  Subject,
  TimetablePeriod,
  TimetableViewSettings,
} from "@/lib/types";

// --- Helpers ---

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function minutesToTimeString(minutes: number): string {
  const h = Math.min(24, Math.floor(minutes / 60));
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getCurrentPeriodProgress(period: TimetablePeriod, now: Date): number {
  const start = timeStringToMinutes(period.startTime);
  const end = timeStringToMinutes(period.endTime);
  if (end <= start) return 0;
  const currentMin = now.getHours() * 60 + now.getMinutes();
  return Math.max(
    0,
    Math.min(100, ((currentMin - start) / (end - start)) * 100),
  );
}

const BREAK_LABELS = new Set([
  "Recess",
  "Lunch",
  "Homeroom",
  "Assembly",
  "Form",
  "Free",
]);

function isBreakLabel(label: string): boolean {
  return BREAK_LABELS.has(label);
}

interface TimetableViewProps {
  customSubjects: Subject[];
}

// --- View settings popover ---

function ViewSettingsPopover({
  viewSettings,
  onChange,
  isAutoBlock,
}: {
  viewSettings: TimetableViewSettings;
  onChange: (updated: Partial<TimetableViewSettings>) => void;
  isAutoBlock: number;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-input bg-background/60 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
          aria-label="View settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="end">
        {/* View section */}
        <div className="space-y-2">
          <p className="text-micro font-bold uppercase tracking-wider text-muted-foreground/60">
            View
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() =>
                onChange({ showAllDays: !viewSettings.showAllDays })
              }
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                viewSettings.showAllDays
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30",
              )}
              role="checkbox"
              aria-checked={viewSettings.showAllDays}
              aria-label="Show all 10 days"
            >
              {viewSettings.showAllDays && <CheckSquare className="h-3 w-3" />}
            </button>
            <span className="flex-1 text-xs leading-tight">
              Show all 10 days
            </span>
          </label>
        </div>

        {/* Display section */}
        <div className="space-y-2">
          <p className="text-micro font-bold uppercase tracking-wider text-muted-foreground/60">
            Display
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() =>
                onChange({ showLocations: !viewSettings.showLocations })
              }
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                viewSettings.showLocations
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30",
              )}
              role="checkbox"
              aria-checked={viewSettings.showLocations}
              aria-label="Show locations"
            >
              {viewSettings.showLocations && (
                <CheckSquare className="h-3 w-3" />
              )}
            </button>
            <span className="flex-1 text-xs leading-tight">Show locations</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => onChange({ showBreaks: !viewSettings.showBreaks })}
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                viewSettings.showBreaks
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30",
              )}
              role="checkbox"
              aria-checked={viewSettings.showBreaks}
              aria-label="Show breaks"
            >
              {viewSettings.showBreaks && <CheckSquare className="h-3 w-3" />}
            </button>
            <span className="flex-1 text-xs leading-tight">
              Show breaks (Recess, Lunch…)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => onChange({ use24Hour: !viewSettings.use24Hour })}
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                viewSettings.use24Hour
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/30",
              )}
              role="checkbox"
              aria-checked={viewSettings.use24Hour}
              aria-label="24-hour time"
            >
              {viewSettings.use24Hour && <CheckSquare className="h-3 w-3" />}
            </button>
            <span className="flex-1 text-xs leading-tight">24-hour time</span>
          </label>
        </div>

        {/* Week block section */}
        <div className="space-y-2">
          <p className="text-micro font-bold uppercase tracking-wider text-muted-foreground/60">
            Week block
          </p>
          <div className="flex gap-1">
            {([null, 1, 2] as const).map((block) => (
              <button
                key={block === null ? "auto" : `block-${block}`}
                type="button"
                onClick={() => onChange({ manualBlock: block })}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  viewSettings.manualBlock === block
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-input bg-background/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
                aria-pressed={viewSettings.manualBlock === block}
              >
                {block === null
                  ? "Auto"
                  : `Block ${String.fromCharCode(64 + block)}`}
              </button>
            ))}
          </div>
          <p className="text-caption text-muted-foreground/50">
            Auto = Block {String.fromCharCode(64 + isAutoBlock)} (Day{" "}
            {isAutoBlock === 1 ? "1–5" : "6–10"})
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Live "now/next" hero card ---

function LiveStatusCard({
  current,
  next,
  periods,
  now,
  reduceMotion,
  use24Hour,
}: {
  current: TimetablePeriod | null;
  next: TimetablePeriod | null;
  periods: TimetablePeriod[];
  now: Date;
  reduceMotion: boolean;
  use24Hour?: boolean;
}) {
  // No periods on the current day — a free day
  if (periods.length === 0) {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="glass-panel flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
          <Sparkles className="h-4 w-4 text-muted-foreground/60" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">No classes scheduled</p>
          <p className="text-xs text-muted-foreground/70">
            A free day — add periods from the edit menu.
          </p>
        </div>
      </motion.div>
    );
  }

  // All periods are in the past — school day is done
  if (!current && !next) {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="glass-panel flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">School day done</p>
          <p className="text-xs text-muted-foreground/70">
            All {periods.length} period{periods.length !== 1 ? "s" : ""}{" "}
            complete — see you tomorrow.
          </p>
        </div>
      </motion.div>
    );
  }

  // Period in progress
  if (current) {
    const subject = getSubjectById(current.subject);
    const progress = getCurrentPeriodProgress(current, now);
    const endMin = timeStringToMinutes(current.endTime);
    const remaining = Math.max(
      0,
      endMin - (now.getHours() * 60 + now.getMinutes()),
    );

    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="glass-panel active-glow relative overflow-hidden rounded-2xl px-3.5 py-2.5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-micro font-bold uppercase tracking-widest text-primary">
                Happening now
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {subject && (
                <div
                  className="h-4 w-0.5 rounded-full"
                  style={{ backgroundColor: subject.color }}
                />
              )}
              <h3
                className="truncate font-heading text-base font-semibold"
                style={subject ? { color: subject.color } : undefined}
              >
                {subject?.name ?? current.subject}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {formatTime(current.startTime, use24Hour ?? false)} –{" "}
                {formatTime(current.endTime, use24Hour ?? false)}
              </span>
              {current.location && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />
                    {current.location}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-heading text-xl font-semibold tabular-nums text-primary">
              {remaining}
            </div>
            <div className="text-micro font-medium uppercase tracking-wider text-muted-foreground/60">
              min left
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-primary/10">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={reduceMotion ? false : { width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: MOTION_DURATION.page, ease: MOTION_EASE }}
          />
        </div>

        {next && (
          <NextUpHint
            next={next}
            reduceMotion={reduceMotion}
            use24Hour={use24Hour}
          />
        )}
      </motion.div>
    );
  }

  // No period in progress, but a next one
  if (next) {
    const subject = getSubjectById(next.subject);
    const startMin = timeStringToMinutes(next.startTime);
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const minutesUntil = Math.max(0, startMin - currentMin);

    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
        className="glass-panel flex items-center gap-2 rounded-2xl px-3 py-2"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40">
          <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-micro font-bold uppercase tracking-widest text-muted-foreground/70">
            Up next
          </p>
          <div className="mt-px flex items-center gap-1">
            {subject && (
              <span
                className="h-2 w-0.5 shrink-0 rounded-full"
                style={{ backgroundColor: subject.color }}
              />
            )}
            <p
              className="truncate text-xs font-semibold"
              style={subject ? { color: subject.color } : undefined}
            >
              {subject?.name ?? next.subject}
            </p>
            <span className="text-micro text-muted-foreground/70 tabular-nums">
              at {formatTime(next.startTime, use24Hour ?? false)}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-heading text-base font-semibold tabular-nums">
            {minutesUntil}
          </div>
          <div className="text-micro font-medium uppercase tracking-wider text-muted-foreground/60">
            min
          </div>
        </div>
      </motion.div>
    );
  }

  return null;
}

function NextUpHint({
  next,
  reduceMotion,
  use24Hour,
}: {
  next: TimetablePeriod;
  reduceMotion: boolean;
  use24Hour?: boolean;
}) {
  const subject = getSubjectById(next.subject);
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: MOTION_DURATION.normal,
        ease: MOTION_EASE,
        delay: 0.12,
      }}
      className="mt-2 flex items-center gap-1.5 border-t border-primary/15 pt-1.5"
    >
      <span className="text-micro font-bold uppercase tracking-widest text-muted-foreground/60">
        Then
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {subject && (
          <span
            className="h-2 w-0.5 shrink-0 rounded-full"
            style={{ backgroundColor: subject.color }}
          />
        )}
        <span className="truncate text-micro font-medium text-muted-foreground">
          {subject?.name ?? next.subject}
        </span>
        {next.location && (
          <span className="hidden text-micro text-muted-foreground/50 sm:inline">
            · {next.location}
          </span>
        )}
      </div>
      <span className="shrink-0 text-micro tabular-nums text-muted-foreground/70">
        {formatTime(next.startTime, use24Hour ?? false)}
      </span>
    </motion.div>
  );
}

// --- Timeline helpers ---

function getTimelineRange(
  days: { dayLabel: TimetableDayLabel; entries: { periods: TimetablePeriod[] }[] }[],
  bufferMinutes = 0,
): { start: number; end: number } {
  let minStart = 24 * 60;
  let maxEnd = 0;
  let hasPeriods = false;

  days.forEach(({ entries }) => {
    entries.forEach((entry) => {
      entry.periods.forEach((period) => {
        hasPeriods = true;
        const s = timeStringToMinutes(period.startTime);
        const e = timeStringToMinutes(period.endTime);
        minStart = Math.min(minStart, s);
        maxEnd = Math.max(maxEnd, e);
      });
    });
  });

  if (!hasPeriods) return { start: 8 * 60, end: 15 * 60 };

  const start = Math.max(0, Math.floor(minStart / 60) * 60 - bufferMinutes);
  const end = Math.min(24 * 60, Math.ceil(maxEnd / 60) * 60 + bufferMinutes);
  return { start, end };
}

function getHourMarkers(start: number, end: number): number[] {
  const markers: number[] = [];
  const firstHour = Math.ceil(start / 60);
  const lastHour = Math.floor(end / 60);
  for (let h = firstHour; h <= lastHour; h++) {
    markers.push(h);
  }
  return markers;
}

/* ponytail: absolute-positioned school periods need collision math more
   than a full interval-layout engine. Tiny breaks collapse into readable
   markers; normal classes keep their true time scale. If overlapping
   custom periods become common, upgrade this to lane packing. */
const PERIOD_MIN_HEIGHT_PERCENT = 8;
const PERIOD_BLOCK_GAP_PERCENT = 0.7;

function getPeriodLayouts(
  periods: { period: TimetablePeriod; entryIdx: number; periodIdx: number }[],
  timelineStart: number,
  timelineEnd: number,
): Map<string, { top: number; height: number }> {
  const result = new Map<string, { top: number; height: number }>();
  const total = timelineEnd - timelineStart;
  if (total <= 0 || periods.length === 0) return result;

  const sorted = [...periods].sort((a, b) =>
    a.period.startTime.localeCompare(b.period.startTime),
  );

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const key = `${item.entryIdx}-${item.periodIdx}`;
    const startMin = timeStringToMinutes(item.period.startTime);
    const endMin = timeStringToMinutes(item.period.endTime);
    const rawTop = ((startMin - timelineStart) / total) * 100;
    const rawHeight = ((endMin - startMin) / total) * 100;
    const prev = sorted[i - 1];
    const prevLayout = prev
      ? result.get(`${prev.entryIdx}-${prev.periodIdx}`)
      : undefined;
    const top = prevLayout
      ? Math.max(rawTop, prevLayout.top + prevLayout.height + PERIOD_BLOCK_GAP_PERCENT)
      : rawTop;
    const available = 100 - top;
    const height = Math.max(
      1,
      Math.min(Math.max(PERIOD_MIN_HEIGHT_PERCENT, rawHeight), available),
    );

    result.set(key, { top, height });
  }

  return result;
}

// --- Timeline block ---

function TimelineBlock({
  layout,
  period,
  subject,
  isCurrentPeriod,
  isNextPeriod,
  now,
  use24Hour,
  showLocation,
  onEdit,
  onDelete,
}: {
  layout: { top: number; height: number };
  period: TimetablePeriod;
  subject: ReturnType<typeof getSubjectById>;
  isCurrentPeriod: boolean;
  isNextPeriod: boolean;
  now: Date;
  use24Hour?: boolean;
  showLocation?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isBreak = isBreakLabel(period.period);
  const compact = layout.height <= 4.5;
  const markerOnly = layout.height <= 2.5;
  const periodLabel = (subject?.name ?? period.subject) || period.period;
  const timeLabel = `${formatTime(period.startTime, use24Hour ?? false)}-${formatTime(period.endTime, use24Hour ?? false)}`;

  return (
    <div
      className={cn(
        "group/block absolute left-9 right-2 overflow-hidden rounded-lg border transition-[background-color,border-color,box-shadow,transform] duration-200",
        isBreak
          ? "border-dashed border-border/45 bg-muted/28"
          : "border-border/55 bg-background/62 shadow-[inset_0_1px_0_oklch(1_0_0_/_0.08)] backdrop-blur-sm",
        isCurrentPeriod &&
          "border-primary/45 bg-primary/10 shadow-[0_0_22px_-10px_var(--primary),inset_0_1px_0_oklch(1_0_0_/_0.12)]",
        isNextPeriod && !isCurrentPeriod && "border-primary/25 bg-primary/5",
        !isBreak && "hover:border-primary/35 hover:bg-primary/8",
        markerOnly && "rounded-md",
      )}
      style={{
        top: `${layout.top}%`,
        height: `${layout.height}%`,
        backgroundColor:
          subject && !isBreak
            ? `color-mix(in oklch, ${subject.color} ${isCurrentPeriod ? 16 : 10}%, transparent)`
            : undefined,
      }}
      aria-label={`${periodLabel}, ${timeLabel}`}
      title={`${periodLabel} · ${timeLabel}`}
    >
      {/* Subject content */}
      <div
        className={cn(
          "flex h-full min-w-0 flex-col justify-center px-2 py-1",
          compact && "px-2.5 py-1",
          markerOnly && "px-1.5 py-0.5",
        )}
      >
        {markerOnly ? (
          <span
            className="block h-full w-full rounded-sm"
            style={{
              backgroundColor: subject?.color ?? "var(--muted-foreground)",
              opacity: isBreak ? 0.45 : 0.72,
            }}
            aria-hidden
          />
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 pr-10">
            {subject && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: subject.color }}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "truncate text-xs leading-tight",
                isCurrentPeriod ? "font-semibold" : "font-medium",
              )}
              style={subject ? { color: subject.color } : undefined}
            >
              {periodLabel}
            </span>
            {isCurrentPeriod && (
              <span className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
            )}
            {isNextPeriod && !isCurrentPeriod && (
              <span className="shrink-0 text-micro font-bold uppercase tracking-wider text-primary/70">
                Next
              </span>
            )}
          </div>
        )}

        {!compact && !markerOnly && (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 pr-10 text-caption leading-tight text-muted-foreground/75">
            <span className="tabular-nums">
              {timeLabel}
            </span>
            {showLocation && period.location && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="flex items-center gap-0.5 truncate">
                  <MapPin className="h-2 w-2 shrink-0" />
                  {period.location}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div className="pointer-events-none absolute right-1 top-1 flex items-center gap-0.5 rounded-md bg-background/88 p-0.5 opacity-0 ring-1 ring-border/30 backdrop-blur-md transition-all duration-150 group-hover/block:pointer-events-auto group-hover/block:opacity-100 group-focus-within/block:pointer-events-auto group-focus-within/block:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Edit period"
          title="Edit period"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Delete period"
          title="Delete period"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Current period progress */}
      {isCurrentPeriod && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20">
          <div
            className="h-full bg-primary transition-all duration-1000"
            style={{ width: `${getCurrentPeriodProgress(period, now)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// --- Current time indicator ---

function CurrentTimeIndicator({
  now,
  timelineStart,
  timelineEnd,
  use24Hour,
}: {
  now: Date;
  timelineStart: number;
  timelineEnd: number;
  use24Hour?: boolean;
}) {
  const currentMin = now.getHours() * 60 + now.getMinutes();
  if (currentMin < timelineStart || currentMin > timelineEnd) return null;
  const top = ((currentMin - timelineStart) / (timelineEnd - timelineStart)) * 100;
  const stamp24 = `${String(Math.floor(currentMin / 60)).padStart(2, "0")}:${String(currentMin % 60).padStart(2, "0")}`;

  return (
    <div
      className="absolute left-0 right-0 z-10 pointer-events-none"
      style={{ top: `${top}%` }}
    >
      <div className="flex items-center gap-1">
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary ring-2 ring-background/80 shadow-[0_0_10px] shadow-primary/50" />
        <div className="h-px flex-1 bg-primary/60" />
        <span className="rounded-md bg-primary/95 px-1.5 py-0.5 text-caption font-semibold tabular-nums text-primary-foreground shadow-sm">
          {formatTime(stamp24, use24Hour ?? false)}
        </span>
      </div>
    </div>
  );
}

// --- Day timeline card ---

function DayHeader({
  dayLabel,
  isToday,
  isDayOverridden,
  isHidden,
  onEdit,
  onToggleHide,
  onCopyTo,
}: {
  dayLabel: TimetableDayLabel;
  isToday: boolean;
  isDayOverridden: boolean;
  isHidden: boolean;
  onEdit: () => void;
  onToggleHide: () => void;
  onCopyTo: (day: TimetableDayLabel) => void;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between px-2.5 pt-2.5">
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded text-xs font-bold tabular-nums transition-colors",
            isToday
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground group-hover/day:bg-muted/80",
            isHidden && "opacity-40",
          )}
        >
          {dayLabel}
        </span>
        <span
          className={cn(
            "text-xs font-semibold",
            isToday ? "text-primary" : "text-foreground/80",
            isHidden && "text-muted-foreground/40 line-through",
          )}
        >
          Day {dayLabel}
        </span>
        {isToday && isDayOverridden && (
          <Pin className="h-2.5 w-2.5 text-primary" aria-label="Pinned" />
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/day:opacity-100 group-focus-within/day:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={onToggleHide}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-accent hover:text-foreground"
          aria-label={isHidden ? "Show day" : "Hide day"}
          title={isHidden ? "Show day" : "Hide day"}
        >
          {isHidden ? (
            <Eye className="h-2.5 w-2.5" />
          ) : (
            <EyeOff className="h-2.5 w-2.5" />
          )}
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Copy Day ${dayLabel}`}
              title="Copy to another day"
            >
              <Copy className="h-2.5 w-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" align="start">
            <p className="mb-1 px-1 text-caption font-medium text-muted-foreground/70">
              Copy Day {dayLabel} to…
            </p>
            <div className="grid grid-cols-5 gap-1">
              {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as TimetableDayLabel[]).map(
                (d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onCopyTo(d)}
                    disabled={d === dayLabel}
                    className={cn(
                      "flex h-7 items-center justify-center rounded border text-xs font-medium transition-colors",
                      d === dayLabel
                        ? "border-border/30 bg-muted/30 text-muted-foreground/30 cursor-not-allowed"
                        : "border-input bg-background/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                    )}
                  >
                    {d}
                  </button>
                ),
              )}
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/30 transition-colors hover:bg-accent hover:text-foreground"
          aria-label={`Edit Day ${dayLabel}`}
          title="Edit day"
        >
          <Edit3 className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

function DayTimelineCard({
  dayLabel,
  entries,
  isToday,
  isDayOverridden,
  isHidden,
  timelineStart,
  timelineEnd,
  todayPeriodInfo,
  now,
  use24Hour,
  showLocation,
  showBreaks,
  onEditDay,
  onToggleHide,
  onCopyTo,
  onDeletePeriod,
}: {
  dayLabel: TimetableDayLabel;
  entries: { periods: TimetablePeriod[] }[];
  isToday: boolean;
  isDayOverridden: boolean;
  isHidden: boolean;
  timelineStart: number;
  timelineEnd: number;
  todayPeriodInfo: { current: TimetablePeriod | null; next: TimetablePeriod | null };
  now: Date;
  use24Hour?: boolean;
  showLocation?: boolean;
  showBreaks?: boolean;
  onEditDay: () => void;
  onToggleHide: () => void;
  onCopyTo: (day: TimetableDayLabel) => void;
  onDeletePeriod: (entryIdx: number, periodIdx: number) => void;
}) {
  const hourMarkers = useMemo(
    () => getHourMarkers(timelineStart, timelineEnd),
    [timelineStart, timelineEnd],
  );

  const filteredPeriods = useMemo(() => {
    let periods =
      entries.length > 0
        ? entries.flatMap((entry, entryIdx) =>
            entry.periods.map((period, periodIdx) => ({
              period,
              periodIdx,
              entryIdx,
            })),
          )
        : [];
    if (!showBreaks) {
      periods = periods.filter(({ period }) => !isBreakLabel(period.period));
    }
    return periods;
  }, [entries, showBreaks]);

  const periodLayouts = useMemo(
    () => getPeriodLayouts(filteredPeriods, timelineStart, timelineEnd),
    [filteredPeriods, timelineStart, timelineEnd],
  );

  return (
    <motion.div
      variants={staggerItem}
      className={cn(
        "group/day glass-panel card-glow relative flex flex-col overflow-hidden rounded-2xl",
        isToday && "active-glow",
        isHidden && "opacity-40",
      )}
    >
      <DayHeader
        dayLabel={dayLabel}
        isToday={isToday}
        isDayOverridden={isDayOverridden}
        isHidden={isHidden}
        onEdit={onEditDay}
        onToggleHide={onToggleHide}
        onCopyTo={onCopyTo}
      />

      {/* Timeline area */}
      <div className="relative min-h-[460px] flex-1 overflow-hidden border-t border-border/35 bg-background/22 px-1.5 pb-2.5 pt-2">
        {/* Hour markers and grid lines */}
        {hourMarkers.map((hour) => {
          const minutes = hour * 60;
          const top =
            ((minutes - timelineStart) / (timelineEnd - timelineStart)) * 100;
          return (
            <div
              key={hour}
              className="pointer-events-none absolute left-0 right-0 flex items-center gap-1"
              style={{ top: `${top}%` }}
            >
              <span className="w-8 text-right text-caption tabular-nums text-muted-foreground/58">
                {formatTime(minutesToTimeString(minutes), use24Hour ?? false)}
              </span>
              <div className="h-px flex-1 bg-border/32" />
            </div>
          );
        })}

        {/* Period blocks */}
        {filteredPeriods.length > 0 ? (
          <>
            {filteredPeriods.map(({ period, periodIdx, entryIdx }) => {
              const subject = getSubjectById(period.subject);
              const isCurrentPeriod =
                isToday &&
                todayPeriodInfo.current?.startTime === period.startTime &&
                todayPeriodInfo.current?.subject === period.subject;
              const isNextPeriod =
                isToday &&
                !isCurrentPeriod &&
                todayPeriodInfo.next?.startTime === period.startTime &&
                todayPeriodInfo.next?.subject === period.subject;

              return (
                <TimelineBlock
                  key={`${entryIdx}-${periodIdx}`}
                  layout={
                    periodLayouts.get(`${entryIdx}-${periodIdx}`) ?? {
                      top: 0,
                      height: PERIOD_MIN_HEIGHT_PERCENT,
                    }
                  }
                  period={period}
                  subject={subject}
                  isCurrentPeriod={isCurrentPeriod}
                  isNextPeriod={isNextPeriod}
                  now={now}
                  use24Hour={use24Hour}
                  showLocation={showLocation}
                  onEdit={onEditDay}
                  onDelete={() => onDeletePeriod(entryIdx, periodIdx)}
                />
              );
            })}

            {/* Current time indicator */}
            {isToday && (
              <CurrentTimeIndicator
                now={now}
                timelineStart={timelineStart}
                timelineEnd={timelineEnd}
                use24Hour={use24Hour}
              />
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
            {isHidden ? (
              <EyeOff className="h-3.5 w-3.5 text-muted-foreground/30" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-muted-foreground/30" />
            )}
            <p className="text-caption font-medium text-muted-foreground/55">
              {isHidden ? "Hidden from view" : "No classes"}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// --- Main view ---

export const TimetableView = memo(function TimetableView({
  customSubjects,
}: TimetableViewProps) {
  const [config, setConfig] = useState(getTimetableConfig);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDayOpen, setEditDayOpen] = useState(false);
  const [editDayLabel, setEditDayLabel] = useState<TimetableDayLabel>(1);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const reduceMotion = useReducedMotion() === true;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Merge view settings with defaults so new fields always have values
  const viewSettings: TimetableViewSettings = useMemo(
    () => ({ ...DEFAULT_VIEW_SETTINGS, ...config.viewSettings }),
    [config.viewSettings],
  );

  const autoDayLabel = useMemo(() => {
    if (!config.enabled || !config.day1Starts) return null;
    return getDayLabelForDate(now, config.day1Starts, config.holidays);
  }, [config, now]);

  const currentDayLabel = useMemo<TimetableDayLabel | null>(() => {
    if (!config.enabled) return null;
    if (config.currentDayOverride != null) {
      return config.currentDayOverride;
    }
    return autoDayLabel;
  }, [config, autoDayLabel]);

  const effectiveBlock = useMemo(() => {
    if (viewSettings.manualBlock !== null) return viewSettings.manualBlock;
    const cur = currentDayLabel;
    if (cur === null) return 1;
    return cur <= 5 ? 1 : 2;
  }, [currentDayLabel, viewSettings.manualBlock]);

  // If showAllDays, show all 10. Otherwise show only the current block.
  const days = useMemo(() => {
    if (!config.enabled || config.entries.length === 0) return [];
    const startDay = viewSettings.showAllDays
      ? 1
      : effectiveBlock === 1
        ? 1
        : 6;
    const count = viewSettings.showAllDays ? 10 : 5;
    return Array.from(
      { length: count },
      (_, i) => (startDay + i) as TimetableDayLabel,
    )
      .filter((d) => !viewSettings.hiddenDays.includes(d))
      .map((dayLabel) => {
        const entries = getTimetableEntriesForDay(dayLabel, config.entries);
        return { dayLabel, entries };
      });
  }, [
    config,
    effectiveBlock,
    viewSettings.showAllDays,
    viewSettings.hiddenDays,
  ]);

  const todayPeriods = useMemo(() => {
    if (currentDayLabel === null) return [];
    const entries = getTimetableEntriesForDay(currentDayLabel, config.entries);
    return entries
      .flatMap((e) => e.periods)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [currentDayLabel, config]);

  const todayPeriodInfo = useMemo(
    () => getCurrentPeriodInfo(todayPeriods, now),
    [todayPeriods, now],
  );

  const isDayOverridden = config.currentDayOverride != null;

  // Global timeline range for all shown days
  const timelineRange = useMemo(() => getTimelineRange(days), [days]);

  const handleSetDay = useCallback((day: TimetableDayLabel) => {
    setTimetableCurrentDayOverride(day);
    setConfig(getTimetableConfig());
    setDayPickerOpen(false);
  }, []);

  const handleResetDay = useCallback(() => {
    setTimetableCurrentDayOverride(null);
    setConfig(getTimetableConfig());
    setDayPickerOpen(false);
  }, []);

  const handleUpdateViewSettings = useCallback(
    (updated: Partial<TimetableViewSettings>) => {
      const newConfig = {
        ...config,
        viewSettings: { ...viewSettings, ...updated },
      };
      setTimetableConfig(newConfig);
      window.dispatchEvent(new Event("focal-timetable-updated"));
      setConfig(getTimetableConfig());
    },
    [config, viewSettings],
  );

  const handleToggleHideDay = useCallback(
    (dayLabel: TimetableDayLabel) => {
      const hidden = viewSettings.hiddenDays.includes(dayLabel)
        ? viewSettings.hiddenDays.filter((d) => d !== dayLabel)
        : [...viewSettings.hiddenDays, dayLabel];
      handleUpdateViewSettings({ hiddenDays: hidden });
    },
    [viewSettings, handleUpdateViewSettings],
  );

  const handleCopyDay = useCallback(
    (fromDay: TimetableDayLabel, toDay: TimetableDayLabel) => {
      if (fromDay === toDay) return;
      const fromEntries = getTimetableEntriesForDay(fromDay, config.entries);
      if (fromEntries.length === 0) return;

      // Deep-copy periods from the source day
      const sourcePeriods = fromEntries.flatMap((e) =>
        e.periods.map((p) => ({ ...p })),
      );

      // Remove existing entries for the target day, then add the copied ones
      const filtered = config.entries.filter((e) => e.dayLabel !== toDay);
      const newEntry = {
        dayLabel: toDay,
        periods: sourcePeriods,
      };
      const updatedEntries = [...filtered, newEntry];
      const newConfig = {
        ...config,
        entries: updatedEntries,
        enabled: updatedEntries.length > 0,
      };
      setTimetableConfig(newConfig);
      window.dispatchEvent(new Event("focal-timetable-updated"));
      setConfig(getTimetableConfig());
    },
    [config],
  );

  const handleDeletePeriod = useCallback(
    (dayLabel: TimetableDayLabel, entryIdx: number, periodIdx: number) => {
      // Find the Nth entry for this day (entries with the same dayLabel are rare but possible)
      const dayEntryIndices = config.entries
        .map((e, i) => (e.dayLabel === dayLabel ? i : -1))
        .filter((i) => i !== -1);
      const globalEntryIdx = dayEntryIndices[entryIdx];
      if (globalEntryIdx === undefined) return;

      const entry = config.entries[globalEntryIdx];
      const newPeriods = entry.periods.filter((_, i) => i !== periodIdx);

      const newEntries =
        newPeriods.length === 0
          ? config.entries.filter((_, i) => i !== globalEntryIdx)
          : config.entries.map((e, i) =>
              i === globalEntryIdx ? { ...e, periods: newPeriods } : e,
            );

      const updatedConfig = {
        ...config,
        entries: newEntries,
        enabled: newEntries.length > 0,
      };
      setTimetableConfig(updatedConfig);
      window.dispatchEvent(new Event("focal-timetable-updated"));
      setConfig(getTimetableConfig());
    },
    [config],
  );

  const refreshConfig = useCallback(() => setConfig(getTimetableConfig()), []);

  const showDayPicker = config.enabled && !!config.day1Starts;
  const showLiveStatus = showDayPicker && currentDayLabel !== null;

  const blockLabel = viewSettings.showAllDays
    ? "All 10 days"
    : `Block ${String.fromCharCode(64 + effectiveBlock)}`;

  const blockDaysLabel = viewSettings.showAllDays
    ? "Days 1–10"
    : effectiveBlock === 1
      ? "Days 1–5"
      : "Days 6–10";

  return (
    <>
      <ScrollArea className="h-full">
        <div className="px-4 py-4 min-[1200px]:px-8 min-[1200px]:py-4 space-y-3">
          {/* Header */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: MOTION_DURATION.medium, ease: MOTION_EASE }}
            className="flex flex-wrap items-start justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15">
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-sm font-semibold leading-tight">
                  Timetable
                </h2>
                {showDayPicker ? (
                  <p className="mt-px flex items-center text-micro text-muted-foreground">
                    <Popover
                      open={dayPickerOpen}
                      onOpenChange={setDayPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring",
                            isDayOverridden && "text-primary",
                          )}
                          aria-label="Set current day"
                        >
                          <span className="font-medium">
                            {currentDayLabel !== null
                              ? `Day ${currentDayLabel}`
                              : "No day"}
                          </span>
                          {isDayOverridden ? (
                            <Pin className="h-3 w-3 fill-primary" aria-hidden />
                          ) : (
                            <ChevronDown
                              className="h-3 w-3 text-muted-foreground/50"
                              aria-hidden
                            />
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="px-1.5 pb-1.5 pt-0.5">
                          <p className="text-xs font-medium leading-none">
                            Set current day
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground/70">
                            {isDayOverridden
                              ? "Pinned to a specific cycle day."
                              : autoDayLabel === null
                                ? "Pick a day to override the holiday auto-detection."
                                : "Pick any day to pin the timetable to it."}
                          </p>
                        </div>
                        <div className="grid grid-cols-5 gap-1">
                          {(
                            [
                              1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
                            ] as TimetableDayLabel[]
                          ).map((d) => {
                            const isSelected = currentDayLabel === d;
                            const isAuto = autoDayLabel === d;
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => handleSetDay(d)}
                                className={cn(
                                  "relative flex h-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors",
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-input bg-background/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                )}
                                aria-pressed={isSelected}
                              >
                                {d}
                                {isAuto && (
                                  <span
                                    className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-muted-foreground/40"
                                    aria-hidden
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {isDayOverridden && (
                          <button
                            type="button"
                            onClick={handleResetDay}
                            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background/60 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                          >
                            <PinOff className="h-3 w-3" />
                            Reset to auto
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>
                    {currentDayLabel !== null && todayPeriods.length > 0 && (
                      <>
                        <span className="mx-1.5 text-muted-foreground/40">
                          ·
                        </span>
                        {todayPeriods.length} period
                        {todayPeriods.length !== 1 ? "s" : ""}
                      </>
                    )}
                  </p>
                ) : (
                  <p className="mt-px text-micro text-muted-foreground">
                    {blockLabel} · {blockDaysLabel}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <ViewSettingsPopover
                viewSettings={viewSettings}
                onChange={handleUpdateViewSettings}
                isAutoBlock={
                  currentDayLabel === null ? 1 : currentDayLabel <= 5 ? 1 : 2
                }
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1 rounded-lg h-7 px-2.5 text-xs"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 rounded-lg h-7 px-2.5 text-xs"
                onClick={() => setAiEditOpen(true)}
              >
                <Wand2 className="h-3 w-3" />
                AI
              </Button>
            </div>
          </motion.div>

          {/* Not configured state */}
          {!config.enabled || config.entries.length === 0 ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: MOTION_DURATION.medium,
                ease: MOTION_EASE,
              }}
              className="glass-panel flex flex-col items-center justify-center py-10 text-center"
            >
              <motion.div
                animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { duration: 4, repeat: Infinity, ease: "easeInOut" }
                }
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/30"
              >
                <Sun className="h-5 w-5 text-muted-foreground/35" />
              </motion.div>
              <p className="mb-1 text-xs font-medium">
                No timetable configured
              </p>
              <p className="mb-3 max-w-xs text-micro text-muted-foreground">
                Upload a photo of your school timetable and AI will parse it
                into a native 10-day cycle (Mon–Fri, weekends skipped).
              </p>
              <Button
                size="sm"
                className="gap-1 rounded-lg h-7 px-2.5 text-xs btn-glow-primary"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
                Set up Timetable
              </Button>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {showLiveStatus && (
                <motion.div
                  key="live-status"
                  initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: -4,
                    transition: { duration: MOTION_DURATION.fast },
                  }}
                  transition={{
                    duration: MOTION_DURATION.medium,
                    ease: MOTION_EASE,
                  }}
                >
                  <LiveStatusCard
                    current={todayPeriodInfo.current}
                    next={todayPeriodInfo.next}
                    periods={todayPeriods}
                    now={now}
                    reduceMotion={reduceMotion}
                    use24Hour={viewSettings.use24Hour}
                  />
                </motion.div>
              )}

              {/* Day timeline grid */}
              <motion.div
                key={`timeline-grid-${viewSettings.showAllDays ? "all" : effectiveBlock}`}
                className={cn(
                  "grid grid-cols-1 gap-2",
                  viewSettings.showAllDays
                    ? "min-[700px]:grid-cols-2 min-[1100px]:grid-cols-5"
                    : "min-[700px]:grid-cols-2 min-[1100px]:grid-cols-5",
                )}
                variants={staggerContainer(0.04, 0.08)}
                initial="initial"
                animate="animate"
              >
                {days.map(({ dayLabel, entries }) => (
                  <DayTimelineCard
                    key={dayLabel}
                    dayLabel={dayLabel}
                    entries={entries}
                    isToday={currentDayLabel === dayLabel}
                    isDayOverridden={isDayOverridden}
                    isHidden={viewSettings.hiddenDays.includes(dayLabel)}
                    timelineStart={timelineRange.start}
                    timelineEnd={timelineRange.end}
                    todayPeriodInfo={todayPeriodInfo}
                    now={now}
                    use24Hour={viewSettings.use24Hour}
                    showLocation={viewSettings.showLocations}
                    showBreaks={viewSettings.showBreaks}
                    onEditDay={() => {
                      setEditDayLabel(dayLabel);
                      setEditDayOpen(true);
                    }}
                    onToggleHide={() => handleToggleHideDay(dayLabel)}
                    onCopyTo={(toDay) => handleCopyDay(dayLabel, toDay)}
                    onDeletePeriod={(entryIdx, periodIdx) =>
                      handleDeletePeriod(dayLabel, entryIdx, periodIdx)
                    }
                  />
                ))}
              </motion.div>

              {/* Holiday notice */}
              {config.holidays.length > 0 && (
                <motion.div
                  key="holiday-notice"
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: MOTION_DURATION.medium,
                    ease: MOTION_EASE,
                    delay: reduceMotion ? 0 : 0.2,
                  }}
                  className="glass-panel flex items-center gap-2 rounded-2xl px-3 py-2"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
                    <AlertCircle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {config.holidays.length} holiday period
                    {config.holidays.length !== 1 ? "s" : ""} active
                    <span className="text-amber-700/60 dark:text-amber-300/60">
                      {" "}
                      — timetable pauses during these dates
                    </span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>

      <TimetableDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) refreshConfig();
        }}
        customSubjects={customSubjects}
      />

      <InlineEditDayDialog
        key={editDayLabel}
        open={editDayOpen}
        onOpenChange={(open) => {
          setEditDayOpen(open);
          if (!open) refreshConfig();
        }}
        dayLabel={editDayLabel}
        customSubjects={customSubjects}
      />

      <TimetableAiEditor
        open={aiEditOpen}
        onOpenChange={(open) => {
          setAiEditOpen(open);
          if (!open) refreshConfig();
        }}
        customSubjects={customSubjects}
      />
    </>
  );
});
