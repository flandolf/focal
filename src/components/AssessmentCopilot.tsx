import { useState, useCallback, useMemo } from "react"
import { addMinutes, format, parseISO } from "date-fns"
import { AlertCircle, CalendarPlus, Check, Loader2, Wand2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { getApiKey, getModel, getReasoningConfig } from "@/lib/settings"
import { getSubjectById, getSessionSubjectIds, cn, combineDateAndTime, getLocalDateValue } from "@/lib/utils"
import type { CalendarEvent, PriorityItem, PriorityUrgency, Project, StudySession, Subject } from "@/lib/types"

// --- Types ---

interface CopilotFocusItem {
  title: string
  reason: string
  urgency: PriorityUrgency
  projectId?: string
  subjectIds: string[]
  nextAction: string
}

interface CopilotSessionDraft {
  draftId: string
  approved: boolean
  title: string
  description: string
  notes: string
  date: string
  startTime: string
  durationMinutes: number
  projectId?: string
  subjectIds: string[]
  topicsInput: string
}

interface CopilotResult {
  summary: string
  focusItems: CopilotFocusItem[]
  sessions: CopilotSessionDraft[]
}

interface PrepBalanceItem {
  subjectId: string
  shortCode: string
  name: string
  color: string
  assessmentCount: number
  plannedMinutes: number
  nextTitle?: string
  nextDate?: Date
  projectId?: string
  event?: CalendarEvent
}

// --- Constants ---

const VALID_URGENCIES = new Set<PriorityUrgency>(["critical", "high", "medium", "low"])

// --- Helpers ---

function getUrgencyLabel(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical": return "Critical"
    case "high": return "High"
    case "medium": return "Medium"
    case "low": return "Low"
  }
}

function getUrgencyClassName(urgency: PriorityUrgency) {
  switch (urgency) {
    case "critical": return "bg-destructive/12 text-destructive"
    case "high": return "bg-amber-500/14 text-amber-700 dark:text-amber-300"
    case "medium": return "bg-primary/12 text-primary"
    case "low": return "bg-muted text-muted-foreground"
  }
}

function clampCopilotDuration(value: unknown): number {
  const duration = typeof value === "number" && Number.isFinite(value) ? value : 60
  return Math.min(180, Math.max(30, Math.round(duration / 15) * 15))
}

function splitCopilotTopics(value: string): string[] {
  return value.split(",").map((topic) => topic.trim()).filter(Boolean)
}

function formatCopilotDateTime(value?: string) {
  if (!value) return "no date"
  const date = parseISO(value)
  return Number.isNaN(date.getTime()) ? value : format(date, "yyyy-MM-dd HH:mm")
}

function parseCopilotResponse(
  content: string,
  subjectIds: string[],
  projectIds: string[],
  existingDraftIds: Set<string>,
): CopilotResult {
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid copilot response")
  }

  const record = parsed as Record<string, unknown>
  const summary = typeof record.summary === "string" && record.summary.trim()
    ? record.summary.trim()
    : "Review the drafted sessions before adding them."

  const focusItems = Array.isArray(record.focus_items)
    ? record.focus_items.flatMap((item): CopilotFocusItem[] => {
      if (typeof item !== "object" || item === null) return []
      const itemRecord = item as Record<string, unknown>
      const title = typeof itemRecord.title === "string" ? itemRecord.title.trim() : ""
      const reason = typeof itemRecord.reason === "string" ? itemRecord.reason.trim() : ""
      const urgency = VALID_URGENCIES.has(itemRecord.urgency as PriorityUrgency) ? (itemRecord.urgency as PriorityUrgency) : "medium"
      const projectId = typeof itemRecord.project_id === "string" && projectIds.includes(itemRecord.project_id)
        ? itemRecord.project_id
        : undefined
      const itemSubjectIds = Array.isArray(itemRecord.subject_ids)
        ? itemRecord.subject_ids.filter((id): id is string => typeof id === "string" && subjectIds.includes(id))
        : []
      const nextAction = typeof itemRecord.next_action === "string" && itemRecord.next_action.trim()
        ? itemRecord.next_action.trim()
        : "Plan a focused session"

      if (!title || !reason) return []
      return [{ title, reason, urgency, projectId, subjectIds: itemSubjectIds, nextAction }]
    }).slice(0, 5)
    : []

  const sessionsValue = record.sessions
  if (!Array.isArray(sessionsValue)) {
    throw new Error("Copilot response missing sessions array")
  }

  const sessions = sessionsValue.flatMap((item): CopilotSessionDraft[] => {
    if (typeof item !== "object" || item === null) return []
    const itemRecord = item as Record<string, unknown>
    const title = typeof itemRecord.title === "string" ? itemRecord.title.trim() : ""
    const date = typeof itemRecord.date === "string" ? itemRecord.date.trim() : ""
    const startTime = typeof itemRecord.start_time === "string" ? itemRecord.start_time.trim() : ""
    const subjectIdsForDraft = Array.isArray(itemRecord.subject_ids)
      ? itemRecord.subject_ids.filter((id): id is string => typeof id === "string" && subjectIds.includes(id))
      : []
    const projectId = typeof itemRecord.project_id === "string" && projectIds.includes(itemRecord.project_id)
      ? itemRecord.project_id
      : undefined
    const draftId = typeof itemRecord.draft_id === "string" && existingDraftIds.has(itemRecord.draft_id)
      ? itemRecord.draft_id
      : crypto.randomUUID()

    if (!title || !date || !startTime || subjectIdsForDraft.length === 0) return []

    return [{
      draftId,
      approved: true,
      title,
      description: typeof itemRecord.description === "string" ? itemRecord.description.trim() : "",
      notes: typeof itemRecord.notes === "string" ? itemRecord.notes.trim() : "",
      date,
      startTime,
      durationMinutes: clampCopilotDuration(itemRecord.duration_minutes),
      projectId,
      subjectIds: subjectIdsForDraft,
      topicsInput: Array.isArray(itemRecord.topics)
        ? itemRecord.topics.filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0).map((topic) => topic.trim()).join(", ")
        : "",
    }]
  })

  return { summary, focusItems, sessions }
}

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

