import { useState, useCallback, useMemo, useRef } from "react"
import { addMinutes } from "date-fns"
import { AlertCircle, CalendarPlus, Check, Clock, Loader2, Plus, RotateCcw, Trash2, Wand2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getActiveProvider, getEffectiveModel } from "@/lib/providers"
import { getSubjectById, cn, combineDateAndTime } from "@/lib/utils"
import { buildAvailableStudyIntervals, getUrgencyLabel, getUrgencyClassName, sumAvailableStudyMinutes, validateStudyPlanBlocks, type AvailableStudyInterval, type PrepBalanceItem } from "@/lib/planning"
import { DEFAULT_STUDY_PLANNING_PREFERENCES, getStudyPlanningPreferences, setStudyPlanningPreferences } from "@/lib/settings"
import { notifyUserSettingsChanged } from "@/lib/sync/engine"
import { confirmAction } from "@/lib/confirmToast"
import type { CalendarEvent, PriorityItem, Project, StudyPlanningPreferences, StudySession, Subject, TimetableConfig } from "@/lib/types"
import { generateAssessmentCopilotPlan, clampCopilotDuration, splitCopilotTopics } from "@/lib/copilot"
import type { CopilotFocusItem, CopilotSessionDraft } from "@/lib/copilot"
import { describeAiError } from "@/lib/aiAssistant"

function getCopilotDraftErrors(draft: CopilotSessionDraft, subjectIds: string[], projectIds: string[]): string[] {
  const errors: string[] = []
  if (!draft.title.trim()) errors.push("Add a title.")
  if (!combineDateAndTime(draft.date, draft.startTime)) errors.push("Use a valid date and start time.")
  if (!Number.isFinite(draft.durationMinutes) || draft.durationMinutes < 30 || draft.durationMinutes > 180) {
    errors.push("Duration must be 30-180 minutes.")
  }
  if (draft.projectId && !projectIds.includes(draft.projectId)) errors.push("Choose a valid assessment.")
  if (draft.subjectIds.filter((subjectId) => subjectIds.includes(subjectId)).length === 0) {
    errors.push("Choose at least one subject.")
  }
  return errors
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAY_PRESET = [1, 2, 3, 4, 5]
const WEEKEND_PRESET = [6, 0]

function getPlanErrors(drafts: CopilotSessionDraft[], intervals: AvailableStudyInterval[]): string[][] {
  return validateStudyPlanBlocks(drafts.map((draft) => {
    const start = combineDateAndTime(draft.date, draft.startTime)
    return {
      startTime: start?.toISOString() ?? "",
      endTime: start ? addMinutes(start, draft.durationMinutes).toISOString() : "",
    }
  }), intervals)
}

// --- Component ---

interface AssessmentCopilotProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  priorityItems: PriorityItem[]
  prepBalanceItems: PrepBalanceItem[]
  planningSubjects: Subject[]
  currentMonth: Date
  timetableConfig?: TimetableConfig | null
  onCreateStudySessions: (sessions: Omit<StudySession, "id" | "status" | "created_at">[]) => Promise<void>
}

