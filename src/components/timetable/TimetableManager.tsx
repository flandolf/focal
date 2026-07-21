import { useEffect, useMemo, useState } from "react"
import { Check, Clipboard, Clock3, FileJson, LayoutList, Plus, Settings2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePickerField, FormField } from "@/components/ui/form-controls"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import {
  DEFAULT_TIMETABLE_CONFIG,
  DEFAULT_VIEW_SETTINGS,
  defaultDayToWeekday,
  getCycleLength,
  getTimetableConfig,
  getWeekendTimetables,
  setTimetableConfig,
} from "@/lib/settings"
import {
  getTimetablePeriodError,
  getTimetablePeriodsForDay,
  parseTimetableImport,
  TIMETABLE_SCREENSHOT_PROMPT,
  timetableTimeFrom12HourParts,
  timetableTimeTo12HourParts,
  timetableTimeToMinutes,
} from "@/lib/timetable"
import type { TimetableTimeParts } from "@/lib/timetable"
import type {
  SchoolHoliday,
  Subject,
  TimetableConfig,
  TimetableDayLabel,
  TimetablePeriod,
} from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"
import { cn, getLocalDateValue } from "@/lib/utils"
import { parseISO } from "date-fns"

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

type ManagerSection = "schedule" | "calendar" | "import"

interface TimetableManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customSubjects: Subject[]
  initialDay?: TimetableDayLabel
}

function cloneConfig(config: TimetableConfig): TimetableConfig {
  return {
    ...config,
    holidays: config.holidays.map((holiday) => ({ ...holiday })),
    entries: config.entries.map((entry) => ({
      ...entry,
      periods: entry.periods.map((period) => ({ ...period })),
    })),
    dayToWeekday: config.dayToWeekday ? [...config.dayToWeekday] : undefined,
    viewSettings: {
      ...DEFAULT_VIEW_SETTINGS,
      ...config.viewSettings,
      hiddenDays: [...(config.viewSettings?.hiddenDays ?? [])],
    },
  }
}

function initialDraft(): TimetableConfig {
  const config = cloneConfig(getTimetableConfig())
  return config.entries.length === 0 ? { ...config, enabled: true } : config
}

function clampDay(day: number, cycleLength: number): TimetableDayLabel {
  return Math.min(Math.max(Math.trunc(day) || 1, 1), cycleLength)
}

function addMinutes(time: string, minutes: number): string {
  const start = timetableTimeToMinutes(time) ?? 9 * 60
  const total = Math.min(start + minutes, 23 * 60 + 59)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1))
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"))

function TimetableTimeInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const parts = timetableTimeTo12HourParts(value) ?? { hour: 9, minute: 0, meridiem: "AM" as const }
  const update = (next: Partial<TimetableTimeParts>) => {
    const merged = { ...parts, ...next }
    const time = timetableTimeFrom12HourParts(merged.hour, merged.minute, merged.meridiem)
    if (time) onChange(time)
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label id={`${id}-label`}>{label}</Label>
      <div className="grid min-w-0 grid-cols-[minmax(4.25rem,.7fr)_auto_minmax(4.25rem,.7fr)_minmax(4.75rem,.8fr)] items-center gap-1.5" role="group" aria-labelledby={`${id}-label`}>
        <Select value={String(parts.hour)} onValueChange={(hour) => update({ hour: Number(hour) })}>
          <SelectTrigger className="w-full font-medium tabular-nums" aria-label={`${label} hour`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((hour) => <SelectItem key={hour} value={hour}>{hour.padStart(2, "0")}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm font-semibold text-muted-foreground" aria-hidden="true">:</span>
        <Select value={String(parts.minute).padStart(2, "0")} onValueChange={(minute) => update({ minute: Number(minute) })}>
          <SelectTrigger className="w-full font-medium tabular-nums" aria-label={`${label} minute`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MINUTES.map((minute) => <SelectItem key={minute} value={minute}>{minute}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={parts.meridiem} onValueChange={(meridiem) => update({ meridiem: meridiem as TimetableTimeParts["meridiem"] })}>
          <SelectTrigger className="w-full font-semibold" aria-label={`${label} AM or PM`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function replaceDayPeriods(
  entries: TimetableConfig["entries"],
  dayLabel: TimetableDayLabel,
  periods: TimetablePeriod[],
): TimetableConfig["entries"] {
  const remaining = entries.filter((entry) => entry.dayLabel !== dayLabel)
  return periods.length > 0 ? [...remaining, { dayLabel, periods }] : remaining
}

function canonicalEntries(config: TimetableConfig): TimetableConfig["entries"] {
  const cycleLength = getCycleLength(config)
  return Array.from({ length: cycleLength }, (_, index) => {
    const dayLabel = index + 1
    return { dayLabel, periods: getTimetablePeriodsForDay(dayLabel, config.entries) }
  }).filter((entry) => entry.periods.length > 0)
}

function validateDraft(config: TimetableConfig): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.day1Starts)) return "Choose the calendar date for Day 1."

  for (const entry of canonicalEntries(config)) {
    for (const period of entry.periods) {
      const error = getTimetablePeriodError(period)
      if (error) return `Day ${entry.dayLabel}: ${error}`
    }
  }

  for (const holiday of config.holidays) {
    if (!holiday.name.trim() || !holiday.startDate || !holiday.endDate) {
      return "Complete the name, start date, and end date for every holiday."
    }
    if (holiday.endDate < holiday.startDate) return `${holiday.name}: end date must be on or after the start date.`
  }

  return null
}

function emitTimetableUpdate() {
  window.dispatchEvent(new CustomEvent("focal-timetable-updated"))
}

export function TimetableManager({
  open,
  onOpenChange,
  customSubjects,
  initialDay = 1,
}: TimetableManagerProps) {
  const [draft, setDraft] = useState<TimetableConfig>(initialDraft)
  const [selectedDay, setSelectedDay] = useState<TimetableDayLabel>(1)
  const [section, setSection] = useState<ManagerSection>("schedule")
  const [error, setError] = useState<string | null>(null)
  const [importText, setImportText] = useState("")

  useEffect(() => {
    if (!open) return
    const next = initialDraft()
    setDraft(next)
    setSelectedDay(clampDay(initialDay, getCycleLength(next)))
    setSection("schedule")
    setError(null)
    setImportText("")
  }, [initialDay, open])

  const cycleLength = getCycleLength(draft)
  const weekendTimetables = getWeekendTimetables(draft)
  const dayToWeekday = draft.dayToWeekday?.length === cycleLength
    ? draft.dayToWeekday
    : defaultDayToWeekday(cycleLength, weekendTimetables)
  const periods = useMemo(
    () => getTimetablePeriodsForDay(selectedDay, draft.entries),
    [draft.entries, selectedDay],
  )
  const subjects = useMemo(() => {
    const byId = new Map(VCE_SUBJECTS.map((subject) => [subject.id, subject]))
    for (const subject of customSubjects) byId.set(subject.id, subject)
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [customSubjects])

  const updatePeriods = (nextPeriods: TimetablePeriod[]) => {
    setDraft((current) => ({
      ...current,
      entries: replaceDayPeriods(current.entries, selectedDay, nextPeriods),
    }))
    setError(null)
  }

  const updatePeriod = (index: number, patch: Partial<TimetablePeriod>) => {
    updatePeriods(periods.map((period, periodIndex) => (
      periodIndex === index ? { ...period, ...patch } : period
    )))
  }

  const addPeriod = () => {
    const previous = periods[periods.length - 1]
    const startTime = previous?.endTime ?? "09:00"
    updatePeriods([
      ...periods,
      {
        period: `Period ${periods.length + 1}`,
        subject: "",
        location: "",
        startTime,
        endTime: addMinutes(startTime, 50),
      },
    ])
  }

  const changeCycleLength = (value: number) => {
    if (!Number.isInteger(value) || value < 1 || value > 60) return
    setDraft((current) => ({
      ...current,
      cycleLength: value,
      dayToWeekday: defaultDayToWeekday(value, getWeekendTimetables(current)),
      entries: current.entries.filter((entry) => entry.dayLabel <= value),
      currentDayOverride: current.currentDayOverride && current.currentDayOverride <= value
        ? current.currentDayOverride
        : null,
    }))
    setSelectedDay((current) => clampDay(current, value))
    setError(null)
  }

  const changeWeekendTimetables = (enabled: boolean) => {
    setDraft((current) => ({
      ...current,
      weekendTimetables: enabled,
      dayToWeekday: defaultDayToWeekday(getCycleLength(current), enabled),
    }))
  }

  const updateHoliday = (index: number, patch: Partial<SchoolHoliday>) => {
    setDraft((current) => ({
      ...current,
      holidays: current.holidays.map((holiday, holidayIndex) => (
        holidayIndex === index ? { ...holiday, ...patch } : holiday
      )),
    }))
    setError(null)
  }

  const importContent = (content: string, name: string) => {
    try {
      const next = parseTimetableImport(content, name, draft)
      setDraft(next)
      setSelectedDay(next.entries[0]?.dayLabel ?? 1)
      setError(null)
      toast.success(`${next.entries.length} timetable ${next.entries.length === 1 ? "day" : "days"} ready to review`)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import the timetable file.")
    }
  }

  const importFile = async (file: File) => {
    try {
      importContent(await file.text(), file.name)
    } catch {
      setError("Could not read the selected timetable file.")
    }
  }

  const copyScreenshotPrompt = async () => {
    try {
      await navigator.clipboard.writeText(TIMETABLE_SCREENSHOT_PROMPT)
      toast.success("Screenshot prompt copied")
    } catch {
      setError("Focal could not copy the prompt. Select the prompt text and copy it manually.")
    }
  }

  const save = () => {
    const validationError = validateDraft(draft)
    if (validationError) {
      setError(validationError)
      return
    }

    const next: TimetableConfig = {
      ...draft,
      cycleLength,
      dayToWeekday: [...dayToWeekday],
      entries: canonicalEntries(draft),
      viewSettings: { ...DEFAULT_VIEW_SETTINGS, ...draft.viewSettings },
    }
    setTimetableConfig(next)
    emitTimetableUpdate()
    toast.success("Timetable saved")
    onOpenChange(false)
  }

  const removeTimetable = async () => {
    const confirmed = await confirmDestructiveAction({
      title: "Remove your timetable?",
      description: "This deletes every saved day, period, and holiday from Focal.",
      actionLabel: "Remove timetable",
    })
    if (!confirmed) return

    setTimetableConfig(cloneConfig(DEFAULT_TIMETABLE_CONFIG))
    emitTimetableUpdate()
    toast.success("Timetable removed")
    onOpenChange(false)
  }

  const sectionButton = (value: ManagerSection, label: string, icon: typeof LayoutList) => {
    const Icon = icon
    return (
      <Button
        type="button"
        variant={section === value ? "secondary" : "ghost"}
        onClick={() => setSection(value)}
        className="justify-start"
      >
        <Icon />
        {label}
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(50rem,calc(100dvh-2rem))] flex-col gap-0 p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4 pr-14">
          <DialogTitle>Manage timetable</DialogTitle>
          <DialogDescription>Set the cycle once, then keep each school day up to date.</DialogDescription>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1">
          <div className="grid h-full min-h-0 min-[860px]:grid-cols-[13rem_minmax(0,1fr)]">
            <aside className="flex gap-1 border-b border-border/70 p-2 min-[860px]:flex-col min-[860px]:border-r min-[860px]:border-b-0 min-[860px]:p-3">
              {sectionButton("schedule", "Schedule", LayoutList)}
              {sectionButton("calendar", "Cycle & display", Settings2)}
              {sectionButton("import", "Import", Upload)}
              <div className="hidden flex-1 min-[860px]:block" />
              {draft.entries.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void removeTimetable()}
                  className="ml-auto text-destructive hover:text-destructive min-[860px]:ml-0 min-[860px]:justify-start"
                >
                  <Trash2 />
                  Remove
                </Button>
              )}
            </aside>

            {section === "schedule" ? (
              <div className="flex min-h-0 min-w-0 flex-col">
                <div className="shrink-0 border-b border-border/70 px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Day {selectedDay}</p>
                      <p className="text-caption text-muted-foreground">
                        {WEEKDAY_NAMES[dayToWeekday[selectedDay - 1] ?? 1]} · {periods.length} {periods.length === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    <Button type="button" size="sm" onClick={addPeriod}>
                      <Plus />
                      Add entry
                    </Button>
                  </div>
                  <ScrollArea className="w-full whitespace-nowrap">
                    <div className="flex w-max gap-1 pb-2">
                      {Array.from({ length: cycleLength }, (_, index) => index + 1).map((day) => (
                        <Button
                          key={day}
                          type="button"
                          size="sm"
                          variant={selectedDay === day ? "default" : "outline"}
                          onClick={() => setSelectedDay(day)}
                          aria-pressed={selectedDay === day}
                        >
                          Day {day}
                        </Button>
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>

                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-2 p-4 min-[1200px]:p-5">
                    {periods.length === 0 ? (
                      <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border/80 px-6 text-center">
                        <Clock3 className="mb-3 h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium">Nothing scheduled for Day {selectedDay}</p>
                        <p className="mt-1 max-w-sm text-caption text-muted-foreground">
                          Add classes, roll call, recess, lunch, or any other fixed part of the day.
                        </p>
                        <Button type="button" size="sm" onClick={addPeriod} className="mt-4">
                          <Plus />
                          Add first entry
                        </Button>
                      </div>
                    ) : periods.map((period, index) => {
                      const unknownSubject = period.subject && !subjects.some((subject) => subject.id === period.subject)
                      const periodError = getTimetablePeriodError(period)
                      return (
                        <div
                          key={`${selectedDay}-${index}`}
                          className={cn(
                            "rounded-lg border bg-background p-3",
                            periodError && "border-destructive/50",
                          )}
                        >
                          <div className="grid min-w-0 gap-2 min-[760px]:grid-cols-[minmax(8rem,.9fr)_minmax(12rem,1.35fr)_minmax(8rem,.9fr)_2rem] min-[760px]:items-end">
                            <div className="grid gap-1.5">
                              <Label htmlFor={`period-${selectedDay}-${index}`}>Entry</Label>
                              <Input
                                id={`period-${selectedDay}-${index}`}
                                value={period.period}
                                onChange={(event) => updatePeriod(index, { period: event.target.value })}
                                placeholder="Period 1 or Lunch"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label>Subject</Label>
                              <Select
                                value={period.subject || "__none__"}
                                onValueChange={(value) => updatePeriod(index, { subject: value === "__none__" ? "" : value })}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="No subject" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No subject</SelectItem>
                                  {unknownSubject && <SelectItem value={period.subject}>{period.subject}</SelectItem>}
                                  {subjects.map((subject) => (
                                    <SelectItem key={subject.id} value={subject.id}>
                                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: subject.color }} />
                                      {subject.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-1.5">
                              <Label htmlFor={`location-${selectedDay}-${index}`}>Location</Label>
                              <Input
                                id={`location-${selectedDay}-${index}`}
                                value={period.location ?? ""}
                                onChange={(event) => updatePeriod(index, { location: event.target.value })}
                                placeholder="Room 12"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => updatePeriods(periods.filter((_, periodIndex) => periodIndex !== index))}
                              aria-label={`Delete ${period.period || "entry"}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <div className="mt-3 grid min-w-0 gap-3 border-t border-border/60 pt-3 min-[760px]:grid-cols-2 min-[1200px]:gap-5">
                            <TimetableTimeInput
                              id={`start-${selectedDay}-${index}`}
                              label="Starts"
                              value={period.startTime}
                              onChange={(startTime) => updatePeriod(index, { startTime })}
                            />
                            <TimetableTimeInput
                              id={`end-${selectedDay}-${index}`}
                              label="Ends"
                              value={period.endTime}
                              onChange={(endTime) => updatePeriod(index, { endTime })}
                            />
                          </div>
                          {periodError && <p className="mt-2 text-caption text-destructive">{periodError}</p>}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            ) : section === "calendar" ? (
              <ScrollArea className="min-h-0">
                <div className="mx-auto grid max-w-3xl gap-6 p-4 min-[1200px]:p-6">
                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">School cycle</h3>
                      <p className="mt-0.5 text-caption text-muted-foreground">Focal uses this to work out which timetable day applies today.</p>
                    </div>
                    <div className="grid gap-3 rounded-lg border bg-background p-4 min-[720px]:grid-cols-2">
                      <DatePickerField
                        id="timetable-day-one"
                        label="Day 1 starts"
                        date={draft.day1Starts ? parseISO(draft.day1Starts) : undefined}
                        onDateChange={(date) => setDraft((current) => ({ ...current, day1Starts: date ? getLocalDateValue(date) : "" }))}
                      />
                      <FormField label="Days in cycle" controlId="timetable-cycle-length">
                        <Input
                          id="timetable-cycle-length"
                          type="number"
                          min={1}
                          max={60}
                          value={cycleLength}
                          onChange={(event) => changeCycleLength(Number(event.target.value))}
                        />
                      </FormField>
                      <label className="flex items-start gap-2 rounded-md bg-muted/40 p-3 min-[720px]:col-span-2">
                        <Checkbox
                          checked={weekendTimetables}
                          onCheckedChange={(checked) => changeWeekendTimetables(checked === true)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="block text-sm font-medium">Include weekends</span>
                          <span className="block text-caption text-muted-foreground">Saturday and Sunday advance the cycle like school days.</span>
                        </span>
                      </label>
                    </div>
                  </section>

                  <section className="grid gap-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">Holidays</h3>
                        <p className="mt-0.5 text-caption text-muted-foreground">The cycle pauses across these dates.</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDraft((current) => ({
                          ...current,
                          holidays: [...current.holidays, { name: "", startDate: "", endDate: "" }],
                        }))}
                      >
                        <Plus />
                        Add holiday
                      </Button>
                    </div>
                    {draft.holidays.length === 0 ? (
                      <div className="rounded-lg border border-dashed px-4 py-6 text-center text-caption text-muted-foreground">No holidays added.</div>
                    ) : draft.holidays.map((holiday, index) => (
                      <div key={index} className="grid gap-2 rounded-lg border bg-background p-3 min-[720px]:grid-cols-[minmax(9rem,1fr)_9.5rem_9.5rem_2rem] min-[720px]:items-end">
                        <div className="grid gap-1.5">
                          <Label htmlFor={`holiday-name-${index}`}>Name</Label>
                          <Input id={`holiday-name-${index}`} value={holiday.name} onChange={(event) => updateHoliday(index, { name: event.target.value })} placeholder="Term break" />
                        </div>
                        <DatePickerField
                          id={`holiday-start-${index}`}
                          label="Starts"
                          date={holiday.startDate ? parseISO(holiday.startDate) : undefined}
                          onDateChange={(date) => updateHoliday(index, { startDate: date ? getLocalDateValue(date) : "" })}
                        />
                        <DatePickerField
                          id={`holiday-end-${index}`}
                          label="Ends"
                          date={holiday.endDate ? parseISO(holiday.endDate) : undefined}
                          onDateChange={(date) => updateHoliday(index, { endDate: date ? getLocalDateValue(date) : "" })}
                          disabledDays={holiday.startDate ? { before: parseISO(holiday.startDate) } : undefined}
                        />
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDraft((current) => ({ ...current, holidays: current.holidays.filter((_, holidayIndex) => holidayIndex !== index) }))} aria-label={`Delete ${holiday.name || "holiday"}`} className="text-muted-foreground hover:text-destructive">
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </section>

                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Display</h3>
                      <p className="mt-0.5 text-caption text-muted-foreground">Keep the schedule as detailed or compact as you prefer.</p>
                    </div>
                    <div className="grid gap-1 rounded-lg border bg-background p-2">
                      {[
                        { key: "enabled" as const, label: "Show on Today dashboard", description: "Include today's classes on the Focal home view." },
                        { key: "showLocations" as const, label: "Show locations", description: "Display rooms and locations on schedule entries." },
                        { key: "showBreaks" as const, label: "Show breaks", description: "Include recess, lunch, homeroom, assembly, form, and free periods." },
                        { key: "use24Hour" as const, label: "Use 24-hour time", description: "Display 13:30 instead of 1:30 PM." },
                      ].map((option) => {
                        const checked = option.key === "enabled"
                          ? draft.enabled
                          : (draft.viewSettings?.[option.key] ?? DEFAULT_VIEW_SETTINGS[option.key])
                        return (
                          <label key={option.key} className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                const next = value === true
                                setDraft((current) => option.key === "enabled"
                                  ? { ...current, enabled: next }
                                  : { ...current, viewSettings: { ...DEFAULT_VIEW_SETTINGS, ...current.viewSettings, [option.key]: next } })
                              }}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block text-sm font-medium">{option.label}</span>
                              <span className="block text-caption text-muted-foreground">{option.description}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </section>
                </div>
              </ScrollArea>
            ) : (
              <ScrollArea className="min-h-0">
                <div className="mx-auto grid max-w-3xl gap-6 p-4 min-[1200px]:p-6">
                  <section className="grid gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Import JSON or XML</h3>
                      <p className="mt-0.5 text-caption text-muted-foreground">
                        Importing replaces the schedule in this draft. You can review it before saving; calendar dates and display preferences stay unchanged.
                      </p>
                    </div>
                    <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border/80 bg-background px-6 text-center hover:bg-muted/30">
                      <FileJson className="mb-3 h-6 w-6 text-muted-foreground" />
                      <span className="text-sm font-medium">Choose a timetable file</span>
                      <span className="mt-1 text-caption text-muted-foreground">.json or .xml · up to 60 cycle days</span>
                      <Input
                        type="file"
                        accept=".json,.xml,application/json,application/xml,text/xml"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          if (file) void importFile(file)
                          event.target.value = ""
                        }}
                      />
                    </label>
                    <div className="flex items-center gap-3 text-caption text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                      or paste the output
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="timetable-import-text">JSON or XML</Label>
                      <Textarea
                        id="timetable-import-text"
                        value={importText}
                        onChange={(event) => {
                          setImportText(event.target.value)
                          setError(null)
                        }}
                        placeholder="Paste the raw JSON or XML here…"
                        spellCheck={false}
                        className="min-h-36 resize-y bg-background font-mono text-xs leading-relaxed"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!importText.trim()}
                        onClick={() => importContent(importText, importText.trimStart().startsWith("<") ? "pasted.xml" : "pasted.json")}
                        className="justify-self-end"
                      >
                        <Upload />
                        Import pasted text
                      </Button>
                    </div>
                    <p className="text-caption text-muted-foreground">
                      JSON uses <code>cycleLength</code>, <code>entries</code>, <code>dayLabel</code>, and <code>periods</code>. XML uses a <code>&lt;timetable cycleLength=&quot;…&quot;&gt;</code> root with <code>&lt;day label=&quot;…&quot;&gt;</code> and <code>&lt;period&gt;</code> elements.
                    </p>
                  </section>

                  <section className="grid gap-3 border-t border-border/70 pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold">Convert a screenshot with an LLM</h3>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          Copy this prompt, attach your timetable screenshot in ChatGPT or another vision-capable LLM, then save its response as a JSON file.
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copyScreenshotPrompt()}>
                        <Clipboard />
                        Copy prompt
                      </Button>
                    </div>
                    <Textarea
                      readOnly
                      value={TIMETABLE_SCREENSHOT_PROMPT}
                      aria-label="Timetable screenshot conversion prompt"
                      className="min-h-64 resize-y bg-background font-mono text-xs leading-relaxed"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </section>
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="m-0 shrink-0 items-center justify-between rounded-none px-5 py-3">
          <div className="min-w-0 flex-1">
            {error && <p role="alert" className="truncate text-caption text-destructive">{error}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={save}>
              <Check />
              Save timetable
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
