import { format, parseISO, addWeeks, addMonths } from "date-fns"
import { Clock } from "lucide-react"
import { Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { EventForm, type EventFormValues } from "@/components/EventForm"
import type { CalendarEvent, EventType, Subject } from "@/lib/types"

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass an existing event to open in edit mode; undefined for new event mode. */
  event?: CalendarEvent | null
  customSubjects: Subject[]
  availableSubjects?: Subject[]
  initialDate?: Date
  /** Only used in new-event mode for recurring event creation. */
  onSubmit?: (data: {
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
  }) => void
  onSubmitMultiple?: (events: {
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
  }[]) => void
  onDelete?: (id: string) => void
}

function getDurationMinutes(event: CalendarEvent) {
  if (!event.endTime) return ""
  const durationMs = parseISO(event.endTime).getTime() - parseISO(event.startTime).getTime()
  return String(Math.round(durationMs / (1000 * 60)))
}

function getEndTimeStr(event: CalendarEvent) {
  return event.endTime ? format(parseISO(event.endTime), "HH:mm") : undefined
}

function generateRecurringEvents(
  base: Record<string, unknown>,
  pattern: "weekly" | "biweekly" | "monthly",
  endDate?: Date,
  maxEvents = 52,
): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = []
  const start = new Date(base.startTime as string)
  const limit = endDate ?? addWeeks(start, 26)

  let current = start
  for (let i = 0; i < maxEvents && current <= limit; i++) {
    const offset = i === 0 ? 0 : 1
    const eventStart = i === 0 ? current : (
      pattern === "weekly" ? addWeeks(current, offset) :
      pattern === "biweekly" ? addWeeks(current, 2) :
      addMonths(current, offset)
    )
    if (eventStart > limit) break

    const baseStart = new Date(base.startTime as string)
    eventStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0)

    const durationMs = base.endTime
      ? new Date(base.endTime as string).getTime() - baseStart.getTime()
      : 0
    const eventEnd = durationMs > 0 ? new Date(eventStart.getTime() + durationMs) : undefined

    events.push({
      ...base,
      startTime: eventStart.toISOString(),
      endTime: eventEnd?.toISOString(),
    })

    current = eventStart
  }

  return events
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  customSubjects,
  availableSubjects,
  initialDate,
  onSubmit,
  onSubmitMultiple,
  onDelete,
}: EventDialogProps) {
  const isEditMode = Boolean(event)
  const existingEvent = isEditMode ? event! : null

  const handleSubmit = (values: EventFormValues) => {
    if (existingEvent) {
      const { id } = existingEvent
      onSubmit?.({
        id,
        ...values,
      } as Parameters<NonNullable<typeof onSubmit>>[0])
      onOpenChange(false)
      return
    }

    // New mode — handle recurring events
    if (values.recurrence && values.recurrence.pattern !== "none" && onSubmitMultiple) {
      const recurringEvents = generateRecurringEvents(
        {
          title: values.title,
          description: values.description,
          startTime: values.startTime,
          endTime: values.endTime,
          eventType: values.eventType,
          subjectId: values.subjectId,
          location: values.location,
        },
        values.recurrence.pattern,
        values.recurrence.endDate ? new Date(values.recurrence.endDate) : undefined,
      )
      onSubmitMultiple(recurringEvents as Parameters<typeof onSubmitMultiple>[0])
    } else if (onSubmit) {
      onSubmit(values)
    }
    onOpenChange(false)
  }

  const handleDelete = () => {
    if (!existingEvent || !onDelete) return
    const { id } = existingEvent
    onDelete(id)
    onOpenChange(false)
  }

  const start = existingEvent ? parseISO(existingEvent.startTime) : (initialDate ? new Date(initialDate) : new Date())
  const end = existingEvent?.endTime ? parseISO(existingEvent.endTime) : null
  const endTimeLabel = end
    ? `${format(start, "h:mm a")} — ${format(end, "h:mm a")}`
    : format(start, "h:mm a")

  const dateLabel = format(start, "EEEE, MMMM d")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <div className="space-y-2 pr-9">
            <DialogTitle>{isEditMode ? "Edit Event" : "Add Event"}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{dateLabel} · {isEditMode ? endTimeLabel : `${format(start, "h:mm a")} · start time can be adjusted below`}</span>
              </div>
            </DialogDescription>
          </div>
        </DialogHeader>
        <EventForm
          key={`${isEditMode ? `edit-${existingEvent?.id}` : `new-${open ? "open" : "closed"}`}`}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          initialValues={existingEvent ? {
            title: existingEvent.title,
            description: existingEvent.description,
            eventType: existingEvent.eventType,
            subjectId: existingEvent.subjectId,
            location: existingEvent.location,
            date: start,
            startTime: format(start, "HH:mm"),
            duration: getDurationMinutes(existingEvent),
            endTime: getEndTimeStr(existingEvent),
            endDate: end && format(end, "yyyy-MM-dd") !== format(start, "yyyy-MM-dd") ? end : undefined,
            isFinished: existingEvent.isFinished,
            finishedAt: existingEvent.finishedAt,
          } : { date: initialDate ? new Date(initialDate) : new Date() }}
          submitLabel={isEditMode ? "Save Changes" : "Add Event"}
          showFinishedControl={isEditMode}
          footerStart={isEditMode && onDelete ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : undefined}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}