// --- API Call ---

async function generateAssessmentCopilotPlan({
  projects,
  sessions,
  events,
  priorityItems,
  prepBalanceItems,
  subjects,
  apiKey,
  model,
  currentMonth,
  currentDrafts,
  refinement,
}: {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  priorityItems: PriorityItem[]
  prepBalanceItems: PrepBalanceItem[]
  subjects: Subject[]
  apiKey: string
  model: string
  currentMonth: Date
  currentDrafts?: CopilotSessionDraft[]
  refinement?: string
}): Promise<CopilotResult> {
  const today = getLocalDateValue(new Date())
  const planningEnd = getLocalDateValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))
  const subjectIds = subjects.map((subject) => subject.id)
  const activeProjects = projects.filter((project) => !project.isArchived && !project.isFinished).slice(0, 40)
  const projectIds = activeProjects.map((project) => project.id)
  const projectEnum = ["none", ...projectIds]
  const existingDraftIds = new Set(currentDrafts?.map((draft) => draft.draftId) ?? [])
  const activeProjectById = new Map(activeProjects.map((project) => [project.id, project]))

  const subjectLines = subjects
    .map((subject) => `${subject.id}: ${subject.name} (${subject.shortCode})`)
    .join("\n")
  const assessmentLines = activeProjects
    .map((project) => {
      const subject = getSubjectById(project.subjectId)
      return [
        `id ${project.id}`,
        project.name,
        project.deadline ? `due ${formatCopilotDateTime(project.deadline)}` : "no deadline",
        project.deadlineType ? `type ${project.deadlineType}` : null,
        subject ? `subject ${subject.id}` : null,
      ].filter(Boolean).join(" / ")
    })
    .join("\n")
  const priorityLines = priorityItems
    .map((item) => `${item.urgency}: ${item.title} / ${item.reason} / action ${item.action}`)
    .join("\n")
  const prepLines = prepBalanceItems
    .map((item) => {
      const targetMinutes = item.assessmentCount * 90
      const remainingMinutes = Math.max(0, Math.round(targetMinutes - item.plannedMinutes))
      return `${item.subjectId}: ${item.assessmentCount} upcoming, ${Math.round(item.plannedMinutes)}m planned, ${remainingMinutes}m gap, next ${item.nextTitle ?? "none"}`
    })
    .join("\n")
  const sessionLines = sessions
    .filter((session) => session.status === "planned" || session.status === "completed")
    .slice(-35)
    .map((session) => {
      const project = session.projectId ? activeProjectById.get(session.projectId) : undefined
      const sessionSubjectIds = getSessionSubjectIds(session, project)
      return [
        session.status,
        session.title,
        `${formatCopilotDateTime(session.startTime)}-${formatCopilotDateTime(session.endTime)}`,
        project ? `assessment ${project.id}` : null,
        sessionSubjectIds.length > 0 ? `subjects ${sessionSubjectIds.join(",")}` : null,
        session.confidence ? `confidence ${session.confidence}/5` : null,
        session.blockers ? `blockers ${session.blockers}` : null,
        session.nextAction ? `next ${session.nextAction}` : null,
      ].filter(Boolean).join(" / ")
    })
    .join("\n")
  const eventLines = events
    .filter((event) => !event.isFinished && event.eventType !== "event")
    .slice(0, 35)
    .map((event) => `${event.eventType}: ${event.title} / ${formatCopilotDateTime(event.startTime)} / subject ${event.subjectId ?? "none"}`)
    .join("\n")
  const currentDraftLines = currentDrafts?.map((draft) => JSON.stringify({
    draft_id: draft.draftId,
    approved: draft.approved,
    title: draft.title,
    description: draft.description,
    notes: draft.notes,
    date: draft.date,
    start_time: draft.startTime,
    duration_minutes: draft.durationMinutes,
    project_id: draft.projectId ?? "none",
    subject_ids: draft.subjectIds,
    topics: splitCopilotTopics(draft.topicsInput),
  })).join("\n")

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are an assessment planning copilot for a VCE study app.

