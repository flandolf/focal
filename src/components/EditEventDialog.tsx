import { useEffect, useState } from "react"
import { addMinutes, format, parseISO } from "date-fns"
import { CalendarIcon, CheckCircle2, Clock, MapPin, Tag, Trash2 } from "lucide-react"
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

const fieldLabelClass = "text-control font-medium text-muted-foreground"
const selectClass = "flex h-10 w-full rounded-lg border border-input bg-background/65 px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
const inputWithIconClass = "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background/65 px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
const sectionHeadingClass = "flex items-center gap-2 text-sm font-semibold"
const sectionIconClass = "h-3.5 w-3.5 text-muted-foreground"

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
      setDuration(String(Math.round(durationMs / (1000 * 60))))
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
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <div className="space-y-2 pr-9">
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>
              Update this one-off calendar item.
            </DialogDescription>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid min-h-0">
          <div className="grid max-h-[min(72vh,40rem)] gap-5 overflow-y-auto px-5 py-5">
            <section className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <label className={fieldLabelClass}>Event title</label>
                <span className="text-micro font-medium uppercase tracking-normal text-muted-foreground/70">
                  Required
                </span>
              </div>
              <Input
                placeholder="e.g. Methods exam"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="h-10 rounded-lg bg-background/65 text-base"
              />
            </section>

            <section className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
              <h3 className={sectionHeadingClass}>
                <Tag className={sectionIconClass} />
                Classification
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <label className={fieldLabelClass}>Type</label>
                  <select
                    className={selectClass}
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
                <div className="grid gap-2">
                  <label className={fieldLabelClass}>Subject</label>
                  <select
                    className={selectClass}
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
            </section>

            <section className="grid gap-3">
              <h3 className={sectionHeadingClass}>
                <CalendarIcon className={sectionIconClass} />
                Schedule
              </h3>
              <div className="grid gap-3 sm:grid-cols-[1.25fr_1fr_1fr]">
                <div className="grid gap-2">
                  <label className={fieldLabelClass}>Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-10 w-full justify-start rounded-lg bg-background/65 text-left font-normal",
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

                <div className="grid gap-2">
                  <label className={fieldLabelClass}>Start</label>
                  <div className={inputWithIconClass}>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className={fieldLabelClass}>Duration</label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="h-10 rounded-lg bg-background/65"
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-3 border-t pt-4">
              <h3 className={sectionHeadingClass}>
                <MapPin className={sectionIconClass} />
                Context
              </h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_1.35fr]">
                <div className="grid gap-2">
                  <label className={fieldLabelClass}>Location</label>
                  <div className={inputWithIconClass}>
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <input
                      placeholder="Room, hall, campus"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className={fieldLabelClass}>Notes</label>
                  <textarea
                    placeholder="Optional notes or requirements"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-16 resize-none rounded-lg border border-input bg-background/65 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                </div>
              </div>
            </section>
          </div>
          <DialogFooter className="m-0 rounded-none px-5 py-3 sm:justify-between">
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
