import { useState, useCallback, useRef, useMemo } from "react";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import TimePicker from "@/components/ui/time-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  defaultDayToWeekday,
  DEFAULT_CYCLE_LENGTH,
  getCycleLength,
  getDayToWeekday,
  getTimetableConfig,
  getWeekendTimetables,
  setTimetableConfig,
  type TimetableConfig,
} from "@/lib/settings";
import {
  VCE_SUBJECTS,
  type TimetableDayLabel,
  type Subject,
} from "@/lib/types";
import { parseTimetableFromImage, aiEditTimetable } from "@/lib/timetable";

// --- Types ---

type Tab = "manual" | "ai" | "photo";

interface HolidayDraft {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface PeriodDraft {
  period: string;
  subject: string;
  location: string;
  startTime: string;
  endTime: string;
}

interface EntryDraft {
  id: string;
  dayLabel: number;
  periods: PeriodDraft[];
  approved: boolean;
}

interface TimetableEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customSubjects?: Subject[];
}

// --- Helpers ---

function generateId() {
  return crypto.randomUUID();
}

function makeTime(t: string, addMins: number): string {
  const [h, m] = t.split(":").map(Number);
  const total = (h ?? 9) * 60 + (m ?? 0) + addMins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

// --- Tab selector ---

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "manual", label: "Manual", icon: <Pencil className="h-3.5 w-3.5" /> },
    { id: "ai", label: "AI", icon: <Wand2 className="h-3.5 w-3.5" /> },
    {
      id: "photo",
      label: "Photo",
      icon: <ImageIcon className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="flex gap-1 rounded-lg bg-muted/40 p-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            active === tab.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground/70 hover:text-foreground",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// --- Cycle editor ---

function CycleEditor({
  cycleLength,
  dayToWeekday,
  weekendTimetables,
  onCycleLengthChange,
  onDayToWeekdayChange,
  onWeekendTimetablesChange,
}: {
  cycleLength: number;
  dayToWeekday: number[];
  weekendTimetables: boolean;
  onCycleLengthChange: (n: number) => void;
  onDayToWeekdayChange: (mapping: number[]) => void;
  onWeekendTimetablesChange: (enabled: boolean) => void;
}) {
  const isDefault = useMemo(() => {
    const def = defaultDayToWeekday(cycleLength, weekendTimetables);
    if (def.length !== dayToWeekday.length) return false;
    return def.every((d, i) => d === dayToWeekday[i]);
  }, [cycleLength, dayToWeekday, weekendTimetables]);

  const handleDayWeekday = useCallback(
    (dayIdx: number, weekday: number) => {
      const next = [...dayToWeekday];
      next[dayIdx] = weekday;
      onDayToWeekdayChange(next);
    },
    [dayToWeekday, onDayToWeekdayChange],
  );

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border/40 bg-background/40 px-2 py-1.5">
        <button
          type="button"
          onClick={() => onWeekendTimetablesChange(!weekendTimetables)}
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
            weekendTimetables
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/50",
          )}
          role="checkbox"
          aria-checked={weekendTimetables}
        >
          {weekendTimetables && <Check className="h-3 w-3" />}
        </button>
        <span className="flex-1 text-xs leading-snug">
          <span className="font-medium">Weekend timetables</span>
          <span className="mt-0.5 block text-caption text-muted-foreground/70">
            Give weekend days their own cycle slots
          </span>
        </span>
      </label>

      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <label
            className="text-sm font-medium leading-none"
            htmlFor="editor-cycle-length"
          >
            Cycle length
          </label>
          <p className="text-xs text-muted-foreground/70">
            Days before the cycle repeats
          </p>
        </div>
        <Input
          id="editor-cycle-length"
          type="number"
          min={1}
          max={60}
          value={cycleLength}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= 1) onCycleLengthChange(n);
          }}
          className="h-7 w-16 text-center text-xs"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium leading-none">
            Day → weekday
          </span>
          <button
            type="button"
            onClick={() =>
              onDayToWeekdayChange(
                defaultDayToWeekday(cycleLength, weekendTimetables),
              )
            }
            disabled={isDefault}
            className="flex h-6 items-center gap-1 rounded-md px-1.5 text-caption text-muted-foreground/80 hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className="h-2.5 w-2.5" />
            Reset
          </button>
        </div>
        <ScrollArea className="max-h-36 rounded-lg border border-border/50 bg-background/30">
          <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">
          {Array.from({ length: cycleLength }, (_, i) => i + 1).map(
            (day, idx) => (
              <div
                key={day}
                className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/60 px-1.5 py-1"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted/40 text-caption font-semibold tabular-nums">
                  {day}
                </span>
                <Select
                  value={String(dayToWeekday[idx] ?? 1)}
                  onValueChange={(v) => handleDayWeekday(idx, Number(v))}
                >
                  <SelectTrigger className="h-5 min-w-0 flex-1 rounded border-0 bg-transparent px-1 text-caption shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_SHORT.map((label, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ),
          )}
        </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// --- Period row ---

function PeriodEditRow({
  period,
  index,
  allSubjects,
  onChange,
  onDelete,
}: {
  period: PeriodDraft;
  index: number;
  allSubjects: { id: string; name: string; shortCode: string; color: string }[];
  onChange: (field: keyof PeriodDraft, value: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid grid-cols-[2rem_minmax(10rem,1.2fr)_minmax(8rem,0.9fr)_auto_minmax(5rem,0.55fr)_auto] items-center gap-2 rounded-lg bg-muted/25 px-2.5 py-1.5 max-[760px]:grid-cols-[2rem_minmax(0,1fr)_auto]">
      <span className="text-center text-caption font-medium text-muted-foreground/50 tabular-nums">
        {index + 1}
      </span>
      <input
        type="text"
        value={period.period}
        onChange={(e) => onChange("period", e.target.value)}
        placeholder={`Period ${index + 1}`}
        className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <Select
        value={period.subject || "_none"}
        onValueChange={(v) => onChange("subject", v === "_none" ? "" : v)}
      >
        <SelectTrigger className="h-6 w-full rounded px-1.5 text-xs">
          <SelectValue placeholder="Subject" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">None</SelectItem>
          {allSubjects.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.shortCode || s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1 max-[760px]:col-span-2 max-[760px]:col-start-2">
        <TimePicker
          showIcon={false}
          value={period.startTime}
          onChange={(e) => onChange("startTime", e.target.value)}
          className="h-6 w-[5rem] rounded bg-background px-1 text-xs"
        />
        <span className="text-muted-foreground/40 text-xs">–</span>
        <TimePicker
          showIcon={false}
          value={period.endTime}
          onChange={(e) => onChange("endTime", e.target.value)}
          className="h-6 w-[5rem] rounded bg-background px-1 text-xs"
        />
      </div>
      <input
        type="text"
        value={period.location}
        onChange={(e) => onChange("location", e.target.value)}
        placeholder="Room"
        className="h-6 w-full rounded border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 max-[760px]:col-start-2"
      />
      <button
        type="button"
        onClick={onDelete}
        className="ml-1 flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
        aria-label="Remove period"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// --- Entry card ---

function EntryCard({
  draft,
  onToggle,
  onDelete,
  onAddPeriod,
  onUpdatePeriod,
  onDeletePeriod,
  onUpdateDay,
  allSubjects,
  cycleLength,
  dayToWeekday,
}: {
  draft: EntryDraft;
  onToggle: () => void;
  onDelete: () => void;
  onAddPeriod: () => void;
  onUpdatePeriod: (
    index: number,
    field: keyof PeriodDraft,
    value: string,
  ) => void;
  onDeletePeriod: (index: number) => void;
  onUpdateDay: (day: number) => void;
  allSubjects: { id: string; name: string; shortCode: string; color: string }[];
  cycleLength: number;
  dayToWeekday: number[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        draft.approved
          ? "border-border/70 bg-background/50"
          : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
            draft.approved
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/50",
          )}
          aria-label={draft.approved ? "Exclude day" : "Include day"}
        >
          {draft.approved && <Check className="h-3 w-3" />}
        </button>
        <Select
          value={String(draft.dayLabel)}
          onValueChange={(v) => onUpdateDay(Number(v))}
        >
          <SelectTrigger className="h-7 w-[5.5rem] rounded-md px-2 text-xs font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: cycleLength }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>
                Day {d}
                {dayToWeekday[d - 1] !== undefined
                  ? ` · ${WEEKDAY_SHORT[dayToWeekday[d - 1]]}`
                  : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-micro tabular-nums text-muted-foreground/70">
          {draft.periods.length}{" "}
          {draft.periods.length === 1 ? "period" : "periods"}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-accent hover:text-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remove day"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border/50 px-3 pb-3 pt-2">
          <div className="space-y-1.5">
            {draft.periods.map((period, idx) => (
              <PeriodEditRow
                key={idx}
                period={period}
                index={idx}
                allSubjects={allSubjects}
                onChange={(f, v) => onUpdatePeriod(idx, f, v)}
                onDelete={() => onDeletePeriod(idx)}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onAddPeriod}
            className="mt-1.5 h-6 gap-1 text-xs text-muted-foreground/70"
          >
            <Plus className="h-3 w-3" />
            Add period
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Main editor ---

export function TimetableEditor({
  open,
  onOpenChange,
  customSubjects = [],
}: TimetableEditorProps) {
  const existingConfig = getTimetableConfig();

  const [tab, setTab] = useState<Tab>("manual");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Shared state ---
  const [day1Starts, setDay1Starts] = useState(existingConfig.day1Starts);
  const [cycleLength, setCycleLength] = useState(() =>
    getCycleLength(existingConfig),
  );
  const [dayToWeekday, setDayToWeekday] = useState<number[]>(() => [
    ...getDayToWeekday(existingConfig),
  ]);
  const [weekendTimetables, setWeekendTimetables] = useState<boolean>(() =>
    getWeekendTimetables(existingConfig),
  );
  const [holidays, setHolidays] = useState<HolidayDraft[]>(
    existingConfig.holidays.length > 0
      ? existingConfig.holidays.map((h) => ({
          id: generateId(),
          name: h.name,
          startDate: h.startDate,
          endDate: h.endDate,
        }))
      : [],
  );

  // --- Manual tab ---
  const initManualEntries = useCallback((): EntryDraft[] => {
    if (existingConfig.entries.length === 0) return [];
    return existingConfig.entries.map((e) => ({
      id: generateId(),
      dayLabel: e.dayLabel,
      periods: e.periods.map((p) => ({
        period: p.period,
        subject: p.subject,
        location: p.location ?? "",
        startTime: p.startTime,
        endTime: p.endTime,
      })),
      approved: true,
    }));
  }, [existingConfig]);

  const [manualEntries, setManualEntries] =
    useState<EntryDraft[]>(initManualEntries);

  // --- Photo tab ---
  const [photoImage, setPhotoImage] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoStep, setPhotoStep] = useState<"upload" | "review">("upload");
  const [photoEntries, setPhotoEntries] = useState<EntryDraft[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- AI tab ---
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<EntryDraft[] | null>(null);
  const [aiSummary, setAiSummary] = useState("");

  const allSubjects = useMemo(
    () => [...VCE_SUBJECTS, ...customSubjects],
    [customSubjects],
  );

  // --- Cycle length change handler ---
  const handleCycleLengthChange = useCallback(
    (n: number) => {
      const safe = Math.max(
        1,
        Math.min(60, Math.floor(n) || DEFAULT_CYCLE_LENGTH),
      );
      setCycleLength(safe);
      setDayToWeekday((prev) => {
        const def = defaultDayToWeekday(safe, weekendTimetables);
        if (prev.length >= safe) return prev.slice(0, safe);
        return [...prev, ...def.slice(prev.length)];
      });
    },
    [weekendTimetables],
  );

  const handleWeekendTimetablesChange = useCallback(
    (enabled: boolean) => {
      setWeekendTimetables(enabled);
      setDayToWeekday((prev) => {
        const def = defaultDayToWeekday(cycleLength, enabled);
        return enabled ? def : prev.map((d) => (d === 0 || d === 6 ? 1 : d));
      });
    },
    [cycleLength],
  );

  // --- Save ---
  const handleSave = useCallback(() => {
    const entries =
      tab === "ai" && aiResult
        ? aiResult
        : tab === "photo"
          ? photoEntries
          : manualEntries;
    const approved = entries.filter(
      (e) => e.approved && e.dayLabel >= 1 && e.dayLabel <= cycleLength,
    );

    const seen = new Set<TimetableDayLabel>();
    const deduped = approved.filter((e) => {
      if (seen.has(e.dayLabel)) return false;
      seen.add(e.dayLabel);
      return true;
    });

    const config: TimetableConfig = {
      enabled: deduped.length > 0,
      day1Starts,
      holidays: holidays
        .filter((h) => h.name && h.startDate && h.endDate)
        .map((h) => ({
          name: h.name,
          startDate: h.startDate,
          endDate: h.endDate,
        })),
      entries: deduped.map((e) => ({
        dayLabel: e.dayLabel,
        periods: e.periods.map((p) => ({
          period: p.period,
          subject: p.subject,
          location: p.location || undefined,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
      })),
      cycleLength,
      dayToWeekday: [...dayToWeekday],
      weekendTimetables,
    };
    setTimetableConfig(config);
    window.dispatchEvent(new Event("focal-timetable-updated"));
    setSaved(true);
  }, [
    tab,
    manualEntries,
    photoEntries,
    aiResult,
    day1Starts,
    holidays,
    cycleLength,
    dayToWeekday,
    weekendTimetables,
  ]);

  const handleRemove = useCallback(() => {
    setTimetableConfig({
      ...getTimetableConfig(),
      enabled: false,
      entries: [],
    });
    window.dispatchEvent(new Event("focal-timetable-updated"));
    onOpenChange(false);
  }, [onOpenChange]);

  const handlePhotoFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) setPhotoImage(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePhotoParse = async () => {
    if (!photoImage || !day1Starts) {
      setError("Upload an image and set Day 1 start.");
      return;
    }
    setPhotoLoading(true);
    setError(null);
    try {
      const result = await parseTimetableFromImage(
        photoImage,
        holidays,
        day1Starts,
      );
      const safe = result.entries.filter(
        (e) => e.dayLabel >= 1 && e.dayLabel <= cycleLength,
      );
      setPhotoEntries(
        safe.map((e) => ({
          id: generateId(),
          dayLabel: e.dayLabel,
          periods: e.periods.map((p) => ({
            period: p.period,
            subject: p.subject,
            location: p.location,
            startTime: p.startTime,
            endTime: p.endTime,
          })),
          approved: true,
        })),
      );
      if (result.holidays.length > 0) {
        setHolidays((prev) => {
          const ids = new Set(prev.map((p) => p.name.toLowerCase()));
          const newHolidays = result.holidays
            .filter((h) => !ids.has(h.name.toLowerCase()))
            .map((h) => ({
              id: generateId(),
              name: h.name,
              startDate: h.startDate,
              endDate: h.endDate,
            }));
          return [...prev, ...newHolidays];
        });
      }
      setPhotoStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    setError(null);
    try {
      const res = await aiEditTimetable(
        {
          day1Starts: existingConfig.day1Starts,
          holidays: existingConfig.holidays,
          entries: existingConfig.entries,
        },
        aiInstruction.trim(),
        allSubjects,
      );
      setAiSummary(res.summary);
      setAiResult(
        res.entries.map((e) => ({
          id: generateId(),
          dayLabel: e.dayLabel,
          periods: e.periods.map((p) => ({
            period: p.period,
            subject: p.subject,
            location: p.location,
            startTime: p.startTime,
            endTime: p.endTime,
          })),
          approved: true,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
    }
  };

  // --- Entry manipulation helpers ---
  const updateEntry = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
      id: string,
      fn: (entry: EntryDraft) => EntryDraft,
    ) => {
      setter((prev) => prev.map((e) => (e.id === id ? fn(e) : e)));
    },
    [],
  );

  const toggleEntry = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
      id: string,
    ) => {
      updateEntry(setter, id, (e) => ({ ...e, approved: !e.approved }));
    },
    [updateEntry],
  );

  const deleteEntry = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
      id: string,
    ) => {
      setter((prev) => prev.filter((e) => e.id !== id));
    },
    [],
  );

  const changeEntryDay = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
      id: string,
      day: number,
    ) => {
      updateEntry(setter, id, (e) => ({ ...e, dayLabel: day }));
    },
    [updateEntry],
  );

  const updateEntryPeriod = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
      id: string,
      idx: number,
      field: keyof PeriodDraft,
      value: string,
    ) => {
      updateEntry(setter, id, (e) => ({
        ...e,
        periods: e.periods.map((p, i) =>
          i === idx ? { ...p, [field]: value } : p,
        ),
      }));
    },
    [updateEntry],
  );

  const deleteEntryPeriod = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
      id: string,
      idx: number,
    ) => {
      updateEntry(setter, id, (e) => ({
        ...e,
        periods: e.periods.filter((_, i) => i !== idx),
      }));
    },
    [updateEntry],
  );

  const addEntryPeriod = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<EntryDraft[]>>,
      id: string,
    ) => {
      updateEntry(setter, id, (e) => {
        const last = e.periods[e.periods.length - 1];
        const newPeriod: PeriodDraft = {
          period: `Period ${e.periods.length + 1}`,
          subject: "",
          location: "",
          startTime: last ? makeTime(last.endTime, 10) : "09:00",
          endTime: last ? makeTime(last.endTime, 70) : "10:00",
        };
        return { ...e, periods: [...e.periods, newPeriod] };
      });
    },
    [updateEntry],
  );

  const addManualEntry = useCallback(() => {
    setManualEntries((prev) => [
      ...prev,
      {
        id: generateId(),
        dayLabel: 1,
        periods: [
          {
            period: "Period 1",
            subject: "",
            location: "",
            startTime: "09:00",
            endTime: "10:00",
          },
        ],
        approved: true,
      },
    ]);
  }, []);

  const addHoliday = useCallback(() => {
    setHolidays((prev) => [
      ...prev,
      { id: generateId(), name: "", startDate: "", endDate: "" },
    ]);
  }, []);

  const updateHoliday = useCallback(
    (id: string, field: keyof HolidayDraft, value: string) => {
      setHolidays((prev) =>
        prev.map((h) => (h.id === id ? { ...h, [field]: value } : h)),
      );
    },
    [],
  );

  const deleteHoliday = useCallback((id: string) => {
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setSaved(false);
      setError(null);
      setTab("manual");
      setPhotoImage(null);
      setPhotoStep("upload");
      setPhotoEntries([]);
      setAiInstruction("");
      setAiResult(null);
      setAiSummary("");
      setManualEntries(initManualEntries());
    }, 150);
  };

  const editingEntries =
    tab === "photo"
      ? photoEntries
      : tab === "ai" && aiResult
        ? aiResult
        : manualEntries;
  const approvedCount = editingEntries.filter((e) => e.approved).length;
  const showSharedConfig = !saved && !(tab === "ai" && aiResult);

  const sharedConfigPanel = showSharedConfig ? (
    <aside className="min-h-0 overflow-hidden rounded-xl border border-border/60 bg-background/30 lg:max-h-full">
      <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        <div className="space-y-1.5">
          <label
            className="text-xs font-medium leading-none"
            htmlFor="editor-day1"
          >
            Day 1 starts
          </label>
          <input
            id="editor-day1"
            type="date"
            value={day1Starts}
            onChange={(e) => setDay1Starts(e.target.value)}
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <CycleEditor
          cycleLength={cycleLength}
          dayToWeekday={dayToWeekday}
          weekendTimetables={weekendTimetables}
          onCycleLengthChange={handleCycleLengthChange}
          onDayToWeekdayChange={setDayToWeekday}
          onWeekendTimetablesChange={handleWeekendTimetablesChange}
        />
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium leading-none">Holidays</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={addHoliday}
              className="h-5 gap-1 rounded-md text-caption"
            >
              <Plus className="h-2.5 w-2.5" />
              Add
            </Button>
          </div>
          {holidays.map((h) => (
            <div
              key={h.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 rounded-lg border border-border/50 bg-background/40 p-2"
            >
              <Input
                placeholder="Name"
                value={h.name}
                onChange={(e) => updateHoliday(h.id, "name", e.target.value)}
                className="h-6 min-w-0 text-xs"
              />
              <button
                type="button"
                onClick={() => deleteHoliday(h.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove holiday"
              >
                <X className="h-2.5 w-2.5" />
              </button>
              <input
                type="date"
                value={h.startDate}
                onChange={(e) =>
                  updateHoliday(h.id, "startDate", e.target.value)
                }
                className="h-6 min-w-0 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring"
              />
              <input
                type="date"
                value={h.endDate}
                onChange={(e) => updateHoliday(h.id, "endDate", e.target.value)}
                className="h-6 min-w-0 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring"
              />
            </div>
          ))}
        </div>
      </div>
      </ScrollArea>
    </aside>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[min(92dvh,56rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b px-5 pb-3.5 pr-14 pt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center lg:gap-5 lg:px-6 lg:pr-16">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Timetable Editor
          </DialogTitle>
          <div className="mt-3 lg:mt-0">
            <TabBar active={tab} onChange={setTab} />
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 lg:overflow-hidden lg:px-6">
          {error && (
            <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          {saved ? (
            <div className="flex flex-1 flex-col items-center justify-center py-16">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/12">
                <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-semibold">Timetable saved</p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">
                {approvedCount} day{approvedCount !== 1 ? "s" : ""}
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "grid min-h-0 flex-1 gap-4",
                showSharedConfig && "lg:grid-cols-[minmax(0,1fr)_22rem]",
              )}
            >
              <div className="flex min-h-0 flex-col gap-4">
                {/* === MANUAL TAB === */}
                {tab === "manual" && (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Edit timetable</p>
                        <p className="text-xs text-muted-foreground/70">
                          {approvedCount} of {manualEntries.length} day
                          {manualEntries.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addManualEntry}
                        className="h-7 gap-1.5 rounded-lg text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add day
                      </Button>
                    </div>
                    <ScrollArea className="min-h-0 flex-1 -mx-1 px-1">
                      <div className="space-y-2">
                        {manualEntries.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground/70">
                              No days configured. Add a day to get started.
                            </p>
                          </div>
                        ) : (
                          manualEntries.map((draft) => (
                            <EntryCard
                              key={draft.id}
                              draft={draft}
                              onToggle={() =>
                                toggleEntry(setManualEntries, draft.id)
                              }
                              onDelete={() =>
                                deleteEntry(setManualEntries, draft.id)
                              }
                              onAddPeriod={() =>
                                addEntryPeriod(setManualEntries, draft.id)
                              }
                              onUpdatePeriod={(i, f, v) =>
                                updateEntryPeriod(
                                  setManualEntries,
                                  draft.id,
                                  i,
                                  f,
                                  v,
                                )
                              }
                              onDeletePeriod={(i) =>
                                deleteEntryPeriod(setManualEntries, draft.id, i)
                              }
                              onUpdateDay={(d) =>
                                changeEntryDay(setManualEntries, draft.id, d)
                              }
                              allSubjects={allSubjects}
                              cycleLength={cycleLength}
                              dayToWeekday={dayToWeekday}
                            />
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </>
                )}

                {/* === AI TAB === */}
                {tab === "ai" && (
                  <>
                    {!aiResult ? (
                      <div className="flex flex-1 flex-col gap-4">
                        <div className="space-y-1.5">
                          <label
                            className="text-sm font-medium leading-none"
                            htmlFor="ai-instruction-editor"
                          >
                            What would you like to change?
                          </label>
                          <p className="text-xs text-muted-foreground/70">
                            Describe changes in natural language.
                          </p>
                        </div>
                        <textarea
                          id="ai-instruction-editor"
                          value={aiInstruction}
                          onChange={(e) => setAiInstruction(e.target.value)}
                          placeholder='e.g. "Swap English and Chemistry on Day 2"'
                          className="min-h-[7rem] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <>
                        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-3">
                          <div className="flex items-start gap-3">
                            <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <p className="text-sm font-medium">
                              {aiSummary || "Timetable updated"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            Proposed timetable
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            {aiResult.filter((e) => e.approved).length} of{" "}
                            {aiResult.length} days
                          </p>
                        </div>
                        <ScrollArea className="min-h-0 flex-1 -mx-1 px-1">
                          <div className="space-y-2">
                            {aiResult.map((draft) => (
                              <EntryCard
                                key={draft.id}
                                draft={draft}
                                onToggle={() => {
                                  setAiResult(
                                    (prev) =>
                                      prev?.map((e) =>
                                        e.id === draft.id
                                          ? { ...e, approved: !e.approved }
                                          : e,
                                      ) ?? null,
                                  );
                                }}
                                onDelete={() =>
                                  setAiResult(
                                    (prev) =>
                                      prev?.filter((e) => e.id !== draft.id) ??
                                      null,
                                  )
                                }
                                onAddPeriod={() => {
                                  setAiResult(
                                    (prev) =>
                                      prev?.map((e) => {
                                        if (e.id !== draft.id) return e;
                                        const last =
                                          e.periods[e.periods.length - 1];
                                        return {
                                          ...e,
                                          periods: [
                                            ...e.periods,
                                            {
                                              period: `Period ${e.periods.length + 1}`,
                                              subject: "",
                                              location: "",
                                              startTime: last
                                                ? makeTime(last.endTime, 10)
                                                : "09:00",
                                              endTime: last
                                                ? makeTime(last.endTime, 70)
                                                : "10:00",
                                            },
                                          ],
                                        };
                                      }) ?? null,
                                  );
                                }}
                                onUpdatePeriod={(i, f, v) => {
                                  setAiResult(
                                    (prev) =>
                                      prev?.map((e) =>
                                        e.id !== draft.id
                                          ? e
                                          : {
                                              ...e,
                                              periods: e.periods.map((p, pi) =>
                                                pi === i ? { ...p, [f]: v } : p,
                                              ),
                                            },
                                      ) ?? null,
                                  );
                                }}
                                onDeletePeriod={(i) => {
                                  setAiResult(
                                    (prev) =>
                                      prev?.map((e) =>
                                        e.id !== draft.id
                                          ? e
                                          : {
                                              ...e,
                                              periods: e.periods.filter(
                                                (_, pi) => pi !== i,
                                              ),
                                            },
                                      ) ?? null,
                                  );
                                }}
                                onUpdateDay={(d) => {
                                  setAiResult(
                                    (prev) =>
                                      prev?.map((e) =>
                                        e.id === draft.id
                                          ? { ...e, dayLabel: d }
                                          : e,
                                      ) ?? null,
                                  );
                                }}
                                allSubjects={allSubjects}
                                cycleLength={cycleLength}
                                dayToWeekday={dayToWeekday}
                              />
                            ))}
                          </div>
                        </ScrollArea>
                      </>
                    )}
                  </>
                )}

                {/* === PHOTO TAB === */}
                {tab === "photo" && (
                  <>
                    {photoStep === "upload" ? (
                      <>
                        <div
                          className={cn(
                            "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 transition-colors",
                            photoImage
                              ? "border-primary/30 bg-primary/5"
                              : "border-border/60 bg-muted/20",
                          )}
                          onDragOver={(e) => {
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const f = e.dataTransfer.files[0];
                            if (f) handlePhotoFile(f);
                          }}
                        >
                          {photoImage ? (
                            <div className="relative w-full">
                              <img
                                src={photoImage}
                                alt="Timetable preview"
                                className="mx-auto max-h-44 rounded-lg object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => setPhotoImage(null)}
                                className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                                aria-label="Remove"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <Upload className="mb-2.5 h-7 w-7 text-muted-foreground/60" />
                              <p className="text-sm font-medium text-muted-foreground">
                                Upload timetable photo
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground/60">
                                or click to browse
                              </p>
                              <input
                                ref={inputRef}
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handlePhotoFile(f);
                                }}
                                className="absolute inset-0 cursor-pointer opacity-0"
                              />
                            </>
                          )}
                        </div>
                        {existingConfig.entries.length > 0 && (
                          <div className="flex items-center gap-2 rounded-lg border border-amber-200/50 bg-amber-50/50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/30 dark:text-amber-400">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />A
                            timetable is already configured. Parsing will
                            replace it.
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">
                            Review parsed timetable
                          </p>
                          <p className="text-xs text-muted-foreground/70">
                            {photoEntries.filter((e) => e.approved).length} of{" "}
                            {photoEntries.length} days
                          </p>
                        </div>
                        <ScrollArea className="min-h-0 flex-1 -mx-1 px-1">
                          <div className="space-y-2">
                            {photoEntries.map((draft) => (
                              <EntryCard
                                key={draft.id}
                                draft={draft}
                                onToggle={() =>
                                  toggleEntry(setPhotoEntries, draft.id)
                                }
                                onDelete={() =>
                                  deleteEntry(setPhotoEntries, draft.id)
                                }
                                onAddPeriod={() =>
                                  addEntryPeriod(setPhotoEntries, draft.id)
                                }
                                onUpdatePeriod={(i, f, v) =>
                                  updateEntryPeriod(
                                    setPhotoEntries,
                                    draft.id,
                                    i,
                                    f,
                                    v,
                                  )
                                }
                                onDeletePeriod={(i) =>
                                  deleteEntryPeriod(
                                    setPhotoEntries,
                                    draft.id,
                                    i,
                                  )
                                }
                                onUpdateDay={(d) =>
                                  changeEntryDay(setPhotoEntries, draft.id, d)
                                }
                                allSubjects={allSubjects}
                                cycleLength={cycleLength}
                                dayToWeekday={dayToWeekday}
                              />
                            ))}
                          </div>
                        </ScrollArea>
                      </>
                    )}
                  </>
                )}
              </div>
              {sharedConfigPanel}
            </div>
          )}
        </DialogBody>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none border-t px-5 py-3 lg:px-6">
          {saved ? (
            <Button size="sm" onClick={handleClose} className="ml-auto gap-1.5">
              <Check className="h-4 w-4" />
              Done
            </Button>
          ) : tab === "ai" && !aiResult ? (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAiGenerate}
                disabled={aiLoading || !aiInstruction.trim()}
                className="gap-1.5"
              >
                {aiLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                {aiLoading ? "Generating…" : "Generate"}
              </Button>
            </>
          ) : tab === "photo" && photoStep === "upload" ? (
            <>
              <div>
                {existingConfig.entries.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemove}
                    className="h-7 rounded-lg px-2 text-xs text-muted-foreground/80 hover:text-destructive"
                  >
                    Remove timetable
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handlePhotoParse}
                  disabled={photoLoading || !photoImage || !day1Starts}
                  className="gap-1.5"
                >
                  {photoLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  {photoLoading ? "Analysing…" : "Parse with AI"}
                </Button>
              </div>
            </>
          ) : tab === "photo" && photoStep === "review" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPhotoStep("upload")}
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={approvedCount === 0}
                className="gap-1.5 text-background"
              >
                Save {approvedCount} day{approvedCount !== 1 ? "s" : ""}
              </Button>
            </>
          ) : tab === "ai" && aiResult ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAiResult(null);
                  setAiSummary("");
                }}
              >
                Refine
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={approvedCount === 0}
                  className="gap-1.5"
                >
                  Apply {approvedCount} day{approvedCount !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                {existingConfig.entries.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemove}
                    className="h-7 rounded-lg px-2 text-xs text-muted-foreground/80 hover:text-destructive"
                  >
                    Remove timetable
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={approvedCount === 0}
                  className="gap-1.5 text-background"
                >
                  Save {approvedCount} day{approvedCount !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
