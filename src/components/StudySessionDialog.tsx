import { useEffect, useMemo, useRef, useState } from "react"
import { addMinutes, format, parseISO } from "date-fns"
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  ListChecks,
  PlayCircle,
  Plus,
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
const REST_OPTIONS = ["5", "10", "15", "30"]
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
    activeDurations?: { start: string; end: string }[]
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
  const [endTimeMode, setEndTimeMode] = useState<"duration" | "end">(() => {
    // If a session is being edited with an end time, start in end-time mode (matches EventForm)
    if (session?.endTime) return "end"
    return "duration"
  })
  const [explicitEndTime, setExplicitEndTime] = useState<string>(() => {
    if (session?.endTime) return format(parseISO(session.endTime), "HH:mm")
    return ""
  })
  const [isDeleting, setIsDeleting] = useState(false)
  const [restDuration, setRestDuration] = useState("5")
  const [segments, setSegments] = useState<{ start: string; end: string }[]>([])
  const hasSegments = segments.length > 0
  const computedSegmentStart = hasSegments ? segments[0].start : null
  const computedSegmentEnd = hasSegments ? segments[segments.length - 1].end : null
  const getMinutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m }
  const formatDurationStr = (totalMin: number) =>
    totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m`
  const segmentTotalActive = hasSegments
    ? segments.reduce((sum, seg) => sum + Math.max(0, getMinutes(seg.end) - getMinutes(seg.start)), 0)
    : 0
  const segmentWallSpan = hasSegments
    ? getMinutes(computedSegmentEnd!) - getMinutes(computedSegmentStart!)
    : 0

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
  const durationMinutes = hasSegments
    ? segmentTotalActive
    : (endTimeMode === "end" && explicitEndTime
      ? (() => {
          const [sh, sm] = startTime.split(":").map(Number)
          const [eh, em] = explicitEndTime.split(":").map(Number)
          return (eh * 60 + em) - (sh * 60 + sm)
        })()
      : Number.parseInt(duration, 10))
  const canSave = title.trim().length > 0
    && subjectIds.length > 0
    && Boolean(startDate)
    && Number.isFinite(durationMinutes)
    && durationMinutes > 0
    && (!hasSegments || (Number.isFinite(segmentTotalActive) && segmentTotalActive > 0))
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
      setExplicitEndTime(format(parseISO(session.endTime), "HH:mm"))
      setEndTimeMode("end")

      // Initialize editable segments from activeDurations
      if (session.activeDurations && session.activeDurations.length > 0) {
        setSegments(
          session.activeDurations
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
            .map((d) => ({
              start: format(parseISO(d.start), "HH:mm"),
              end: format(parseISO(d.end), "HH:mm"),
            })),
        )
      } else {
        setSegments([])
      }
    }
  }, [projects, session])

  const addSegment = () => {
    setSegments((prev) => {
      const lastEnd = prev.length > 0 ? prev[prev.length - 1].end : "09:00"
      const [h, m] = lastEnd.split(":").map(Number)
      const restMin = Number.parseInt(restDuration, 10) || 5
      const nextStart = new Date(0, 0, 0, h, m + restMin)
      const nextEnd = new Date(nextStart.getTime() + 30 * 60000)
      const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      return [...prev, { start: fmt(nextStart), end: fmt(nextEnd) }]
    })
  }

  const removeSegment = (index: number) => {
    setSegments((prev) => prev.filter((_, i) => i !== index))
  }

  const updateSegment = (index: number, field: "start" | "end", value: string) => {
    setSegments((prev) => prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg)))
  }

  const clearSegments = () => {
    setSegments([])
    // Reset start/duration from overall session time
    if (session) {
      const start = parseISO(session.startTime)
      setStartTime(format(start, "HH:mm"))
      const startMs = new Date(session.startTime).getTime()
      const endMs = new Date(session.endTime).getTime()
      setDuration(String(Math.round((endMs - startMs) / (1000 * 60))))
      setExplicitEndTime(format(parseISO(session.endTime), "HH:mm"))
      setEndTimeMode("end")
    }
  }

  const startSegmentMode = () => {
    const [sh, sm] = startTime.split(":").map(Number)
    const mins = endTimeMode === "end" && explicitEndTime
      ? (() => {
          const [eh, em] = explicitEndTime.split(":").map(Number)
          return (eh * 60 + em) - (sh * 60 + sm)
        })()
      : Number.parseInt(duration, 10) || 60
    if (mins <= 0) return
    const start = new Date(0, 0, 0, sh, sm)
    const end = new Date(start.getTime() + mins * 60000)
    const fmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    setSegments([{ start: fmt(start), end: fmt(end) }])
  }

  /** Compute an end time (HH:mm) from current start time + duration, preserving the user's preference when toggling modes. */
  const computeEndTimeFromCurrent = () => {
    const [sh, sm] = startTime.split(":").map(Number)
    const d = new Date(startDate ?? new Date())
    d.setHours(sh, sm, 0, 0)
    const minutes = Number.parseInt(duration, 10)
    d.setMinutes(d.getMinutes() + (Number.isFinite(minutes) && minutes > 0 ? minutes : 60))
    return format(d, "HH:mm")
  }

  /** Compute a duration (minutes, as a string) from current start time + explicit end time. */
  const computeDurationFromCurrent = () => {
    if (!explicitEndTime) return
    const [sh, sm] = startTime.split(":").map(Number)
    const [eh, em] = explicitEndTime.split(":").map(Number)
    const delta = (eh * 60 + em) - (sh * 60 + sm)
    if (delta > 0) setDuration(String(delta))
  }

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
    if (!title.trim() || !startDate || subjectIds.length === 0) return null

    const topics = topicsInput
      .split(",")
      .map((topic) => topic.trim())
      .filter((topic) => topic.length > 0)

    if (hasSegments) {
      const toDate = (time: string) => {
        const [h, m] = time.split(":").map(Number)
        const d = new Date(startDate)
        d.setHours(h, m, 0, 0)
        return d
      }
      const segStart = toDate(segments[0].start)
      const segEnd = toDate(segments[segments.length - 1].end)
      if (segEnd.getTime() <= segStart.getTime()) return null
      if (!Number.isFinite(segmentTotalActive) || segmentTotalActive <= 0) return null

      const activeDurations = segments.map((seg) => ({
        start: toDate(seg.start).toISOString(),
        end: toDate(seg.end).toISOString(),
      }))

      return {
        id: session?.id,
        projectId: projectId || undefined,
        subjectIds,
        title: title.trim(),
        description: description.trim() ? description : undefined,
        startTime: segStart.toISOString(),
        endTime: segEnd.toISOString(),
        activeDurations,
        topics: topics.length > 0 ? topics : undefined,
        notes: notes.trim() ? notes : undefined,
        status: nextStatus,
        confidence,
        blockers: blockers.trim() ? blockers : undefined,
        nextAction: nextAction.trim() ? nextAction : undefined,
        completedAt: nextStatus === "completed" ? (session?.completedAt ?? new Date().toISOString()) : undefined,
      }
    }

    const [hours, minutes] = startTime.split(":").map(Number)
    const start = new Date(startDate)
    start.setHours(hours, minutes, 0, 0)

    let end: Date
    if (endTimeMode === "end" && explicitEndTime) {
      const [eh, em] = explicitEndTime.split(":").map(Number)
      end = new Date(startDate)
      end.setHours(eh, em, 0, 0)
      if (end <= start) return null
    } else {
      const durationMinutes = Number.parseInt(duration, 10)
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null
      end = addMinutes(start, durationMinutes)
    }

    return {
      id: session?.id,
      projectId: projectId || undefined,
      subjectIds,
      title: title.trim(),
      description: description.trim() ? description : undefined,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      activeDurations: undefined,
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
      <DialogContent className="flex h-[min(92dvh,54rem)] w-[calc(100vw-1rem)] max-w-7xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-5xl">
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
              {hasSegments
                ? `${computedSegmentStart} – ${computedSegmentEnd}`
                : endTimeMode === "end" && explicitEndTime
                  ? `${startTime} – ${explicitEndTime}`
                  : startTime}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/65 px-2 py-1 tabular-nums">
              <Timer className="h-3 w-3" />
              {hasSegments
                ? `${formatDurationStr(segmentTotalActive)} active`
                : Number.isFinite(durationMinutes) && durationMinutes > 0 ? `${durationMinutes} min` : "Duration"}
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

                    {hasSegments ? (
                      <>
                        <FormField label="Span" labelClassName={fieldLabelClass}>
                          <div className={cn(inputWithIconClass, "text-sm")}>
                            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="tabular-nums">
                              {computedSegmentStart} – {computedSegmentEnd}
                            </span>
                          </div>
                        </FormField>
                        <FormField label="Active time" labelClassName={fieldLabelClass}>
                          <div className={cn(inputWithIconClass, "text-sm")}>
                            <Timer className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="tabular-nums font-medium">
                              {formatDurationStr(segmentTotalActive)}
                            </span>
                            <span className="text-muted-foreground/60 ml-auto text-micro">
                              {segmentWallSpan > segmentTotalActive ? formatDurationStr(segmentWallSpan) + " span" : ""}
                            </span>
                          </div>
                        </FormField>
                      </>
                    ) : (
                      <>
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
                        <FormField
                          label={endTimeMode === "end" ? "End time" : "Duration"}
                          labelClassName={fieldLabelClass}
                          labelAccessory={
                            <button
                              type="button"
                              onClick={() => {
                                if (endTimeMode === "end") {
                                  computeDurationFromCurrent()
                                  setEndTimeMode("duration")
                                } else {
                                  setExplicitEndTime(computeEndTimeFromCurrent())
                                  setEndTimeMode("end")
                                }
                              }}
                              className="cursor-pointer text-micro font-medium uppercase tracking-normal transition-colors text-muted-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm px-0.5 -mx-0.5"
                            >
                              {endTimeMode === "end" ? "Use duration" : "Use end time"}
                            </button>
                          }
                        >
                          {endTimeMode === "end" ? (
                            <div className={inputWithIconClass}>
                              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <input
                                type="time"
                                value={explicitEndTime}
                                onChange={(e) => setExplicitEndTime(e.target.value)}
                                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                              />
                            </div>
                          ) : (
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={duration}
                              onChange={(event) => setDuration(event.target.value)}
                              placeholder="60"
                              className={inputClass}
                            />
                          )}
                        </FormField>
                      </>
                    )}
                  </div>
                  {!hasSegments && endTimeMode === "duration" && (
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
                  )}
                  {!hasSegments && (
                    <button
                      type="button"
                      onClick={startSegmentMode}
                      className="flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Timer className="h-3 w-3" />
                      Use study blocks
                    </button>
                  )}
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
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-input bg-background/45 p-2 dark:bg-input/20">
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

                {hasSegments && (() => {
                  let totalRest = 0
                  const segDuration = (start: string, end: string) => Math.max(0, getMinutes(end) - getMinutes(start))
                  return (
                    <FormSection
                      title="Study Blocks"
                      icon={<Timer className={sectionIconClass} />}
                      className={panelClass}
                    >
                      <div className="space-y-2">
                        {segmentWallSpan > 0 && (
                          <TimelineBar
                            segments={segments}
                            segmentWallSpan={segmentWallSpan}
                            computedSegmentStart={computedSegmentStart!}
                            computedSegmentEnd={computedSegmentEnd!}
                            onUpdateSegment={updateSegment}
                          />
                        )}
                        {(() => {
                          const sorted = segments
                            .map((seg, idx) => ({ seg, idx }))
                            .sort((a, b) => getMinutes(a.seg.start) - getMinutes(b.seg.start))
                          return sorted.map(({ seg, idx }, i) => {
                            const activeMin = segDuration(seg.start, seg.end)
                            let restMin = 0
                            if (i > 0) {
                              restMin = Math.max(0, getMinutes(seg.start) - getMinutes(sorted[i - 1].seg.end))
                              totalRest += restMin
                            }
                            return (
                              <div key={idx}>
                                {i > 0 && (
                                  <div className="flex items-center gap-2 py-1 px-1">
                                    <div className="flex-1 border-t border-border/30" />
                                    <span className="text-micro text-muted-foreground/50">
                                      Rest {formatDurationStr(restMin)}
                                    </span>
                                    <div className="flex-1 border-t border-border/30" />
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 rounded-lg bg-primary/8 p-1.5">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-caption font-bold bg-primary/12 text-primary">
                                    A{idx + 1}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="time"
                                      value={seg.start}
                                      onChange={(e) => updateSegment(idx, "start", e.target.value)}
                                      className="h-7 w-22 rounded-md border border-input bg-background/65 px-2 text-xs tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                    />
                                    <span className="text-micro text-muted-foreground/60">to</span>
                                    <input
                                      type="time"
                                      value={seg.end}
                                      onChange={(e) => updateSegment(idx, "end", e.target.value)}
                                      className="h-7 w-22 rounded-md border border-input bg-background/65 px-2 text-xs tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                                    />
                                  </div>
                                  <span className="ml-auto text-xs tabular-nums font-medium text-foreground/80">
                                    {formatDurationStr(activeMin)}
                                  </span>
                                  {segments.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeSegment(idx)}
                                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                      aria-label={`Remove block ${idx + 1}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>

                      <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-micro font-medium text-muted-foreground/60">Rest:</span>
                          {REST_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setRestDuration(opt)}
                              aria-pressed={restDuration === opt}
                              className={cn(
                                "h-6 rounded-md border px-2 text-micro font-medium transition-colors",
                                restDuration === opt
                                  ? "border-primary/35 bg-primary/10 text-primary"
                                  : "border-border/70 bg-background/45 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                              )}
                            >
                              {opt}m
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={addSegment}
                            className="flex items-center gap-1 rounded-lg border border-dashed border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                          >
                            <Plus className="h-3 w-3" />
                            Add block
                          </button>
                          <button
                            type="button"
                            onClick={clearSegments}
                            className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Simplify
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs text-muted-foreground">
                        <span>Active: <span className="font-semibold text-foreground tabular-nums">{formatDurationStr(segmentTotalActive)}</span></span>
                        <span>Rest: <span className="font-semibold text-foreground tabular-nums">{formatDurationStr(totalRest)}</span></span>
                        <span>Span: <span className="font-semibold text-foreground tabular-nums">{formatDurationStr(segmentWallSpan)}</span></span>
                      </div>
                    </FormSection>
                  )
                })()}
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
function TimelineBar({
  segments,
  segmentWallSpan,
  computedSegmentStart,
  computedSegmentEnd,
  onUpdateSegment,
}: {
  segments: { start: string; end: string }[]
  segmentWallSpan: number
  computedSegmentStart: string
  computedSegmentEnd: string
  onUpdateSegment: (index: number, field: 'start' | 'end', value: string) => void
}) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    mode: 'resize' | 'move'
    startX: number
    origSegments: { start: string; end: string }[]
    barWidth: number
    wallSpan: number
    onUpdate: (index: number, field: 'start' | 'end', value: string) => void
    origIdx: number
    edge?: 'start' | 'end'
    origValue?: string
    origStart?: string
    origEnd?: string
  } | null>(null)
  const getMinutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m }
  const formatDurationStr = (totalMin: number) =>
    totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m`
  // Sort segments by start time and track original indices
  const sorted = useMemo(() => {
    return segments
      .map((seg, idx) => ({ seg, idx }))
      .sort((a, b) => getMinutes(a.seg.start) - getMinutes(b.seg.start))
  }, [segments])
  const startDrag = (
    e: React.MouseEvent,
    mode: 'resize' | 'move',
    origIdx: number,
    edge?: 'start' | 'end',
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (!timelineRef.current) return
    const seg = segments[origIdx]
    if (!seg) return
    dragRef.current = {
      mode,
      startX: e.clientX,
      origSegments: segments.map((s) => ({ ...s })),
      barWidth: timelineRef.current.clientWidth,
      wallSpan: segmentWallSpan,
      onUpdate: onUpdateSegment,
      origIdx,
      ...(mode === 'resize' && edge
        ? { edge, origValue: seg[edge] }
        : { origStart: seg.start, origEnd: seg.end }),
    }
  }
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      const deltaX = e.clientX - d.startX
      const scale = d.barWidth > 0 && d.wallSpan > 0 ? d.wallSpan / d.barWidth : 0
      const deltaMinutes = Math.round(deltaX * scale)
      if (d.mode === 'resize') {
        const [origH, origM] = d.origValue!.split(':').map(Number)
        let newMin = origH * 60 + origM + deltaMinutes
        if (d.edge === 'start') {
          const endMin = getMinutes(d.origSegments[d.origIdx].end)
          const minBound = d.origIdx > 0 ? getMinutes(d.origSegments[d.origIdx - 1].end) : 0
          newMin = Math.max(minBound, Math.min(newMin, endMin - 1))
        } else {
          const startMin = getMinutes(d.origSegments[d.origIdx].start)
          const maxBound = d.origIdx < d.origSegments.length - 1
            ? getMinutes(d.origSegments[d.origIdx + 1].start)
            : 24 * 60
          newMin = Math.max(startMin + 1, Math.min(newMin, maxBound))
        }
        newMin = Math.max(0, newMin)
        const h = Math.floor(newMin / 60) % 24
        const m = newMin % 60
        d.onUpdate(d.origIdx, d.edge!, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      } else {
        const origStartMin = getMinutes(d.origStart!)
        const origEndMin = getMinutes(d.origEnd!)
        const dur = origEndMin - origStartMin
        let newStart = origStartMin + deltaMinutes
        if (d.origIdx > 0) {
          newStart = Math.max(newStart, getMinutes(d.origSegments[d.origIdx - 1].end))
        }
        if (d.origIdx < d.origSegments.length - 1) {
          newStart = Math.min(newStart, getMinutes(d.origSegments[d.origIdx + 1].start) - dur)
        }
        newStart = Math.max(0, newStart)
        const newEnd = newStart + dur
        const fmt = (min: number) => {
          const hh = Math.floor(min / 60) % 24
          const mm = min % 60
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
        }
        d.onUpdate(d.origIdx, 'start', fmt(newStart))
        d.onUpdate(d.origIdx, 'end', fmt(newEnd))
      }
    }
    const handleMouseUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])
  const wallStartMin = getMinutes(computedSegmentStart)
  const slices: { type: 'active' | 'rest'; leftPct: number; widthPct: number; minutes: number; sortedIdx: number; origIdx: number }[] = []
  for (let i = 0; i < sorted.length; i++) {
    const { seg, idx } = sorted[i]
    const segStartMin = getMinutes(seg.start)
    const segEndMin = getMinutes(seg.end)
    if (i > 0) {
      const prevEndMin = getMinutes(sorted[i - 1].seg.end)
      const restMin = Math.max(0, segStartMin - prevEndMin)
      if (restMin > 0) {
        slices.push({
          type: 'rest',
          leftPct: ((prevEndMin - wallStartMin) / segmentWallSpan) * 100,
          widthPct: (restMin / segmentWallSpan) * 100,
          minutes: restMin,
          sortedIdx: i,
          origIdx: -1,
        })
      }
    }
    const activeMin = Math.max(0, segEndMin - segStartMin)
    slices.push({
      type: 'active',
      leftPct: ((segStartMin - wallStartMin) / segmentWallSpan) * 100,
      widthPct: (activeMin / segmentWallSpan) * 100,
      minutes: activeMin,
      sortedIdx: i,
      origIdx: idx,
    })
  }
  return (
    <div className="space-y-0.5">
      <div
        ref={timelineRef}
        className="relative h-7 rounded-md bg-muted/20 overflow-hidden border border-border/30 select-none"
      >
        {slices.map((slice, i) => (
          <div
            key={i}
            className={cn(
              "absolute top-0 h-full",
              slice.type === 'active'
                ? 'bg-primary/25'
                : '',
              slice.type === 'active' && 'cursor-grab active:cursor-grabbing',
            )}
            style={{
              left: `${slice.leftPct}%`,
              width: `${Math.max(slice.widthPct, 0.5)}%`,
            }}
            title={slice.type === 'active'
              ? formatDurationStr(slice.minutes)
              : `Rest ${formatDurationStr(slice.minutes)}`
            }
            onMouseDown={slice.type === 'active'
              ? (e) => startDrag(e, 'move', slice.origIdx)
              : undefined
            }
          >
            {slice.type === 'active' && (
              <>
                <div
                  className="absolute top-0 -left-1.5 w-3 h-full cursor-ew-resize flex items-center justify-center group/handle z-10"
                  onMouseDown={(e) => startDrag(e, 'resize', slice.origIdx, 'start')}
                >
                  <div className="w-2 h-5 rounded-full bg-primary/60 opacity-0 group-hover/handle:opacity-100 transition-opacity shadow-sm" />
                </div>
                <div
                  className="absolute top-0 -right-1.5 w-3 h-full cursor-ew-resize flex items-center justify-center group/handle z-10"
                  onMouseDown={(e) => startDrag(e, 'resize', slice.origIdx, 'end')}
                >
                  <div className="w-2 h-5 rounded-full bg-primary/60 opacity-0 group-hover/handle:opacity-100 transition-opacity shadow-sm" />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground/50 tabular-nums">
        <span>{computedSegmentStart}</span>
        <span>{computedSegmentEnd}</span>
      </div>
    </div>
  )
}