export function AssessmentCopilot({
  open,
  onOpenChange,
  projects,
  sessions,
  events,
  priorityItems,
  prepBalanceItems,
  planningSubjects,
  currentMonth,
  timetableConfig,
  onCreateStudySessions,
}: AssessmentCopilotProps) {
  const [copilotSummary, setCopilotSummary] = useState("")
  const [copilotFocusItems, setCopilotFocusItems] = useState<CopilotFocusItem[]>([])
  const [copilotDrafts, setCopilotDrafts] = useState<CopilotSessionDraft[]>([])
  const [copilotChanges, setCopilotChanges] = useState("")
  const [copilotError, setCopilotError] = useState<{ message: string; hint: string | null } | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [copilotRefining, setCopilotRefining] = useState(false)
  const [copilotApplying, setCopilotApplying] = useState(false)
  const [planningPreferences, setPlanningPreferences] = useState<StudyPlanningPreferences>(getStudyPlanningPreferences)
  const copilotAbortRef = useRef<AbortController | null>(null)

  const planningSubjectIds = useMemo(() => planningSubjects.map((subject) => subject.id), [planningSubjects])
  const activeProjectIds = useMemo(
    () => projects.filter((project) => !project.isArchived && !project.isFinished).map((project) => project.id),
    [projects],
  )
  const availableIntervals = useMemo(() => buildAvailableStudyIntervals({
    preferences: planningPreferences,
    sessions,
    events,
    timetableConfig,
  }), [events, planningPreferences, sessions, timetableConfig])
  const planErrors = useMemo(() => getPlanErrors(copilotDrafts, availableIntervals), [availableIntervals, copilotDrafts])
  const copilotDraftErrors = useMemo(
    () => new Map(copilotDrafts.map((draft, index) => [draft.draftId, [
      ...getCopilotDraftErrors(draft, planningSubjectIds, activeProjectIds),
      ...(planErrors[index] ?? []),
    ]])),
    [activeProjectIds, copilotDrafts, planErrors, planningSubjectIds],
  )
  const approvedValidCopilotDrafts = useMemo(
    () => copilotDrafts.filter((draft) => draft.approved && (copilotDraftErrors.get(draft.draftId)?.length ?? 0) === 0),
    [copilotDraftErrors, copilotDrafts],
  )
  const availableMinutes = useMemo(
    () => sumAvailableStudyMinutes(availableIntervals),
    [availableIntervals],
  )
  const availabilityBlocker = useMemo(() => {
    if (availableIntervals.length > 0) return null
    if (planningPreferences.windows.length === 0) return "Add a future study window below to enable generation."
    if (planningPreferences.windows.some((window) => window.startTime >= window.endTime)) {
      return "Each study window needs an end time after its start time."
    }
    return "No free time remains inside these windows after existing sessions, events, your timetable, and daily cap. Adjust a window or increase the cap."
  }, [availableIntervals.length, planningPreferences.windows])

  const cancelCopilotRequest = useCallback(() => {
    copilotAbortRef.current?.abort()
    copilotAbortRef.current = null
  }, [])

  const updatePlanningPreferences = useCallback((next: StudyPlanningPreferences) => {
    setPlanningPreferences(next)
    setStudyPlanningPreferences(next)
    notifyUserSettingsChanged()
  }, [])

  const addAvailabilityWindows = useCallback((weekdays: number[]) => {
    const existingDays = new Set(planningPreferences.windows.map((window) => window.weekday))
    updatePlanningPreferences({
      ...planningPreferences,
      windows: [
        ...planningPreferences.windows,
        ...weekdays.filter((weekday) => !existingDays.has(weekday)).map((weekday) => ({
          weekday,
          startTime: "16:00",
          endTime: "18:00",
        })),
      ],
    })
  }, [planningPreferences, updatePlanningPreferences])

  const addAvailabilityWindow = useCallback(() => {
    const existingDays = new Set(planningPreferences.windows.map((window) => window.weekday))
    const weekday = [...WEEKDAY_PRESET, ...WEEKEND_PRESET].find((day) => !existingDays.has(day)) ?? new Date().getDay()
    updatePlanningPreferences({
      ...planningPreferences,
      windows: [...planningPreferences.windows, { weekday, startTime: "16:00", endTime: "18:00" }],
    })
  }, [planningPreferences, updatePlanningPreferences])

  const resetAvailability = useCallback(async () => {
    const confirmed = await confirmAction({
      title: "Reset study availability?",
      description: "This removes every reusable study window and restores the two-hour daily cap.",
      actionLabel: "Reset",
      cancelLabel: "Keep settings",
    })
    if (!confirmed) return
    updatePlanningPreferences({ ...DEFAULT_STUDY_PLANNING_PREFERENCES, windows: [] })
  }, [updatePlanningPreferences])

  const setAllDraftApprovals = useCallback((approved: boolean) => {
    setCopilotDrafts((current) => current.map((draft) => ({
      ...draft,
      approved: approved && (copilotDraftErrors.get(draft.draftId)?.length ?? 0) === 0,
    })))
  }, [copilotDraftErrors])

  const handleGenerate = async () => {
    const provider = getActiveProvider()
    if (!provider.isConfigured()) {
      setCopilotError({
        message: `${provider.displayName} is not configured.`,
        hint: "Open Settings \u2192 AI to choose and configure a provider.",
      })
      return
    }
    if (planningPreferences.windows.length === 0 || availableIntervals.length === 0) {
      setCopilotError({ message: "Add at least one future study window before generating a plan.", hint: null })
      return
    }

    copilotAbortRef.current = new AbortController()
    setCopilotLoading(true)
    setCopilotError(null)
    try {
      const result = await generateAssessmentCopilotPlan({
        projects,
        sessions,
        events,
        priorityItems,
        prepBalanceItems,
        subjects: planningSubjects,
        model: getEffectiveModel(),
        currentMonth,
        availableIntervals,
        signal: copilotAbortRef.current.signal,
      })
      setCopilotSummary(result.summary)
      setCopilotFocusItems(result.focusItems)
      const errors = getPlanErrors(result.sessions, availableIntervals)
      setCopilotDrafts(result.sessions.map((draft, index) => ({ ...draft, approved: (errors[index]?.length ?? 0) === 0 })))
      setCopilotChanges("")
    } catch (e) {
      const { message, hint, cancelled } = describeAiError(e)
      if (cancelled) {
        // Cancellation isn't an error in the UI — quietly close the spinner.
        return
      }
      setCopilotError({ message, hint })
    } finally {
      copilotAbortRef.current = null
      setCopilotLoading(false)
    }
  }

  const handleRefine = async () => {
    const provider = getActiveProvider()
    if (!provider.isConfigured()) {
      setCopilotError({
        message: `${provider.displayName} is not configured.`,
        hint: "Open Settings \u2192 AI to choose and configure a provider.",
      })
      return
    }
    if (!copilotChanges.trim()) {
      setCopilotError({ message: "Describe the changes you want AI to apply.", hint: null })
      return
    }
    if (copilotDrafts.length === 0) {
      setCopilotError({ message: "Generate draft sessions before asking AI to change them.", hint: null })
      return
    }

    copilotAbortRef.current = new AbortController()
    setCopilotRefining(true)
    setCopilotError(null)
    try {
      const approvalById = new Map(copilotDrafts.map((draft) => [draft.draftId, draft.approved]))
      const result = await generateAssessmentCopilotPlan({
        projects,
        sessions,
        events,
        priorityItems,
        prepBalanceItems,
        subjects: planningSubjects,
        model: getEffectiveModel(),
        currentMonth,
        availableIntervals,
        currentDrafts: copilotDrafts,
        refinement: copilotChanges.trim(),
        signal: copilotAbortRef.current.signal,
      })
      setCopilotSummary(result.summary)
      setCopilotFocusItems(result.focusItems)
      const errors = getPlanErrors(result.sessions, availableIntervals)
      setCopilotDrafts(result.sessions.map((draft, index) => ({
        ...draft,
        approved: (errors[index]?.length ?? 0) === 0 && (approvalById.get(draft.draftId) ?? draft.approved),
      })))
      setCopilotChanges("")
    } catch (e) {
      const { message, hint, cancelled } = describeAiError(e)
      if (cancelled) return
      setCopilotError({ message, hint })
    } finally {
      copilotAbortRef.current = null
      setCopilotRefining(false)
    }
  }

  const updateDraft = useCallback(<K extends keyof CopilotSessionDraft>(
    draftId: string,
    key: K,
    value: CopilotSessionDraft[K],
  ) => {
    setCopilotDrafts((current) => current.map((draft) => (
      draft.draftId === draftId ? {
        ...draft,
        [key]: value,
        ...(key === "date" || key === "startTime" || key === "durationMinutes" ? { approved: false } : {}),
      } : draft
    )))
  }, [])

  const handleProjectChange = useCallback((draft: CopilotSessionDraft, projectId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId)
    const nextSubjectIds = project?.subjectId && !draft.subjectIds.includes(project.subjectId)
      ? [...draft.subjectIds, project.subjectId]
      : draft.subjectIds
    setCopilotDrafts((current) => current.map((item) => (
      item.draftId === draft.draftId
        ? { ...item, projectId: projectId || undefined, subjectIds: nextSubjectIds }
        : item
    )))
  }, [projects])

  const handleToggleSubject = useCallback((draft: CopilotSessionDraft, subjectId: string) => {
    setCopilotDrafts((current) => current.map((item) => {
      if (item.draftId !== draft.draftId) return item
      const nextSubjectIds = item.subjectIds.includes(subjectId)
        ? item.subjectIds.filter((id) => id !== subjectId)
        : [...item.subjectIds, subjectId]
      return { ...item, subjectIds: nextSubjectIds }
    }))
  }, [])

  const handleApply = async () => {
    if (approvedValidCopilotDrafts.length === 0) {
      setCopilotError({ message: "Approve at least one valid study-session draft.", hint: null })
      return
    }

    const sessionItems = approvedValidCopilotDrafts.flatMap((draft) => {
      const start = combineDateAndTime(draft.date, draft.startTime)
      if (!start) return []
      const end = addMinutes(start, draft.durationMinutes)
      return [{
        projectId: draft.projectId,
        subjectIds: draft.subjectIds.filter((subjectId) => planningSubjectIds.includes(subjectId)),
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        topics: splitCopilotTopics(draft.topicsInput),
        notes: draft.notes.trim() || undefined,
      }]
    })

    if (sessionItems.length === 0) {
      setCopilotError({ message: "The approved drafts could not be converted into study sessions.", hint: null })
      return
    }

    setCopilotApplying(true)
    setCopilotError(null)
    try {
      await onCreateStudySessions(sessionItems)
      onOpenChange(false)
      setCopilotSummary("")
      setCopilotFocusItems([])
      setCopilotDrafts([])
      setCopilotChanges("")
    } catch (e) {
      setCopilotError({ message: describeAiError(e).message, hint: null })
    } finally {
      setCopilotApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,54rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle>Plan my week</DialogTitle>
          <DialogDescription>
            Draft a realistic seven-day plan inside your free study windows. Review everything before adding sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5">
          {copilotError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <p>{copilotError.message}</p>
                {copilotError.hint && (
                  <p className="mt-0.5 text-destructive/70">{copilotError.hint}</p>
                )}
              </div>
            </div>
          )}

          {!getActiveProvider().isConfigured() && (
            <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {`${getActiveProvider().displayName} is not configured. Go to Settings to set it up.`}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/35 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Assessment triage</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Uses current assessments, sessions, readiness, blockers, and prep balance.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {(copilotLoading || copilotRefining) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={cancelCopilotRequest}
                  className="h-8 gap-1.5 rounded-xl text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={copilotLoading || copilotRefining || !getActiveProvider().isConfigured() || availableIntervals.length === 0}
                className="h-8 gap-1.5 rounded-xl text-background"
              >
                {copilotLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {copilotLoading ? "Generating..." : copilotDrafts.length > 0 ? "Regenerate" : "Generate"}
              </Button>
            </div>
            {availabilityBlocker && (
              <p className="w-full text-xs text-warning">{availabilityBlocker}</p>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.6fr)]">
            <ScrollArea className="min-h-0">
            <div className="space-y-4">
              <section className="rounded-xl border border-border/70 bg-background/35 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-3.5 w-3.5 text-muted-foreground" />Study availability</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {availableIntervals.length > 0
                        ? `${Math.floor(availableMinutes / 60)}h ${availableMinutes % 60}m free across ${availableIntervals.length} interval${availableIntervals.length === 1 ? "" : "s"}`
                        : planningPreferences.windows.length === 0
                          ? "Add a reusable window to enable planning"
                          : "No usable free intervals in the next 7 days"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => void resetAvailability()}>
                      <RotateCcw className="h-3 w-3" /> Reset
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={addAvailabilityWindow}
                    >
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addAvailabilityWindows(WEEKDAY_PRESET)}>
                    Add weekday evenings
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addAvailabilityWindows(WEEKEND_PRESET)}>
                    Add weekend evenings
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {planningPreferences.windows.map((window, index) => (
                    <div key={`${window.weekday}-${index}`} className="flex items-center gap-2">
                      <Select value={String(window.weekday)} onValueChange={(value) => updatePlanningPreferences({
                        ...planningPreferences,
                        windows: planningPreferences.windows.map((item, itemIndex) => itemIndex === index ? { ...item, weekday: Number(value) } : item),
                      })}>
                        <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{WEEKDAYS.map((day, dayIndex) => <SelectItem key={day} value={String(dayIndex)}>{day}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input type="time" value={window.startTime} className="h-8 min-w-0 text-xs" onChange={(event) => updatePlanningPreferences({
                        ...planningPreferences,
                        windows: planningPreferences.windows.map((item, itemIndex) => itemIndex === index ? { ...item, startTime: event.target.value } : item),
                      })} />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input type="time" value={window.endTime} className="h-8 min-w-0 text-xs" onChange={(event) => updatePlanningPreferences({
                        ...planningPreferences,
                        windows: planningPreferences.windows.map((item, itemIndex) => itemIndex === index ? { ...item, endTime: event.target.value } : item),
                      })} />
                      <Button type="button" variant="ghost" size="icon-sm" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Remove ${WEEKDAYS[window.weekday]} study window`} onClick={() => updatePlanningPreferences({
                        ...planningPreferences,
                        windows: planningPreferences.windows.filter((_, itemIndex) => itemIndex !== index),
                      })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  Daily study cap
                  <span className="flex items-center gap-1.5"><Input type="number" min="30" max="480" step="15" className="h-8 w-20 text-xs" value={planningPreferences.dailyCapMinutes} onChange={(event) => updatePlanningPreferences({ ...planningPreferences, dailyCapMinutes: Number(event.target.value) })} /> min</span>
                </label>
              </section>
              <section className="rounded-xl border border-border/70 bg-background/35 p-4">
                <h3 className="text-sm font-semibold">Summary</h3>
                {copilotSummary ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copilotSummary}</p>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Generate a plan to see the assessment pressure points and draft sessions.
                  </p>
                )}
              </section>

              <section className="rounded-xl border border-border/70 bg-background/35 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Focus Items</h3>
                  {copilotFocusItems.length > 0 && (
                    <span className="text-micro text-muted-foreground tabular-nums">{copilotFocusItems.length}</span>
                  )}
                </div>
                {copilotFocusItems.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {copilotFocusItems.map((item, index) => {
                      const project = item.projectId ? projects.find((candidate) => candidate.id === item.projectId) : undefined
                      return (
                        <div key={`${item.title}-${index}`} className="rounded-lg border border-border/60 bg-background/35 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{item.title}</p>
                              <p className="mt-1 text-micro leading-relaxed text-muted-foreground">{item.reason}</p>
                            </div>
                            <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-micro font-medium leading-3", getUrgencyClassName(item.urgency))}>
                              {getUrgencyLabel(item.urgency)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {project && (
                              <span className="max-w-full truncate rounded-md bg-muted/65 px-1.5 py-0.5 text-micro text-muted-foreground">
                                {project.name}
                              </span>
                            )}
                            {item.subjectIds.slice(0, 3).map((subjectId) => {
                              const subject = getSubjectById(subjectId)
                              return (
                                <span
                                  key={subjectId}
                                  className="rounded-md px-1.5 py-0.5 text-micro font-medium"
                                  style={{
                                    backgroundColor: subject ? `${subject.color}18` : "color-mix(in oklch, var(--primary) 12%, transparent)",
                                    color: subject?.color ?? "var(--primary)",
                                  }}
                                >
                                  {subject?.shortCode ?? subjectId}
                                </span>
                              )
                            })}
                          </div>
                          <p className="mt-2 text-micro font-medium text-foreground/80">{item.nextAction}</p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">No focus items generated yet.</p>
                )}
              </section>

              <section className="rounded-xl border border-border/70 bg-background/35 p-4">
                <label className="text-sm font-semibold" htmlFor="assessment-copilot-changes">Changes for AI</label>
                <p className="mt-1 text-xs text-muted-foreground">Manual edits below are included when AI applies changes.</p>
                <textarea
                  id="assessment-copilot-changes"
                  value={copilotChanges}
                  onChange={(event) => setCopilotChanges(event.target.value)}
                  placeholder="e.g. move sessions to after 5pm, make Methods shorter, add one Biology weak-topic session"
                  rows={5}
                  className="mt-3 flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefine}
                  disabled={copilotRefining || copilotLoading || !copilotChanges.trim() || copilotDrafts.length === 0 || !getActiveProvider().isConfigured()}
                  className="mt-3 h-8 gap-1.5 rounded-xl"
                >
                  {copilotRefining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {copilotRefining ? "Applying..." : "Apply AI Changes"}
                </Button>
              </section>
            </div>
            </ScrollArea>

            <section className="flex min-h-0 flex-col rounded-xl border border-border/70 bg-background/35">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold">Draft Sessions</h3>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {copilotDrafts.length > 0
                      ? `${approvedValidCopilotDrafts.length} approved valid draft${approvedValidCopilotDrafts.length === 1 ? "" : "s"}`
                      : "Generated drafts appear here"}
                  </p>
                </div>
                {copilotDrafts.length > 0 && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllDraftApprovals(false)}>
                      Clear
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAllDraftApprovals(true)}>
                      Approve valid
                    </Button>
                  </div>
                )}
              </div>

              {copilotDrafts.length > 0 ? (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="divide-y divide-border/60">
                    {copilotDrafts.map((draft, index) => {
                      const errors = copilotDraftErrors.get(draft.draftId) ?? []
                      const project = draft.projectId ? projects.find((candidate) => candidate.id === draft.projectId) : undefined
                      return (
                        <div key={draft.draftId} className={cn("space-y-4 p-4", !draft.approved && "opacity-60")}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => updateDraft(draft.draftId, "approved", !draft.approved)}
                              className={cn(
                                "flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium transition-colors",
                                draft.approved
                                  ? "border-primary/35 bg-primary/10 text-primary"
                                  : "border-border/70 text-muted-foreground hover:text-foreground",
                              )}
                              aria-pressed={draft.approved}
                            >
                              <span className={cn(
                                "flex h-3.5 w-3.5 items-center justify-center rounded border",
                                draft.approved ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                              )}>
                                {draft.approved && <Check className="h-2.5 w-2.5" />}
                              </span>
                              Draft {index + 1}
                            </button>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {project && (
                                <span className="max-w-48 truncate rounded-md bg-muted/65 px-1.5 py-0.5 text-micro text-muted-foreground">
                                  {project.name}
                                </span>
                              )}
                              <span className={cn(
                                "rounded-md px-1.5 py-0.5 text-micro font-medium",
                                errors.length > 0 ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success",
                              )}>
                                {errors.length > 0 ? `${errors.length} issue${errors.length === 1 ? "" : "s"}` : "Valid"}
                              </span>
                            </div>
                          </div>

                          {errors.length > 0 && (
                            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                              {errors.join(" ")}
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[minmax(16rem,1fr)_minmax(14rem,0.75fr)]">
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">Title</label>
                              <Input
                                value={draft.title}
                                onChange={(event) => updateDraft(draft.draftId, "title", event.target.value)}
                                placeholder="Study session title"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">Assessment</label>
                              <Select value={draft.projectId ?? "_none"} onValueChange={(value) => handleProjectChange(draft, value === "_none" ? "" : value)}>
                                <SelectTrigger className="h-10 w-full">
                                  <SelectValue placeholder="No assessment" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">No assessment</SelectItem>
                                  {projects.filter((projectOption) => !projectOption.isArchived && !projectOption.isFinished).map((projectOption) => (
                                    <SelectItem key={projectOption.id} value={projectOption.id}>
                                      {projectOption.icon} {projectOption.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">Date</label>
                              <Input
                                type="date"
                                value={draft.date}
                                onChange={(event) => updateDraft(draft.draftId, "date", event.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">Start Time</label>
                              <Input
                                type="time"
                                value={draft.startTime}
                                onChange={(event) => updateDraft(draft.draftId, "startTime", event.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">Duration</label>
                              <Input
                                type="number"
                                min="30"
                                max="180"
                                step="15"
                                value={draft.durationMinutes}
                                onChange={(event) => updateDraft(draft.draftId, "durationMinutes", clampCopilotDuration(Number(event.target.value)))}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Subjects</label>
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 min-[1500px]:grid-cols-4">
                              {planningSubjects.map((subject) => {
                                const selected = draft.subjectIds.includes(subject.id)
                                return (
                                  <button
                                    key={subject.id}
                                    type="button"
                                    onClick={() => handleToggleSubject(draft, subject.id)}
                                    className={cn(
                                      "flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors",
                                      selected
                                        ? "border-primary/35 bg-primary/10 text-primary"
                                        : "border-border/70 bg-background/40 text-muted-foreground hover:text-foreground",
                                    )}
                                    aria-pressed={selected}
                                  >
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
                                    <span className="min-w-0 truncate">{subject.shortCode} / {subject.name}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">Topics</label>
                              <Input
                                value={draft.topicsInput}
                                onChange={(event) => updateDraft(draft.draftId, "topicsInput", event.target.value)}
                                placeholder="Comma-separated topics"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-muted-foreground">Description</label>
                              <Input
                                value={draft.description}
                                onChange={(event) => updateDraft(draft.draftId, "description", event.target.value)}
                                placeholder="What this block should achieve"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Notes</label>
                            <textarea
                              value={draft.notes}
                              onChange={(event) => updateDraft(draft.draftId, "notes", event.target.value)}
                              placeholder="Resources, reminders, or extra context"
                              rows={3}
                              className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex min-h-60 flex-1 items-center justify-center p-5 text-center">
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Generate a copilot plan to create editable study-session drafts.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={copilotApplying || approvedValidCopilotDrafts.length === 0}
            className="gap-1.5 text-background"
          >
            {copilotApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {copilotApplying ? "Adding..." : `Add ${approvedValidCopilotDrafts.length} Session${approvedValidCopilotDrafts.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
