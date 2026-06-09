import { useState, useMemo, type FormEvent, type ReactNode } from "react"
import { addMinutes, format, parseISO } from "date-fns"
import { CalendarIcon, CheckCircle2, Clock, MapPin, Repeat, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePickerField, FormField, FormSection, SelectField } from "@/components/ui/form-controls"
import { VCE_SUBJECTS, type EventType, type Subject } from "@/lib/types"
import { cn, getSubjectById } from "@/lib/utils"

const fieldLabelClass = "text-control font-medium text-muted-foreground"
const inputWithIconClass = "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background/65 px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
const sectionIconClass = "h-3.5 w-3.5 text-muted-foreground"

export type RecurrencePattern = "none" | "weekly" | "biweekly" | "monthly"

export interface EventFormValues {
  title: string
  description?: string
  startTime: string
  endTime?: string
  eventType: EventType
  subjectId?: string
  location?: string
  isFinished?: boolean
  finishedAt?: string
  recurrence?: {
    pattern: RecurrencePattern
    endDate?: string
  }
}

interface EventFormInitialValues {
  title?: string
  description?: string
  eventType?: EventType
  subjectId?: string
  location?: string
  date?: Date
  startTime?: string
  duration?: string
  endTime?: string
  isFinished?: boolean
  finishedAt?: string
}

interface EventFormProps {
  customSubjects: Subject[]
  availableSubjects?: Subject[]
  initialValues?: EventFormInitialValues
  submitLabel: string
  onCancel: () => void
  onSubmit: (values: EventFormValues) => void
  showFinishedControl?: boolean
  footerStart?: ReactNode
  showRecurrence?: boolean
}

