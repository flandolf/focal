import { useState, useEffect } from "react"
import { format, addHours, parseISO } from "date-fns"
import { CalendarIcon, Clock, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import type { Project, StudySession } from "@/lib/types"

interface EditStudySessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  session: StudySession | null
  onSubmit: (data: {
    id: string
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
  }) => void
  onDelete: (id: string) => void
}

export function EditStudySessionDialog({
  open,
  onOpenChange,
  projects,
  session,
  onSubmit,
  onDelete,
}: EditStudySessionDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [notes, setNotes] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [startTime, setStartTime] = useState("14:00")
  const [duration, setDuration] = useState("60")
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(session.title)
      setDescription(session.description ?? "")
      setTopicsInput(session.topics?.join(", ") ?? "")
      setNotes(session.notes ?? "")
      
      const start = parseISO(session.startTime)
      setStartDate(start)
      setStartTime(format(start, "HH:mm"))
      
      const startMs = new Date(session.startTime).getTime()
      const endMs = new Date(session.endTime).getTime()
      const durationMs = endMs - startMs
      setDuration(String(Math.round(durationMs / (1000 * 60))))
    }
  }, [session])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!session || !title || !startDate) return

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(startDate)
    start.setHours(hours, minutes, 0, 0)
    const end = addHours(start, parseInt(duration) / 60)

    const topics = topicsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    onSubmit({
      id: session.id,
      title,
      description: description.trim() ? description : undefined,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      topics: topics.length > 0 ? topics : undefined,
      notes: notes.trim() ? notes : undefined,
    })

    onOpenChange(false)
  }

  const handleDelete = () => {
    if (session) {
      setIsDeleting(true)
      onDelete(session.id)
      onOpenChange(false)
    }
  }

  if (!session) return null

  const project = projects.find((p) => p.id === session.projectId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Study Session</DialogTitle>
          <DialogDescription>
            {project && <span>Editing session in <strong>{project.name}</strong></span>}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-5">
            <div className="space-y-2.5">
              <label className="text-sm font-medium">Session Title</label>
              <Input
                placeholder="e.g. Review Unit 3 notes"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional — what did you achieve?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2.5">
                <label className="text-sm font-medium">Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "MMM d") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2.5">
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

            <div className="space-y-2.5">
              <label className="text-sm font-medium">Duration (minutes)</label>
              <Input
                type="number"
                min="15"
                step="15"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="60"
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium">Topics (comma-separated)</label>
              <Input
                placeholder="e.g. Photosynthesis, Cell Division"
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                placeholder="Key concepts, resources, or reminders..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
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
              <Button type="submit" disabled={!title}>
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
