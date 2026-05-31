import { useState } from "react"
import { format, addHours } from "date-fns"
import { CalendarIcon, Clock } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { VCE_SUBJECTS, type Project, type Subject } from "@/lib/types"

interface NewStudySessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  customSubjects: Subject[]
  onSubmit: (data: {
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
  }) => void
}

export function NewStudySessionDialog({
  open,
  onOpenChange,
  projects,
  customSubjects,
  onSubmit,
}: NewStudySessionDialogProps) {
  const [projectId, setProjectId] = useState<string>("")
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [notes, setNotes] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [startTime, setStartTime] = useState("14:00")
  const [duration, setDuration] = useState("60")
  const subjects = [...VCE_SUBJECTS, ...customSubjects]

  const toggleSubject = (id: string) => {
    setSubjectIds((current) =>
      current.includes(id) ? current.filter((subjectId) => subjectId !== id) : [...current, id]
    )
  }

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    const project = projects.find((item) => item.id === id)
    if (project?.subjectId) {
      setSubjectIds((current) => current.includes(project.subjectId!) ? current : [...current, project.subjectId!])
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !startDate || subjectIds.length === 0) return

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(startDate)
    start.setHours(hours, minutes, 0, 0)
    const end = addHours(start, parseInt(duration) / 60)

    const topics = topicsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    onSubmit({
      projectId: projectId || undefined,
      subjectIds,
      title,
      description: description.trim() ? description : undefined,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      topics: topics.length > 0 ? topics : undefined,
      notes: notes.trim() ? notes : undefined,
    })

    // Reset form
    setProjectId("")
    setSubjectIds([])
    setTitle("")
    setDescription("")
    setTopicsInput("")
    setNotes("")
    setStartDate(new Date())
    setStartTime("14:00")
    setDuration("60")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Plan Study Session</DialogTitle>
          <DialogDescription>
            Create a study session to track your revision and learning progress.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Session Title</label>
                <Input
                  placeholder="e.g. Review Unit 3 notes"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Project</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  <option value="">No project</option>
                  {projects.filter((p) => !p.isArchived).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-2">
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

              <div className="space-y-2">
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

              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Optional — what do you want to achieve?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Topics (comma-separated)</label>
                <Input
                  placeholder="e.g. Photosynthesis, Cell Division"
                  value={topicsInput}
                  onChange={(e) => setTopicsInput(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subjects</label>
                <div className="max-h-44 overflow-auto rounded-xl border border-input bg-background/35 p-2">
                  <div className="grid grid-cols-1 gap-1">
                    {subjects.map((subject) => (
                      <label
                        key={subject.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent/45"
                      >
                        <Checkbox
                          checked={subjectIds.includes(subject.id)}
                          onCheckedChange={() => toggleSubject(subject.id)}
                        />
                        <span className="min-w-0 truncate">
                          {subject.icon} {subject.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                {subjectIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">Choose at least one subject.</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  placeholder="Key concepts, resources, or reminders..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
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
            <Button type="submit" disabled={!title || subjectIds.length === 0}>
              Create Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
