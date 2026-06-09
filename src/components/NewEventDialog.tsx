import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EventForm, type EventFormValues } from "@/components/EventForm"
import type { EventType, Subject } from "@/lib/types"
import { addWeeks, addMonths } from "date-fns"

interface NewEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customSubjects: Subject[]
  availableSubjects?: Subject[]
  initialDate?: Date
  onSubmit: (data: {
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
}

function generateRecurringEvents(
  base: Omit<ReturnType<typeof Object>, never>,
  pattern: "weekly" | "biweekly" | "monthly",
  endDate?: Date,
  maxEvents = 52,
): ReturnType<typeof Object>[] {
  const events = []
  const start = new Date(base.startTime)
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

    const baseStart = new Date(base.startTime)
    eventStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0)

    const durationMs = base.endTime
      ? new Date(base.endTime).getTime() - baseStart.getTime()
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

export function NewEventDialog({
  open,
  onOpenChange,
  customSubjects,
  availableSubjects,
  initialDate,
  onSubmit,
  onSubmitMultiple,
}: NewEventDialogProps) {
  const handleSubmit = (values: EventFormValues) => {
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
      onSubmitMultiple(recurringEvents)
    } else {
      onSubmit(values)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <div className="space-y-2 pr-9">
            <DialogTitle>Add Event</DialogTitle>
            <DialogDescription>
              Add a one-off exam, SAC, or reminder without creating a project.
            </DialogDescription>
          </div>
        </DialogHeader>
        <EventForm
          key={open ? "new-event-open" : "new-event-closed"}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          initialValues={{ date: initialDate ? new Date(initialDate) : new Date() }}
          submitLabel="Add Event"
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