function EventForm({
  customSubjects,
  availableSubjects,
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
  showFinishedControl = false,
  footerStart,
  showRecurrence = true,
}: EventFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? "")
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [eventType, setEventType] = useState<EventType>(initialValues?.eventType ?? "exam")
  const [subjectId, setSubjectId] = useState(initialValues?.subjectId ?? "")
  const [location, setLocation] = useState(initialValues?.location ?? "")
  const [eventDate, setEventDate] = useState<Date | undefined>(() => initialValues?.date ?? new Date())
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? "09:00")
  const [duration, setDuration] = useState(initialValues?.duration ?? "120")
  const [endTimeMode, setEndTimeMode] = useState<"duration" | "end">(() => {
    // If initialValues has an endTime (for editing), start in end-time mode
    if (initialValues?.endTime) return "end"
    return "duration"
  })
  const [explicitEndTime, setExplicitEndTime] = useState<string>(() => {
    // Parse initial endTime to HH:mm if available (for edit mode)
    if (initialValues?.endTime) {
      const parsed = parseISO(initialValues.endTime)
      if (!Number.isNaN(parsed.getTime())) {
        return format(parsed, "HH:mm")
      }
    }
    return ""
  })
  const [isFinished, setIsFinished] = useState(initialValues?.isFinished ?? false)
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>("none")
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | undefined>(undefined)

  const baseSubjects = availableSubjects ?? [...VCE_SUBJECTS, ...customSubjects]
  const initialSubject = getSubjectById(initialValues?.subjectId)
  const subjects = initialSubject && !baseSubjects.some((subject) => subject.id === initialSubject.id)
    ? [initialSubject, ...baseSubjects]
    : baseSubjects

  // Compute effective endTime for submit — explicitEndTime takes priority over duration
  const effectiveEndTime = useMemo(() => {
    const [sh, sm] = startTime.split(":").map(Number)
    const start = new Date(eventDate ?? new Date())
    start.setHours(sh, sm, 0, 0)

    if (endTimeMode === "end" && explicitEndTime) {
      const [eh, em] = explicitEndTime.split(":").map(Number)
      const end = new Date(start)
      end.setHours(eh, em, 0, 0)
      if (end > start) return end
      return undefined
    }

    const durationMinutes = Number.parseInt(duration, 10)
    if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      return addMinutes(start, durationMinutes)
    }
    return undefined
  }, [startTime, eventDate, duration, endTimeMode, explicitEndTime])

  // When in end-time mode, compute a read-only duration for display
  const computedDurationMinutes = useMemo(() => {
    if (endTimeMode !== "end" || !explicitEndTime) return undefined
    const [sh, sm] = startTime.split(":").map(Number)
    const [eh, em] = explicitEndTime.split(":").map(Number)
    const start = new Date(eventDate ?? new Date())
    start.setHours(sh, sm, 0, 0)
    const end = new Date(start)
    end.setHours(eh, em, 0, 0)
    if (end <= start) return undefined
    return Math.round((end.getTime() - start.getTime()) / (1000 * 60))
  }, [startTime, eventDate, explicitEndTime, endTimeMode])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !eventDate) return

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(eventDate)
    start.setHours(hours, minutes, 0, 0)

    onSubmit({
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      startTime: start.toISOString(),
      endTime: effectiveEndTime?.toISOString(),
      eventType,
      subjectId: subjectId || undefined,
      location: location.trim() ? location.trim() : undefined,
      isFinished,
      finishedAt: isFinished ? (initialValues?.finishedAt ?? new Date().toISOString()) : undefined,
      recurrence: recurrencePattern !== "none" ? {
        pattern: recurrencePattern,
        endDate: recurrenceEndDate?.toISOString(),
      } : undefined,
    })
  }

  const getDefaultEndTime = () => {
    const [sh, sm] = (initialValues?.startTime ?? "09:00").split(":").map(Number)
    const d = new Date()
    d.setHours(sh, sm + 30, 0, 0)
    return format(d, "HH:mm")
  }

  const handleEndTimeChange = (value: string) => {
    setExplicitEndTime(value)
    if (value) setEndTimeMode("end")
  }

  const handleDurationChange = (value: string) => {
    setDuration(value)
    // Switch to duration mode — explicit end time is overridden
    setEndTimeMode("duration")
  }

  return (
    <form onSubmit={handleSubmit} className="grid min-h-0">
      <DialogBody className="grid max-h-[min(72vh,40rem)] gap-5 px-5 py-5">
        <section className="grid gap-3">
          <FormField
            label="Event title"
            labelClassName={fieldLabelClass}
            labelAccessory={
              <span className="text-micro font-medium uppercase tracking-normal text-muted-foreground/70">
                Required
              </span>
            }
          >
            <Input
              placeholder="e.g. Methods exam"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              className="h-10 rounded-lg bg-background/65 text-base"
            />
          </FormField>
        </section>

        <FormSection
          title="Classification"
          icon={<Tag className={sectionIconClass} />}
          className="rounded-lg border border-border/70 bg-muted/20 p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Type"
              labelClassName={fieldLabelClass}
              value={eventType}
              onChange={(event) => setEventType(event.target.value as EventType)}
            >
              <option value="exam">Exam</option>
              <option value="sac">SAC</option>
              <option value="practice-sac">Practice SAC</option>
              <option value="homework">Homework</option>
              <option value="assignment">Assignment</option>
              <option value="other">Other</option>
              <option value="event">Event</option>
            </SelectField>
            <SelectField
              label="Subject"
              labelClassName={fieldLabelClass}
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
            >
              <option value="">No subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.shortCode} {subject.name}
                </option>
              ))}
            </SelectField>
          </div>
          {showFinishedControl && (
            <button
              type="button"
              onClick={() => setIsFinished((current) => !current)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                isFinished
                  ? "border-primary/35 bg-primary/10 text-foreground"
                  : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={isFinished}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">Finished</span>
                <span className="block text-xs text-muted-foreground">
                  Past events are marked finished automatically.
                </span>
              </span>
              <CheckCircle2 className={cn("h-4 w-4 shrink-0", isFinished && "text-primary")} />
            </button>
          )}
        </FormSection>

        <FormSection
          title="Schedule"
          icon={<CalendarIcon className={sectionIconClass} />}
        >
          <div className="grid gap-3 sm:grid-cols-[1.25fr_1fr_1fr]">
            <DatePickerField
              label="Date"
              date={eventDate}
              onDateChange={setEventDate}
              buttonClassName="h-10 rounded-lg bg-background/65"
            />

            <FormField label="Start" labelClassName={fieldLabelClass}>
              <div className={inputWithIconClass}>
                <Clock className="h-4 w-4 text-muted-foreground" />
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </FormField>

            <FormField
              label="End"
              labelClassName={fieldLabelClass}
              labelAccessory={
                <button
                  type="button"
                  onClick={() => {
                    if (endTimeMode === "end") {
                      setEndTimeMode("duration")
                    } else {
                      setExplicitEndTime(getDefaultEndTime())
                      setEndTimeMode("end")
                    }
                  }}
                  className={cn(
                    "cursor-pointer text-micro font-medium uppercase tracking-normal",
                    endTimeMode === "end"
                      ? "text-primary underline underline-offset-2"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  )}
                >
                  {endTimeMode === "end" ? "use duration" : "set time"}
                </button>
              }
            >
              {endTimeMode === "end" ? (
                <div className={inputWithIconClass}>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="time"
                    value={explicitEndTime}
                    onChange={(e) => handleEndTimeChange(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={duration}
                    onChange={(e) => handleDurationChange(e.target.value)}
                    className="h-10 rounded-lg bg-background/65"
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              )}
            </FormField>
          </div>
          {endTimeMode === "end" && computedDurationMinutes !== undefined && (
            <p className="text-xs text-muted-foreground">
              {computedDurationMinutes} minutes
            </p>
          )}
        </FormSection>

        {showRecurrence && (
          <FormSection
            title="Repeat"
            icon={<Repeat className={sectionIconClass} />}
            className="rounded-lg border border-border/70 bg-muted/20 p-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Frequency"
                labelClassName={fieldLabelClass}
                value={recurrencePattern}
                onChange={(event) => setRecurrencePattern(event.target.value as RecurrencePattern)}
              >
                <option value="none">No repeat</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </SelectField>
              {recurrencePattern !== "none" && (
                <DatePickerField
                  label="End date (optional)"
                  date={recurrenceEndDate}
                  onDateChange={setRecurrenceEndDate}
                  buttonClassName="h-10 rounded-lg bg-background/65"
                />
              )}
            </div>
            {recurrencePattern !== "none" && (
              <p className="mt-2 text-xs text-muted-foreground">
                Creates {recurrencePattern === "weekly" ? "weekly" : recurrencePattern === "biweekly" ? "bi-weekly" : "monthly"} events until {recurrenceEndDate ? format(recurrenceEndDate, "MMM d, yyyy") : "manually stopped"}.
              </p>
            )}
          </FormSection>
        )}

        <FormSection
          title="Context"
          icon={<MapPin className={sectionIconClass} />}
          className="border-t pt-4"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_1.35fr]">
            <FormField label="Location" labelClassName={fieldLabelClass}>
              <div className={inputWithIconClass}>
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <input
                  placeholder="Room, hall, campus"
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </FormField>
            <FormField label="Notes" labelClassName={fieldLabelClass}>
              <textarea
                placeholder="Optional notes or requirements"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-16 resize-none rounded-lg border border-input bg-background/65 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </FormField>
          </div>
        </FormSection>
      </DialogBody>

      <DialogFooter className={cn("m-0 rounded-none px-5 py-3", footerStart && "sm:justify-between")}>
        {footerStart}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!title.trim()}>
            {submitLabel}
          </Button>
        </div>
      </DialogFooter>
    </form>
  )
}

export { EventForm }
