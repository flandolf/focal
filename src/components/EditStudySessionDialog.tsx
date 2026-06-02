import { useState, useEffect } from "react"
import { format, addHours, parseISO } from "date-fns"
import { CalendarIcon, CheckCircle2, Clock, PlayCircle, Trash2 } from "lucide-react"
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
import { cn, getSessionSubjectIds } from "@/lib/utils"
import { VCE_SUBJECTS, type ConfidenceScore, type Project, type StudySession, type StudySessionStatus, type Subject } from "@/lib/types"

const DURATION_OPTIONS = ["30", "45", "60", "90"]

interface EditStudySessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  customSubjects: Subject[]
  session: StudySession | null
  onSubmit: (data: {
    id: string
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
    status?: StudySessionStatus
    confidence?: ConfidenceScore
    blockers?: string
    nextAction?: string
    completedAt?: string
  }) => void
  onDelete: (id: string) => void
}

export function EditStudySessionDialog({
  open,
  onOpenChange,
  projects,
  customSubjects,
  session,
  onSubmit,
  onDelete,
}: EditStudySessionDialogProps) {
  const [projectId, setProjectId] = useState("")
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState<StudySessionStatus>("planned")
  const [confidence, setConfidence] = useState<ConfidenceScore | undefined>(undefined)
  const [blockers, setBlockers] = useState("")
  const [nextAction, setNextAction] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [startTime, setStartTime] = useState("14:00")
  const [duration, setDuration] = useState("60")
  const [isDeleting, setIsDeleting] = useState(false)
  const subjects = [...VCE_SUBJECTS, ...customSubjects]

  useEffect(() => {
    if (session) {
      const project = projects.find((p) => p.id === session.projectId)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProjectId(session.projectId ?? "")
      setSubjectIds(getSessionSubjectIds(session, project))
      setTitle(session.title)
      setDescription(session.description ?? "")
      setTopicsInput(session.topics?.join(", ") ?? "")
      setNotes(session.notes ?? "")
      setStatus(session.status)
      setConfidence(session.confidence)
      setBlockers(session.blockers ?? "")
      setNextAction(session.nextAction ?? "")
      setIsDeleting(false)
      
      const start = parseISO(session.startTime)
      setStartDate(start)
      setStartTime(format(start, "HH:mm"))
      
      const startMs = new Date(session.startTime).getTime()
      const endMs = new Date(session.endTime).getTime()
      const durationMs = endMs - startMs
      setDuration(String(Math.round(durationMs / (1000 * 60))))
    }
  }, [projects, session])

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

  const saveSession = (nextStatus = status) => {
    const durationMinutes = Number.parseInt(duration, 10)
    if (!session || !title.trim() || !startDate || subjectIds.length === 0 || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(startDate)
    start.setHours(hours, minutes, 0, 0)
    const end = addHours(start, durationMinutes / 60)

    const topics = topicsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    onSubmit({
      id: session.id,
      projectId: projectId || undefined,
      subjectIds,
      title: title.trim(),
      description: description.trim() ? description : undefined,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      topics: topics.length > 0 ? topics : undefined,
      notes: notes.trim() ? notes : undefined,
      status: nextStatus,
      confidence,
      blockers: blockers.trim() ? blockers : undefined,
      nextAction: nextAction.trim() ? nextAction : undefined,
      completedAt: nextStatus === "completed" ? (session.completedAt ?? new Date().toISOString()) : undefined,
    })

    onOpenChange(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveSession()
  }

  const handleCompleteAndReview = () => {
    setStatus("completed")
    saveSession("completed")
  }

  const handleStartSession = () => {
    setStatus("in-progress")
    saveSession("in-progress")
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
  const selectedSubjects = subjects.filter((subject) => subjectIds.includes(subject.id))
  const durationMinutes = Number.parseInt(duration, 10)
  const canSave = title.trim().length > 0
    && subjectIds.length > 0
    && Number.isFinite(durationMinutes)
    && durationMinutes > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] max-h-none w-screen max-w-none overflow-hidden rounded-none px-8 pb-6 pt-14 sm:max-w-none min-[1200px]:px-10 [display:flex] flex-col">
        <DialogHeader className="shrink-0 pr-16">
          <DialogTitle>Edit Study Session</DialogTitle>
          <DialogDescription>
            {project ? (
              <span>Editing session for <strong>{project.name}</strong></span>
            ) : (
              <span>Edit timing, subjects, notes, and review details for this study block.</span>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(20rem,0.9fr)_minmax(24rem,1.1fr)_minmax(21rem,0.9fr)]">
            <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-border/70 bg-background/35 p-4">
              <div>
                <h3 className="text-sm font-semibold">Session Details</h3>
                <p className="mt-1 text-xs text-muted-foreground">Keep the session label, assessment, and status current.</p>
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

              <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assessment</label>
                  <select
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
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
                  <label className="text-sm font-medium">Status</label>
                  <select
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StudySessionStatus)}
                  >
                    <option value="planned">Planned</option>
                    <option value="in-progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-border/70 bg-background/35 p-4">
              <div>
                <h3 className="text-sm font-semibold">Timing</h3>
                <p className="mt-1 text-xs text-muted-foreground">Adjust the calendar block without leaving the dialog.</p>
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
            </section>

            <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Optional - what did you achieve?"
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
            </div>

            <div className="space-y-5">
            <section className="space-y-3 rounded-xl border border-border/70 bg-background/35 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="text-sm font-medium">Subjects</label>
                  <p className="text-xs text-muted-foreground">Choose one or more subjects for readiness tracking.</p>
                </div>
                <div className="flex max-w-full flex-wrap justify-end gap-1.5">
                  {selectedSubjects.map((subject) => (
                    <span
                      key={subject.id}
                      className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                    >
                      {subject.icon} {subject.shortCode}
                    </span>
                  ))}
                  {subjectIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSubjectIds([])}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[calc(100dvh-20rem)] overflow-auto rounded-lg border border-input bg-background/55 p-2">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-1.5">
                  {subjects.map((subject) => (
                    <label
                      key={subject.id}
                      className={cn(
                        "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                        subjectIds.includes(subject.id)
                          ? "border-primary/25 bg-primary/10 text-foreground"
                          : "border-transparent hover:bg-accent/45"
                      )}
                    >
                      <Checkbox
                        checked={subjectIds.includes(subject.id)}
                        onCheckedChange={() => toggleSubject(subject.id)}
                      />
                      <span className="min-w-0 truncate leading-none">
                        {subject.icon} {subject.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              {subjectIds.length === 0 && (
                <p className="text-xs text-destructive">Choose at least one subject.</p>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-border/70 bg-background/35 p-4">
              <div>
                <label className="text-sm font-medium">Notes</label>
                <p className="mt-1 text-xs text-muted-foreground">Resources, reminders, and context for the session.</p>
              </div>
              <textarea
                placeholder="Key concepts, resources, or reminders..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={10}
                className="flex min-h-40 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </section>
            </div>

            <section className="space-y-4 rounded-xl border border-border/70 bg-background/35 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Session Review</p>
                  <p className="text-xs text-muted-foreground">Used by Today to spot weak areas.</p>
                </div>
                {status === "completed" && (
                  <span className="rounded-md bg-emerald-500/12 px-2 py-1 text-micro font-medium text-emerald-600 dark:text-emerald-300">
                    Complete
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Confidence</label>
                <div className="grid grid-cols-5 gap-2">
                  {([1, 2, 3, 4, 5] as ConfidenceScore[]).map((score) => (
                    <button
                      key={score}
                      type="button"
                      onClick={() => setConfidence(score)}
                      className={cn(
                        "h-9 rounded-lg border text-xs font-medium transition-colors",
                        confidence === score
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground"
                      )}
                      aria-pressed={confidence === score}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Blockers</label>
                  <textarea
                    placeholder="What still feels unclear?"
                    value={blockers}
                    onChange={(e) => setBlockers(e.target.value)}
                    rows={3}
                    className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Next action</label>
                  <textarea
                    placeholder="e.g. redo exam Q4"
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    rows={3}
                    className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </section>
            </div>
          </div>
          <DialogFooter className="-mx-8 shrink-0 items-center justify-between gap-3 px-8 min-[1200px]:-mx-10 min-[1200px]:px-10">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {status === "planned" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleStartSession}
                  disabled={!canSave}
                  className="gap-1.5"
                >
                  <PlayCircle className="h-4 w-4" />
                  Start
                </Button>
              )}
              {status !== "completed" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCompleteAndReview}
                  disabled={!canSave}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete & Review
                </Button>
              )}
              <Button type="submit" disabled={!canSave}>
                Save Changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
