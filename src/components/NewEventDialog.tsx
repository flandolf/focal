import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EventForm, type EventFormValues } from "@/components/EventForm"
import type { EventType, Subject } from "@/lib/types"

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
}

export function NewEventDialog({
  open,
  onOpenChange,
  customSubjects,
  availableSubjects,
  initialDate,
  onSubmit,
}: NewEventDialogProps) {
  const handleSubmit = (values: EventFormValues) => {
    onSubmit(values)
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
