import { format, parseISO } from "date-fns"
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

interface EditEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null
  customSubjects: Subject[]
  availableSubjects?: Subject[]
  onSubmit: (data: {
    id: string
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
    isFinished?: boolean
    finishedAt?: string
  }) => void
  onDelete: (id: string) => void
}

function getDurationMinutes(event: CalendarEvent) {
  if (!event.endTime) return ""

  const durationMs = parseISO(event.endTime).getTime() - parseISO(event.startTime).getTime()
  return String(Math.round(durationMs / (1000 * 60)))
}

export function EditEventDialog({
  open,
  onOpenChange,
  event,
  customSubjects,
  availableSubjects,
  onSubmit,
  onDelete,
}: EditEventDialogProps) {
  const handleDelete = () => {
    if (!event) return

    onDelete(event.id)
    onOpenChange(false)
  }

  const handleSubmit = (values: EventFormValues) => {
    if (!event) return

    onSubmit({
      id: event.id,
      ...values,
    })
    onOpenChange(false)
  }

  if (!event) return null

  const start = parseISO(event.startTime)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <div className="space-y-2 pr-9">
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>
              Update this one-off calendar item.
            </DialogDescription>
          </div>
        </DialogHeader>
        <EventForm
          key={`${event.id}-${open ? "open" : "closed"}`}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          initialValues={{
            title: event.title,
            description: event.description,
            eventType: event.eventType,
            subjectId: event.subjectId,
            location: event.location,
            date: start,
            startTime: format(start, "HH:mm"),
            duration: getDurationMinutes(event),
            isFinished: event.isFinished,
            finishedAt: event.finishedAt,
          }}
          submitLabel="Save Changes"
          showFinishedControl
          footerStart={
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
          }
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
