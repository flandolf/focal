import { useState, type FormEvent, type ReactNode } from "react"
import { addMinutes } from "date-fns"
import { CalendarIcon, CheckCircle2, Clock, MapPin, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DatePickerField, FormField, FormSection, SelectField } from "@/components/ui/form-controls"
import { VCE_SUBJECTS, type EventType, type Subject } from "@/lib/types"
import { cn, getSubjectById } from "@/lib/utils"

const fieldLabelClass = "text-control font-medium text-muted-foreground"
const inputWithIconClass = "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background/65 px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
const sectionIconClass = "h-3.5 w-3.5 text-muted-foreground"

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
}: EventFormProps) {
  const [title, setTitle] = useState(initialValues?.title ?? "")
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [eventType, setEventType] = useState<EventType>(initialValues?.eventType ?? "exam")
  const [subjectId, setSubjectId] = useState(initialValues?.subjectId ?? "")
  const [location, setLocation] = useState(initialValues?.location ?? "")
  const [eventDate, setEventDate] = useState<Date | undefined>(() => initialValues?.date ?? new Date())
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? "09:00")
  const [duration, setDuration] = useState(initialValues?.duration ?? "120")
  const [isFinished, setIsFinished] = useState(initialValues?.isFinished ?? false)

  const baseSubjects = availableSubjects ?? [...VCE_SUBJECTS, ...customSubjects]
  const initialSubject = getSubjectById(initialValues?.subjectId)
  const subjects = initialSubject && !baseSubjects.some((subject) => subject.id === initialSubject.id)
    ? [initialSubject, ...baseSubjects]
    : baseSubjects

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || !eventDate) return

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(eventDate)
    start.setHours(hours, minutes, 0, 0)

    const durationMinutes = Number.parseInt(duration, 10)
    const end = Number.isFinite(durationMinutes) && durationMinutes > 0
      ? addMinutes(start, durationMinutes)
      : undefined

    onSubmit({
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      startTime: start.toISOString(),
      endTime: end?.toISOString(),
      eventType,
      subjectId: subjectId || undefined,
      location: location.trim() ? location.trim() : undefined,
      isFinished,
      finishedAt: isFinished ? (initialValues?.finishedAt ?? new Date().toISOString()) : undefined,
    })
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
              <option value="gat">GAT</option>
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

            <FormField label="Duration" labelClassName={fieldLabelClass}>
              <Input
                type="number"
                min="1"
                step="1"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="h-10 rounded-lg bg-background/65"
              />
            </FormField>
          </div>
        </FormSection>

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
