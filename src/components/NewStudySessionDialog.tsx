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

const DURATION_OPTIONS = ["30", "45", "60", "90"]

interface NewStudySessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  customSubjects: Subject[]
  initialDate?: Date
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
  initialDate,
  onSubmit,
}: NewStudySessionDialogProps) {
  const [projectId, setProjectId] = useState<string>("")
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [notes, setNotes] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(() => initialDate ? new Date(initialDate) : new Date())
  const [startTime, setStartTime] = useState("14:00")
  const [duration, setDuration] = useState("60")
  const subjects = [...VCE_SUBJECTS, ...customSubjects]
  const selectedSubjects = subjects.filter((subject) => subjectIds.includes(subject.id))
  const durationMinutes = Number.parseInt(duration, 10)
  const canSubmit = title.trim().length > 0
    && subjectIds.length > 0
    && Number.isFinite(durationMinutes)
    && durationMinutes > 0

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
    const durationMinutes = Number.parseInt(duration, 10)
    if (!title.trim() || !startDate || subjectIds.length === 0 || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(startDate)
    start.setHours(hours, minutes, 0, 0)
    const end = addHours(start, durationMinutes / 60)

    const topics = topicsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    onSubmit({
      projectId: projectId || undefined,
      subjectIds,
      title: title.trim(),
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
      <DialogContent className="h-[100dvh] max-h-none w-screen max-w-none overflow-hidden rounded-none px-8 pb-6 pt-14 sm:max-w-none min-[1200px]:px-10 [display:flex] flex-col">
        <DialogHeader className="shrink-0 pr-16">
          <DialogTitle>Plan Study Session</DialogTitle>
          <DialogDescription>
            Create a study session to track your revision and learning progress.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(22rem,1fr)_minmax(20rem,0.9fr)]">
            <section className="space-y-4 rounded-xl border border-border/70 bg-background/35 p-4">
              <div>
                <h3 className="text-sm font-semibold">Session Details</h3>
                <p className="mt-1 text-xs text-muted-foreground">Name the block and connect it to an assessment if useful.</p>
              </div>
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
                <label className="text-sm font-medium">Assessment</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={projectId}
                  onChange={(e) => handleProjectChange(e.target.value)}
                >
                  <option value="">No assessment</option>
                  {projects.filter((p) => !p.isArchived).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
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
                <label className="text-sm font-medium">Topics</label>
                <Input
                  placeholder="e.g. Photosynthesis, Cell Division"
                  value={topicsInput}
                  onChange={(e) => setTopicsInput(e.target.value)}
                />
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-border/70 bg-background/35 p-4">
              <div>
                <h3 className="text-sm font-semibold">Timing & Notes</h3>
                <p className="mt-1 text-xs text-muted-foreground">Set the calendar block, duration, and session reminders.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
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
                  <div className="flex flex-wrap gap-1.5">
                    {DURATION_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDuration(option)}
                        className={cn(
                          "rounded-md border px-2 py-1 text-micro font-medium transition-colors",
                          duration === option
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border/70 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {option}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  placeholder="Key concepts, resources, or reminders..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={10}
                  className="flex min-h-40 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </section>

            <section className="space-y-3 rounded-xl border border-border/70 bg-background/35 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="text-sm font-medium">Subjects</label>
                  <p className="text-xs text-muted-foreground">Required for analytics and readiness.</p>
                </div>
                {subjectIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSubjectIds([])}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              {selectedSubjects.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSubjects.map((subject) => (
                    <span
                      key={subject.id}
                      className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                    >
                      {subject.icon} {subject.shortCode}
                    </span>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <div className="max-h-[calc(100dvh-18rem)] overflow-auto rounded-xl border border-input bg-background/55 p-2">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    {subjects.map((subject) => (
                      <label
                        key={subject.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                          subjectIds.includes(subject.id)
                            ? "border-primary/25 bg-primary/10 text-foreground"
                            : "border-transparent hover:bg-accent/45"
                        )}
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
                  <p className="text-xs text-destructive">Choose at least one subject.</p>
                )}
              </div>
            </section>
          </div>
          </div>
          <DialogFooter className="-mx-8 shrink-0 items-center px-8 min-[1200px]:-mx-10 min-[1200px]:px-10">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Create Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
