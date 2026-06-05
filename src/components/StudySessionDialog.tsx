import { useEffect, useState } from "react"
import { addMinutes, format, parseISO } from "date-fns"
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  PlayCircle,
  Timer,
  Trash2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePickerField, FormField, FormSection, SelectField } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { cn, getSessionSubjectIds, getSubjectById } from "@/lib/utils"
import {
  VCE_SUBJECTS,
  type ConfidenceScore,
  type Project,
  type StudySession,
  type StudySessionStatus,
  type Subject,
} from "@/lib/types"

const DURATION_OPTIONS = ["30", "45", "60", "90"]
const fieldLabelClass = "text-control font-medium text-muted-foreground"
const sectionIconClass = "h-3.5 w-3.5 text-muted-foreground"
const panelClass = "grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 dark:border-input/70 dark:bg-input/20"
const inputClass = "h-10 rounded-lg bg-background/65 dark:bg-input/30"
const inputWithIconClass = "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background/65 px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
const textareaClass = "min-h-20 resize-none rounded-lg border border-input bg-background/65 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

interface StudySessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  customSubjects: Subject[]
  availableSubjects?: Subject[]
  session?: StudySession | null
  initialDate?: Date
  onSubmit: (data: {
    id?: string
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
  onDelete?: (id: string) => void
}

export function StudySessionDialog({
  open,
  onOpenChange,
  projects,
  customSubjects,
  availableSubjects,
  session,
  initialDate,
  onSubmit,
  onDelete,
}: StudySessionDialogProps) {
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
  const [startDate, setStartDate] = useState<Date | undefined>(() => initialDate ? new Date(initialDate) : new Date())
  const [startTime, setStartTime] = useState("14:00")
  const [duration, setDuration] = useState("60")
  const [isDeleting, setIsDeleting] = useState(false)

  const isEdit = Boolean(session)
  const activeProject = projects.find((project) => project.id === projectId)
  const baseSubjects = availableSubjects ?? [...VCE_SUBJECTS, ...customSubjects]
  const hiddenSelectedSubjects = subjectIds
    .map((id) => getSubjectById(id))
    .filter((subject): subject is Subject => {
      if (!subject) return false
      return !baseSubjects.some((item) => item.id === subject.id)
    })
  const subjects = [...hiddenSelectedSubjects, ...baseSubjects]
  const selectedSubjects = subjects.filter((subject) => subjectIds.includes(subject.id))
  const durationMinutes = Number.parseInt(duration, 10)
  const canSave = title.trim().length > 0
    && subjectIds.length > 0
    && Boolean(startDate)
    && Number.isFinite(durationMinutes)
    && durationMinutes > 0
  const selectedDateLabel = startDate ? format(startDate, "EEE d MMM") : "No date"
  const subjectSummary = selectedSubjects.length > 0
    ? selectedSubjects.map((subject) => subject.shortCode).join(", ")
    : "Subjects required"

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

  const buildSubmitData = (nextStatus = status) => {
    const durationMinutes = Number.parseInt(duration, 10)
    if (!title.trim() || !startDate || subjectIds.length === 0 || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return null

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(startDate)
    start.setHours(hours, minutes, 0, 0)
    const end = addMinutes(start, durationMinutes)

    const topics = topicsInput
      .split(",")
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0)

    return {
      id: session?.id,
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
      completedAt: nextStatus === "completed" ? (session?.completedAt ?? new Date().toISOString()) : undefined,
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const data = buildSubmitData()
    if (!data) return
    onSubmit(data)
    if (!isEdit) onOpenChange(false)
  }

  const handleCompleteAndReview = () => {
    setStatus("completed")
    const data = buildSubmitData("completed")
    if (!data) return
    onSubmit(data)
    onOpenChange(false)
  }

  const handleStartSession = () => {
    setStatus("in-progress")
    const data = buildSubmitData("in-progress")
    if (!data) return
    onSubmit(data)
    onOpenChange(false)
  }

  const handleDelete = () => {
    if (session && onDelete) {
      setIsDeleting(true)
      onDelete(session.id)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,54rem)] w-[calc(100vw-1rem)] max-w-5xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pr-14 pt-5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle>{isEdit ? "Edit Study Session" : "Plan Study Session"}</DialogTitle>
              <DialogDescription className="mt-1">
                {activeProject ? activeProject.name : "No assessment attached"} · {subjectSummary}
              </DialogDescription>
            </div>
            {isEdit && (
              <span
                className={cn(
                  "rounded-md border px-2 py-1 text-micro font-semibold uppercase",
                  status === "completed"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                    : status === "in-progress"
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border/70 bg-muted text-muted-foreground"
                )}
              >
                {status.replace("-", " ")}
              </span>
            )}
          </div>
          <div className="mt-4 flex min-w-0 flex-wrap gap-1.5 text-micro text-muted-foreground">
            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/65 px-2 py-1">
              <CalendarDays className="h-3 w-3" />
              <span className="truncate">{selectedDateLabel}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/65 px-2 py-1 tabular-nums">
              <Clock className="h-3 w-3" />
              {startTime}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/65 px-2 py-1 tabular-nums">
              <Timer className="h-3 w-3" />
              {Number.isFinite(durationMinutes) && durationMinutes > 0 ? `${durationMinutes} min` : "Duration"}
            </span>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
              <div className="grid content-start gap-5">
                <section className="grid gap-3">
                  <FormField
                    label="Session title"
                    labelClassName={fieldLabelClass}
                    labelAccessory={
                      <span className="text-micro font-medium uppercase tracking-normal text-muted-foreground/70">
                        Required
                      </span>
                    }
                  >
                    <Input
                      placeholder="e.g. Review Unit 3 notes"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      required
                      className="h-11 rounded-lg bg-background/65 text-base dark:bg-input/30"
                    />
                  </FormField>
                </section>

                <FormSection
                  title="Schedule"
                  icon={<CalendarDays className={sectionIconClass} />}
                  className={panelClass}
                >
                  <div className="grid gap-3 sm:grid-cols-[1.2fr_0.9fr_0.9fr]">
                    <DatePickerField
                      label="Date"
                      date={startDate}
                      onDateChange={setStartDate}
                      buttonClassName={inputClass}
                      labelClassName={fieldLabelClass}
                    />

                    <FormField label="Start" labelClassName={fieldLabelClass}>
                      <div className={inputWithIconClass}>
                        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <input
                          type="time"
                          value={startTime}
                          onChange={(event) => setStartTime(event.target.value)}
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        />
                      </div>
                    </FormField>

                    <FormField label="Duration" labelClassName={fieldLabelClass}>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={duration}
                        onChange={(event) => setDuration(event.target.value)}
                        placeholder="60"
                        className={inputClass}
                      />
                    </FormField>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATION_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDuration(option)}
                        aria-pressed={duration === option}
                        className={cn(
                          "h-7 rounded-md border px-2 text-micro font-medium transition-colors",
                          duration === option
                            ? "border-primary/35 bg-primary/10 text-primary"
                            : "border-border/70 bg-background/45 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        {option}m
                      </button>
                    ))}
                  </div>
                </FormSection>

                <FormSection
                  title="Assessment"
                  icon={<BookOpen className={sectionIconClass} />}
                  className={panelClass}
                >
                  <div className={cn("grid gap-3", isEdit && "sm:grid-cols-2")}>
                    <SelectField
                      label="Assessment link"
                      labelClassName={fieldLabelClass}
                      value={projectId}
                      onChange={(event) => handleProjectChange(event.target.value)}
                    >
                      <option value="">No assessment</option>
                      {projects.filter((project) => !project.isArchived).map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.icon} {project.name}
                        </option>
                      ))}
                    </SelectField>
                    {isEdit && (
                      <SelectField
                        label="Status"
                        labelClassName={fieldLabelClass}
                        value={status}
                        onChange={(event) => setStatus(event.target.value as StudySessionStatus)}
                      >
                        <option value="planned">Planned</option>
                        <option value="in-progress">In progress</option>
                        <option value="completed">Completed</option>
                      </SelectField>
                    )}
                  </div>
                </FormSection>

                <FormSection
                  title="Context"
                  icon={<FileText className={sectionIconClass} />}
                  className={panelClass}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Description" labelClassName={fieldLabelClass}>
                      <Input
                        placeholder={isEdit ? "What did you achieve?" : "What do you want to achieve?"}
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        className={inputClass}
                      />
                    </FormField>
                    <FormField label="Topics" labelClassName={fieldLabelClass}>
                      <Input
                        placeholder="Photosynthesis, exam Q4"
                        value={topicsInput}
                        onChange={(event) => setTopicsInput(event.target.value)}
                        className={inputClass}
                      />
                    </FormField>
                  </div>
                  <FormField label="Notes" labelClassName={fieldLabelClass}>
                    <textarea
                      placeholder="Key concepts, resources, reminders, or follow-up work."
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={4}
                      className={textareaClass}
                    />
                  </FormField>
                </FormSection>
              </div>

              <div className="grid content-start gap-5">
                <FormSection
                  title="Subjects"
                  icon={<ListChecks className={sectionIconClass} />}
                  className={panelClass}
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {subjectIds.length > 0 ? `${subjectIds.length} selected` : "Choose at least one"}
                    </p>
                    {subjectIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSubjectIds([])}
                        className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {selectedSubjects.length > 0 && (
                    <div className="flex max-w-full flex-wrap gap-1.5">
                      {selectedSubjects.map((subject) => (
                        <span
                          key={subject.id}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs font-medium"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: subject.color }}
                          />
                          <span className="truncate">{subject.shortCode}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="max-h-[18rem] overflow-y-auto rounded-lg border border-input bg-background/45 p-2 dark:bg-input/20">
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-1.5">
                      {subjects.map((subject) => {
                        const selected = subjectIds.includes(subject.id)

                        return (
                          <label
                            key={subject.id}
                            className={cn(
                              "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                              selected
                                ? "border-primary/35 bg-primary/10 text-foreground"
                                : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            )}
                          >
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleSubject(subject.id)}
                            />
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: subject.color }}
                            />
                            <span className="min-w-0 truncate">
                              {subject.icon} {subject.name}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  {subjectIds.length === 0 && (
                    <p className="text-xs text-destructive">Subjects are required for study sessions.</p>
                  )}
                </FormSection>

                {isEdit && (
                  <FormSection
                    title="Review"
                    icon={<CheckCircle2 className={sectionIconClass} />}
                    className={panelClass}
                  >
                    <FormField label="Confidence" labelClassName={fieldLabelClass}>
                      <div className="grid grid-cols-5 gap-1.5">
                        {([1, 2, 3, 4, 5] as ConfidenceScore[]).map((score) => (
                          <button
                            key={score}
                            type="button"
                            onClick={() => setConfidence(score)}
                            aria-pressed={confidence === score}
                            className={cn(
                              "h-9 rounded-lg border text-xs font-medium transition-colors",
                              confidence === score
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/70 bg-background/45 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            )}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </FormField>

                    <div className="grid gap-3">
                      <FormField label="Blockers" labelClassName={fieldLabelClass}>
                        <textarea
                          placeholder="What still feels unclear?"
                          value={blockers}
                          onChange={(event) => setBlockers(event.target.value)}
                          rows={3}
                          className={textareaClass}
                        />
                      </FormField>
                      <FormField label="Next action" labelClassName={fieldLabelClass}>
                        <textarea
                          placeholder="e.g. redo exam Q4"
                          value={nextAction}
                          onChange={(event) => setNextAction(event.target.value)}
                          rows={3}
                          className={textareaClass}
                        />
                      </FormField>
                    </div>
                  </FormSection>
                )}
              </div>
            </div>
          </div>

          <DialogFooter
            className={cn(
              "m-0 shrink-0 rounded-none px-5 py-3",
              isEdit && onDelete ? "gap-3 sm:justify-between" : "sm:justify-end"
            )}
          >
            {isEdit && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isDeleting}
                className="w-full gap-1.5 sm:w-auto"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              {isEdit && status === "planned" && (
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
              {isEdit && status !== "completed" && (
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
                {isEdit ? "Save Changes" : "Create Session"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