Rules:
- Today is ${today}; use it to resolve relative timing.
- Create study sessions only. Do not create normal calendar events, deadlines, SACs, exams, assignments, or reminders.
- Schedule sessions from ${today} through ${planningEnd} unless the user's refinement explicitly asks for another date range.
- Prefer urgent assessments, weak topics, blockers, low-confidence completed sessions, and low planned prep time.
- Return 2 to 5 practical study-session drafts.
- Use 24-hour start_time in HH:mm format.
- Use durations from 30 to 180 minutes in 15-minute increments.
- Every session must include at least one concrete subject id in subject_ids.
- Use project_id when a session clearly supports an existing active assessment; otherwise use "none".
- Respect the user's manual edits. If refining, treat the current drafts as source of truth and apply only the requested changes.
- Keep summary and focus items concise.`,
        },
        {
          role: "user",
          content: `${refinement ? `Refinement request:
"""
${refinement}
"""

Current edited drafts:
${currentDraftLines ?? "None"}

` : ""}Available subjects:
${subjectLines}

Active assessments:
${assessmentLines || "None"}

Assessment priority items:
${priorityLines || "None"}

Prep balance for ${format(currentMonth, "MMMM yyyy")}:
${prepLines || "None"}

Relevant sessions:
${sessionLines || "None"}

