import { useState } from "react"
import { addMinutes, format } from "date-fns"
import { CalendarIcon, Clock, MapPin } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { VCE_SUBJECTS, type EventType, type Subject } from "@/lib/types"

interface NewEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customSubjects: Subject[]
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
  initialDate,
  onSubmit,
}: NewEventDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [eventType, setEventType] = useState<EventType>("exam")
  const [subjectId, setSubjectId] = useState("")
  const [location, setLocation] = useState("")
  const [eventDate, setEventDate] = useState<Date | undefined>(() => initialDate ? new Date(initialDate) : new Date())
  const [startTime, setStartTime] = useState("09:00")
  const [duration, setDuration] = useState("120")

  const subjects = [...VCE_SUBJECTS, ...customSubjects]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
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
    })

    setTitle("")
    setDescription("")
    setEventType("exam")
    setSubjectId("")
    setLocation("")
    setEventDate(new Date())
    setStartTime("09:00")
    setDuration("120")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Event</DialogTitle>
          <DialogDescription>
            Add a one-off exam, SAC, or reminder without creating a project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g. Methods exam"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value as EventType)}
                >
                  <option value="exam">Exam</option>
                  <option value="sac">SAC</option>
                  <option value="assignment">Assignment</option>
                  <option value="gat">GAT</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <option value="">No subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.shortCode} {subject.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional notes or requirements"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !eventDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {eventDate ? format(eventDate, "MMM d") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={eventDate}
                      onSelect={setEventDate}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Start Time</label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration (minutes)</label>
                <Input
                  type="number"
                  min="15"
                  step="15"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Location</label>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Room, hall, campus"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Add Event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
