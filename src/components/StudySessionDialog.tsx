import { useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DatePickerField, FormField, SelectField } from "@/components/ui/form-controls"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import TimePicker from "@/components/ui/time-picker"
import { cn, getSessionSubjectIds, getSubjectById } from "@/lib/utils"
import {
  VCE_SUBJECTS,
  type ConfidenceScore,
  type Project,
  type StudySession,
  type StudySessionStatus,
  type Subject,
} from "@/lib/types"

interface StudyBlock {
  start: string
  end: string
}

const DEFAULT_BLOCK: StudyBlock = { start: "14:00", end: "15:00" }
const fieldLabelClass = "text-control font-medium text-muted-foreground"
const inputClass = "h-10 rounded-lg bg-background/65 dark:bg-input/30"

function getMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

function sortBlocks(blocks: StudyBlock[]) {
  return [...blocks].sort((a, b) => getMinutes(a.start) - getMinutes(b.start))
}

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
  onPlanAgain?: (session: StudySession) => void | Promise<void>
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
  onPlanAgain,
}: StudySessionDialogProps) {
  const [projectId, setProjectId] = useState("")
  const [subjectIds, setSubjectIds] = useState<string[]>([])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [notes, setNotes] = useState("")
  const [status, setStatus] = useState<StudySessionStatus>("planned")
  const [confidence, setConfidence] = useState<ConfidenceScore>()
  const [blockers, setBlockers] = useState("")
  const [nextAction, setNextAction] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(
    () => initialDate ? new Date(initialDate) : new Date(),
  )
  const [isDeleting, setIsDeleting] = useState(false)
  const [segments, setSegments] = useState<StudyBlock[]>(() => {
    if (!initialDate || (initialDate.getHours() === 0 && initialDate.getMinutes() === 0)) {
      return [DEFAULT_BLOCK]
    }
    const start = initialDate.getHours() * 60 + initialDate.getMinutes()
    return [{ start: formatTime(start), end: formatTime(Math.min(start + 60, 23 * 60 + 59)) }]
  })

  const isEdit = Boolean(session)
  const activeProject = projects.find((project) => project.id === projectId)
  const baseSubjects = availableSubjects ?? [...VCE_SUBJECTS, ...customSubjects]
  const hiddenSelectedSubjects = subjectIds
    .map((id) => getSubjectById(id))
    .filter((subject): subject is Subject =>
      Boolean(subject) && !baseSubjects.some((item) => item.id === subject?.id),
    )
  const subjects = [...hiddenSelectedSubjects, ...baseSubjects]
  const selectedSubjects = subjects.filter((subject) => subjectIds.includes(subject.id))
  const orderedSegments = useMemo(() => sortBlocks(segments), [segments])
  const segmentTotalActive = orderedSegments.reduce(
    (sum, block) => sum + Math.max(0, getMinutes(block.end) - getMinutes(block.start)),
    0,
  )
  const scheduleStart = orderedSegments[0]?.start
  const scheduleEnd = orderedSegments[orderedSegments.length - 1]?.end
  const scheduleSpan = scheduleStart && scheduleEnd
    ? Math.max(0, getMinutes(scheduleEnd) - getMinutes(scheduleStart))
    : 0
  const totalRest = Math.max(0, scheduleSpan - segmentTotalActive)
  const scheduleIsValid = orderedSegments.length > 0
    && orderedSegments.every((block) => getMinutes(block.end) > getMinutes(block.start))
    && orderedSegments.every(
      (block, index) => index === 0 || getMinutes(block.start) >= getMinutes(orderedSegments[index - 1].end),
    )
  const canAddBlock = orderedSegments.length > 0
    && scheduleIsValid
    && getMinutes(orderedSegments[orderedSegments.length - 1].end) <= 23 * 60 + 24
  const canSave = title.trim().length > 0
    && subjectIds.length > 0
    && Boolean(startDate)
    && scheduleIsValid
  const subjectSummary = selectedSubjects.length === 0
    ? "Choose subject"
    : selectedSubjects.map((subject) => subject.shortCode).join(", ")

  useEffect(() => {
    if (!session) return
    const project = projects.find((item) => item.id === session.projectId)
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

    const scheduledBlocks = session.schedule.blocks.length > 0
      ? session.schedule.blocks
      : [{ start: session.startTime, end: session.endTime }]
    setStartDate(parseISO(scheduledBlocks[0].start))
    setSegments(scheduledBlocks.map((block) => ({
      start: format(parseISO(block.start), "HH:mm"),
      end: format(parseISO(block.end), "HH:mm"),
    })))
  }, [projects, session])

  const toggleSubject = (id: string) => {
    setSubjectIds((current) =>
      current.includes(id)
        ? current.filter((subjectId) => subjectId !== id)
        : [...current, id],
    )
  }

  const handleProjectChange = (id: string) => {
    setProjectId(id)
    const project = projects.find((item) => item.id === id)
    if (project?.subjectId) {
      setSubjectIds((current) =>
        current.includes(project.subjectId!) ? current : [...current, project.subjectId!],
      )
    }
  }

  const updateSegment = (index: number, field: keyof StudyBlock, value: string) => {
    setSegments((current) =>
      current.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, [field]: value } : segment,
      ),
    )
  }

  const addSegment = () => {
    // ponytail: fixed 5m breaks keep this one-click; edit the next start time for a custom gap.
    const lastEnd = getMinutes(orderedSegments[orderedSegments.length - 1].end)
    const start = lastEnd + 5
    setSegments((current) => [
      ...current,
      { start: formatTime(start), end: formatTime(start + 30) },
    ])
  }

  const removeSegment = (index: number) => {
    setSegments((current) => current.filter((_, segmentIndex) => segmentIndex !== index))
  }

  const buildSubmitData = (nextStatus = status) => {
    if (!title.trim() || !startDate || subjectIds.length === 0 || !scheduleIsValid) return null

    const toDate = (time: string) => {
      const date = new Date(startDate)
      const [hours, minutes] = time.split(":").map(Number)
      date.setHours(hours, minutes, 0, 0)
      return date
    }
    const activeDurations = orderedSegments.map((segment) => ({
      start: toDate(segment.start).toISOString(),
      end: toDate(segment.end).toISOString(),
    }))
    const topics = topicsInput.split(",").map((topic) => topic.trim()).filter(Boolean)

    return {
      id: session?.id,
      projectId: projectId || undefined,
      subjectIds,
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: activeDurations[0].start,
      endTime: activeDurations[activeDurations.length - 1].end,
      activeDurations,
      topics: topics.length > 0 ? topics : undefined,
      notes: notes.trim() || undefined,
      status: nextStatus,
      confidence,
      blockers: blockers.trim() || undefined,
      nextAction: nextAction.trim() || undefined,
      completedAt: nextStatus === "completed"
        ? (session?.completedAt ?? new Date().toISOString())
        : undefined,
    }
  }

  const save = (nextStatus = status) => {
    const data = buildSubmitData(nextStatus)
    if (!data) return
    onSubmit(data)
    onOpenChange(false)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    save()
  }

  const handleDelete = () => {
    if (!session || !onDelete) return
    setIsDeleting(true)
    onDelete(session.id)
    onOpenChange(false)
  }

  const handlePlanAgain = () => {
    if (!session || !onPlanAgain) return
    void onPlanAgain(session)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,48rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pr-14 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{isEdit ? "Edit study session" : "Plan study session"}</DialogTitle>
              <DialogDescription className="mt-1">
                {isEdit ? "Adjust the plan, then save." : "Set the focus and time. Everything else is optional."}
              </DialogDescription>
            </div>
            {isEdit && (
              <span className={cn(
                "rounded-full border px-2.5 py-1 text-micro font-semibold uppercase",
                status === "completed"
                  ? "border-success/30 bg-success/15 text-success"
                  : status === "in-progress"
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/70 bg-muted text-muted-foreground",
              )}>
                {status.replace("-", " ")}
              </span>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-5 p-5">
              <FormField label="What will you work on?" labelClassName={fieldLabelClass}>
                <Input
                  autoFocus
                  placeholder="e.g. Review Unit 3 notes"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-11 rounded-lg bg-background/65 text-base dark:bg-input/30"
                  required
                />
              </FormField>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Subject" labelClassName={fieldLabelClass}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        aria-invalid={subjectIds.length === 0}
                        className={cn(inputClass, "justify-between px-3 font-normal")}
                      >
                        <span className={cn("truncate", subjectIds.length === 0 && "text-muted-foreground")}>
                          {subjectSummary}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-2">
                      <p className="px-2 pb-2 text-xs text-muted-foreground">
                        Select one or more subjects
                      </p>
                      <ScrollArea className="max-h-64">
                        <div className="grid gap-1 pr-2">
                          {subjects.map((subject) => {
                            const selected = subjectIds.includes(subject.id)
                            return (
                              <label
                                key={subject.id}
                                className={cn(
                                  "flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                                  selected && "bg-primary/10",
                                )}
                              >
                                <Checkbox
                                  checked={selected}
                                  onCheckedChange={() => toggleSubject(subject.id)}
                                />
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: subject.color }}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {subject.icon} {subject.name}
                                </span>
                                {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                              </label>
                            )
                          })}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </FormField>

                <DatePickerField
                  label="Date"
                  date={startDate}
                  onDateChange={setStartDate}
                  buttonClassName={inputClass}
                  labelClassName={fieldLabelClass}
                  formatPattern="EEE d MMM yyyy"
                />
              </div>

              <section className="grid gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 dark:border-input/70 dark:bg-input/20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <Timer className="h-4 w-4 text-primary" />
                      Timeline
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDuration(segmentTotalActive)} focus
                      {totalRest > 0 ? ` · ${formatDuration(totalRest)} break` : ""}
                    </p>
                  </div>
                  {scheduleStart && scheduleEnd && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {scheduleStart}–{scheduleEnd}
                    </span>
                  )}
                </div>

                <Timeline blocks={orderedSegments} />

                <div className="grid gap-2">
                  {segments.map((segment, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-end gap-2"
                    >
                      <TimePicker
                        label={`Block ${index + 1} start`}
                        value={segment.start}
                        onChange={(event) => updateSegment(index, "start", event.target.value)}
                        className={inputClass}
                      />
                      <span className="pb-2.5 text-xs text-muted-foreground">to</span>
                      <TimePicker
                        label={`Block ${index + 1} end`}
                        value={segment.end}
                        onChange={(event) => updateSegment(index, "end", event.target.value)}
                        className={inputClass}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSegment(index)}
                        disabled={segments.length === 1}
                        aria-label={`Remove block ${index + 1}`}
                        className="mb-0.5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {!scheduleIsValid && (
                  <p className="text-xs text-destructive">
                    Blocks must end after they start and cannot overlap.
                  </p>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSegment}
                  disabled={!canAddBlock}
                  className="justify-self-start"
                >
                  <Plus className="h-4 w-4" />
                  Add block after a 5m break
                </Button>
              </section>

              <details className="group rounded-xl border border-border/70 bg-background">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/50">
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                  More details
                  {[activeProject, description, topicsInput, notes].some(Boolean) && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">Added</span>
                  )}
                </summary>
                <div className="grid gap-4 border-t p-4">
                  <div className={cn("grid gap-3", isEdit && "sm:grid-cols-2")}>
                    <SelectField
                      label="Assessment"
                      labelClassName={fieldLabelClass}
                      value={projectId || "_none"}
                      onValueChange={(value) => handleProjectChange(value === "_none" ? "" : value)}
                      options={[
                        { value: "_none", label: "No assessment" },
                        ...projects
                          .filter((project) => !project.isArchived)
                          .map((project) => ({ value: project.id, label: `${project.icon} ${project.name}` })),
                      ]}
                    />
                    {isEdit && (
                      <SelectField
                        label="Status"
                        labelClassName={fieldLabelClass}
                        value={status}
                        onValueChange={(value) => setStatus(value as StudySessionStatus)}
                        options={[
                          { value: "planned", label: "Planned" },
                          { value: "in-progress", label: "In progress" },
                          { value: "completed", label: "Completed" },
                        ]}
                      />
                    )}
                  </div>

                  <FormField label="Goal or description" labelClassName={fieldLabelClass}>
                    <Input
                      placeholder="What should be different when this session ends?"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Topics"
                    hint="Separate topics with commas."
                    labelClassName={fieldLabelClass}
                  >
                    <Input
                      placeholder="Photosynthesis, exam question 4"
                      value={topicsInput}
                      onChange={(event) => setTopicsInput(event.target.value)}
                      className={inputClass}
                    />
                  </FormField>

                  <FormField label="Notes" labelClassName={fieldLabelClass}>
                    <Textarea
                      placeholder="Resources, reminders, or follow-up work"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      className="resize-none"
                    />
                  </FormField>

                  {isEdit && (
                    <div className="grid gap-4 border-t pt-4">
                      <FormField label="Confidence after studying" labelClassName={fieldLabelClass}>
                        <div className="flex gap-2" role="group" aria-label="Confidence score">
                          {([1, 2, 3, 4, 5] as ConfidenceScore[]).map((score) => (
                            <Button
                              key={score}
                              type="button"
                              size="sm"
                              variant={confidence === score ? "default" : "outline"}
                              onClick={() => setConfidence(confidence === score ? undefined : score)}
                              aria-pressed={confidence === score}
                              className="flex-1"
                            >
                              {score}
                            </Button>
                          ))}
                        </div>
                      </FormField>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="Blockers" labelClassName={fieldLabelClass}>
                          <Textarea
                            placeholder="What is still unclear?"
                            value={blockers}
                            onChange={(event) => setBlockers(event.target.value)}
                            rows={2}
                            className="resize-none"
                          />
                        </FormField>
                        <FormField label="Next action" labelClassName={fieldLabelClass}>
                          <Textarea
                            placeholder="e.g. redo exam question 4"
                            value={nextAction}
                            onChange={(event) => setNextAction(event.target.value)}
                            rows={2}
                            className="resize-none"
                          />
                        </FormField>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </ScrollArea>

          <DialogFooter className="m-0 shrink-0 rounded-none px-5 py-3 sm:justify-between">
            <div className="flex items-center">
              {isEdit && Boolean(onPlanAgain ?? onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label="More actions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {onPlanAgain && (
                      <DropdownMenuItem onSelect={handlePlanAgain}>
                        <Copy className="h-4 w-4" />
                        Plan next week
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        onSelect={handleDelete}
                        disabled={isDeleting}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete session
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {isEdit && status === "planned" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => save("in-progress")}
                  disabled={!canSave}
                >
                  <PlayCircle className="h-4 w-4" />
                  Start
                </Button>
              )}
              {isEdit && status === "in-progress" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => save("completed")}
                  disabled={!canSave}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete
                </Button>
              )}
              <Button type="submit" disabled={!canSave}>
                {isEdit ? "Save" : "Create session"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Timeline({ blocks }: { blocks: StudyBlock[] }) {
  const start = blocks[0] ? getMinutes(blocks[0].start) : 0
  const end = blocks[blocks.length - 1] ? getMinutes(blocks[blocks.length - 1].end) : start
  const span = Math.max(1, end - start)

  return (
    <div
      className="relative h-8 overflow-hidden rounded-lg border border-border/50 bg-muted/50"
      role="img"
      aria-label={`Study timeline from ${blocks[0]?.start ?? ""} to ${blocks[blocks.length - 1]?.end ?? ""}`}
    >
      {blocks.map((block, index) => {
        const left = ((getMinutes(block.start) - start) / span) * 100
        const width = ((getMinutes(block.end) - getMinutes(block.start)) / span) * 100
        return (
          <div
            key={`${block.start}-${block.end}-${index}`}
            className="absolute inset-y-0 flex min-w-1 items-center justify-center border-x border-primary/20 bg-primary/25 text-micro font-semibold text-primary"
            style={{ left: `${left}%`, width: `${Math.max(0, width)}%` }}
            title={`Block ${index + 1}: ${block.start}–${block.end}`}
          >
            {width >= 12 ? index + 1 : null}
          </div>
        )
      })}
    </div>
  )
}
