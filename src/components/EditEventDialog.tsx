import { useEffect, useState } from "react"
import { addMinutes, format, parseISO } from "date-fns"
import { CalendarIcon, CheckCircle2, Clock, MapPin, Trash2 } from "lucide-react"
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
import { VCE_SUBJECTS, type CalendarEvent, type EventType, type Subject } from "@/lib/types"

interface EditEventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null
  customSubjects: Subject[]
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

export function EditEventDialog({
  open,
  onOpenChange,
  event,
  customSubjects,
  onSubmit,
  onDelete,
}: EditEventDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [eventType, setEventType] = useState<EventType>("event")
  const [subjectId, setSubjectId] = useState("")
  const [location, setLocation] = useState("")
  const [eventDate, setEventDate] = useState<Date | undefined>(new Date())
  const [startTime, setStartTime] = useState("09:00")
  const [duration, setDuration] = useState("120")
  const [isFinished, setIsFinished] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const subjects = [...VCE_SUBJECTS, ...customSubjects]

  useEffect(() => {
    if (!event) return

    const start = parseISO(event.startTime)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(event.title)
    setDescription(event.description ?? "")
    setEventType(event.eventType)
    setSubjectId(event.subjectId ?? "")
    setLocation(event.location ?? "")
    setEventDate(start)
    setStartTime(format(start, "HH:mm"))
    setIsFinished(event.isFinished ?? false)

    if (event.endTime) {
      const durationMs = parseISO(event.endTime).getTime() - start.getTime()
      setDuration(String(Math.max(15, Math.round(durationMs / (1000 * 60)))))
    } else {
      setDuration("")
    }
    setIsDeleting(false)
  }, [event])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!event || !title.trim() || !eventDate) return

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(eventDate)
    start.setHours(hours, minutes, 0, 0)

    const durationMinutes = Number.parseInt(duration, 10)
    const end = Number.isFinite(durationMinutes) && durationMinutes > 0
      ? addMinutes(start, durationMinutes)
      : undefined

    onSubmit({
      id: event.id,
      title: title.trim(),
      description: description.trim() ? description.trim() : undefined,
      startTime: start.toISOString(),
      endTime: end?.toISOString(),
      eventType,
      subjectId: subjectId || undefined,
      location: location.trim() ? location.trim() : undefined,
      isFinished,
      finishedAt: isFinished ? (event.finishedAt ?? new Date().toISOString()) : undefined,
    })

    onOpenChange(false)
  }

  const handleDelete = () => {
    if (!event) return

    setIsDeleting(true)
    onDelete(event.id)
    onOpenChange(false)
  }

  if (!event) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>
            Update this one-off calendar item.
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

            <button
              type="button"
              onClick={() => setIsFinished((current) => !current)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                isFinished
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border/70 bg-background/35 text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={isFinished}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">Finished</span>
                <span className="block text-xs text-muted-foreground">
                  Past events are marked finished automatically.
                </span>
              </span>
              <CheckCircle2 className={cn("h-4 w-4 shrink-0", isFinished && "text-emerald-500")} />
            </button>
          </div>
          <DialogFooter className="flex justify-between">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!title.trim()}>
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