Upcoming assessment events:
${eventLines || "None"}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "assessment_copilot_plan",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string" },
              focus_items: {
                type: "array",
                minItems: 0,
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    reason: { type: "string" },
                    urgency: { type: "string", enum: ["critical", "high", "medium", "low"] },
                    project_id: { type: "string", enum: projectEnum },
                    subject_ids: { type: "array", items: { type: "string", enum: subjectIds } },
                    next_action: { type: "string" },
                  },
                  required: ["title", "reason", "urgency", "project_id", "subject_ids", "next_action"],
                  additionalProperties: false,
                },
              },
              sessions: {
                type: "array",
                minItems: 2,
                maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    draft_id: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    notes: { type: "string" },
                    date: { type: "string", description: "YYYY-MM-DD" },
                    start_time: { type: "string", description: "HH:mm in 24-hour time" },
                    duration_minutes: { type: "number" },
                    project_id: { type: "string", enum: projectEnum },
                    subject_ids: { type: "array", items: { type: "string", enum: subjectIds } },
                    topics: { type: "array", items: { type: "string" } },
                  },
                  required: ["draft_id", "title", "description", "notes", "date", "start_time", "duration_minutes", "project_id", "subject_ids", "topics"],
                  additionalProperties: false,
                },
              },
            },
            required: ["summary", "focus_items", "sessions"],
            additionalProperties: false,
          },
        },
      },
      provider: {
        require_parameters: true,
      },
      temperature: refinement ? 0.15 : 0.25,
      max_tokens: 2400,
      ...getReasoningConfig(),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${text}`)
  }

  const data = await response.json() as { choices?: { message?: { content?: unknown } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("No structured content in OpenRouter response")
  }

  const result = parseCopilotResponse(content, subjectIds, projectIds, existingDraftIds)
  if (result.sessions.length === 0) {
    throw new Error("Copilot did not return usable study sessions")
  }
  return result
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
  onCreateStudySessions,
}: AssessmentCopilotProps) {
  const [copilotSummary, setCopilotSummary] = useState("")
  const [copilotFocusItems, setCopilotFocusItems] = useState<CopilotFocusItem[]>([])
  const [copilotDrafts, setCopilotDrafts] = useState<CopilotSessionDraft[]>([])
  const [copilotChanges, setCopilotChanges] = useState("")
  const [copilotError, setCopilotError] = useState<string | null>(null)
  const [copilotLoading, setCopilotLoading] = useState(false)
  const [copilotRefining, setCopilotRefining] = useState(false)
  const [copilotApplying, setCopilotApplying] = useState(false)

  const planningSubjectIds = useMemo(() => planningSubjects.map((subject) => subject.id), [planningSubjects])
  const activeProjectIds = useMemo(
    () => projects.filter((project) => !project.isArchived && !project.isFinished).map((project) => project.id),
    [projects],
  )
  const copilotDraftErrors = useMemo(
    () => new Map(copilotDrafts.map((draft) => [draft.draftId, getCopilotDraftErrors(draft, planningSubjectIds, activeProjectIds)])),
    [activeProjectIds, copilotDrafts, planningSubjectIds],
  )
  const approvedValidCopilotDrafts = useMemo(
    () => copilotDrafts.filter((draft) => draft.approved && (copilotDraftErrors.get(draft.draftId)?.length ?? 0) === 0),
    [copilotDraftErrors, copilotDrafts],
  )

  const handleGenerate = async () => {
    const key = getApiKey()
    if (!key) {
      setCopilotError("OpenRouter API key not configured. Set it in Settings.")
      return
    }

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
        apiKey: key,
        model: getModel(),
        currentMonth,
      })
      setCopilotSummary(result.summary)
      setCopilotFocusItems(result.focusItems)
      setCopilotDrafts(result.sessions)
      setCopilotChanges("")
    } catch (e) {
      setCopilotError(e instanceof Error ? e.message : String(e))
    } finally {
      setCopilotLoading(false)
    }
  }

  const handleRefine = async () => {
    const key = getApiKey()
    if (!key) {
      setCopilotError("OpenRouter API key not configured. Set it in Settings.")
      return
    }
    if (!copilotChanges.trim()) {
      setCopilotError("Describe the changes you want AI to apply.")
      return
    }
    if (copilotDrafts.length === 0) {
      setCopilotError("Generate draft sessions before asking AI to change them.")
      return
    }

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
        apiKey: key,
        model: getModel(),
        currentMonth,
        currentDrafts: copilotDrafts,
        refinement: copilotChanges.trim(),
      })
      setCopilotSummary(result.summary)
      setCopilotFocusItems(result.focusItems)
      setCopilotDrafts(result.sessions.map((draft) => ({
        ...draft,
        approved: approvalById.get(draft.draftId) ?? draft.approved,
      })))
      setCopilotChanges("")
    } catch (e) {
      setCopilotError(e instanceof Error ? e.message : String(e))
    } finally {
      setCopilotRefining(false)
    }
  }

  const updateDraft = useCallback(<K extends keyof CopilotSessionDraft>(
    draftId: string,
    key: K,
    value: CopilotSessionDraft[K],
  ) => {
    setCopilotDrafts((current) => current.map((draft) => (
      draft.draftId === draftId ? { ...draft, [key]: value } : draft
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
      setCopilotError("Approve at least one valid study-session draft.")
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
      setCopilotError("The approved drafts could not be converted into study sessions.")
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
      setCopilotError(e instanceof Error ? e.message : String(e))
    } finally {
      setCopilotApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92dvh,54rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle>Assessment Copilot</DialogTitle>
          <DialogDescription>
            Generate a triage plan and editable study-session drafts. Review everything before adding sessions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-5">
          {copilotError && (
            <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {copilotError}
            </p>
          )}

          {!getApiKey() && (
            <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              OpenRouter API key not configured. Go to Settings to set it up.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/35 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Assessment triage</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                Uses current assessments, sessions, readiness, blockers, and prep balance.
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={copilotLoading || copilotRefining || !getApiKey()}
              className="h-8 gap-1.5 rounded-xl"
            >
              {copilotLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {copilotLoading ? "Generating..." : copilotDrafts.length > 0 ? "Regenerate" : "Generate"}
            </Button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.6fr)]">
            <div className="min-h-0 space-y-4 overflow-y-auto">
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
                  disabled={copilotRefining || copilotLoading || !copilotChanges.trim() || copilotDrafts.length === 0 || !getApiKey()}
                  className="mt-3 h-8 gap-1.5 rounded-xl"
                >
                  {copilotRefining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {copilotRefining ? "Applying..." : "Apply AI Changes"}
                </Button>
              </section>
            </div>

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
              </div>

              {copilotDrafts.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
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
                                errors.length > 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300",
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
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={draft.projectId ?? ""}
                                onChange={(event) => handleProjectChange(draft, event.target.value)}
                              >
                                <option value="">No assessment</option>
                                {projects.filter((projectOption) => !projectOption.isArchived && !projectOption.isFinished).map((projectOption) => (
                                  <option key={projectOption.id} value={projectOption.id}>
                                    {projectOption.icon} {projectOption.name}
                                  </option>
                                ))}
                              </select>
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
                </div>
              ) : (
                <div className="flex min-h-60 flex-1 items-center justify-center p-6 text-center">
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
            className="gap-1.5"
          >
            {copilotApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {copilotApplying ? "Adding..." : `Add ${approvedValidCopilotDrafts.length} Session${approvedValidCopilotDrafts.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
