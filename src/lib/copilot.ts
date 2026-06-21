import { format, parseISO } from "date-fns"
import { getReasoningConfig } from "@/lib/settings"
import { getActiveProvider } from "@/lib/providers"
import { VCE_JSON_FORMAT_GUARD, VCE_SYSTEM_PREAMBLE, buildUserBriefing } from "@/lib/aiAssistant"
import { getSubjectById, getSessionSubjectIds, getLocalDateValue } from "@/lib/utils"
import type { CalendarEvent, PriorityItem, PriorityUrgency, Project, StudySession, Subject } from "@/lib/types"
import type { AvailableStudyInterval, PrepBalanceItem } from "@/lib/planning"

// --- Types ---

export interface CopilotFocusItem {
  title: string
  reason: string
  urgency: PriorityUrgency
  projectId?: string
  subjectIds: string[]
  nextAction: string
}

export interface CopilotSessionDraft {
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

export interface CopilotResult {
  summary: string
  focusItems: CopilotFocusItem[]
  sessions: CopilotSessionDraft[]
}

// --- Constants ---

export const VALID_URGENCIES = new Set<PriorityUrgency>(["critical", "high", "medium", "low"])

// --- Helpers ---

export function clampCopilotDuration(value: unknown): number {
  const duration = typeof value === "number" && Number.isFinite(value) ? value : 60
  return Math.min(180, Math.max(30, Math.round(duration / 15) * 15))
}

export function splitCopilotTopics(value: string): string[] {
  return value.split(",").map((topic) => topic.trim()).filter(Boolean)
}

export function formatCopilotDateTime(value?: string) {
  if (!value) return "no date"
  const date = parseISO(value)
  return Number.isNaN(date.getTime()) ? value : format(date, "yyyy-MM-dd HH:mm")
}

// --- Response Parsing ---

export function parseCopilotResponse(
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

// --- API Call ---

export async function generateAssessmentCopilotPlan({
  projects,
  sessions,
  events,
  priorityItems,
  prepBalanceItems,
  subjects,
  model,
  currentMonth,
  availableIntervals,
  currentDrafts,
  refinement,
  signal,
}: {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  priorityItems: PriorityItem[]
  prepBalanceItems: PrepBalanceItem[]
  subjects: Subject[]
  model: string
  currentMonth: Date
  availableIntervals: AvailableStudyInterval[]
  currentDrafts?: CopilotSessionDraft[]
  refinement?: string
  /** Optional cancellation handle. Forwarded to `provider.chatCompletion`. */
  signal?: AbortSignal
}): Promise<CopilotResult> {
  const provider = getActiveProvider()
  if (!provider.isConfigured()) {
    throw new Error(`${provider.displayName} is not configured. Set it up in Settings.`)
  }

  const today = getLocalDateValue(new Date())
  const planningEnd = getLocalDateValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  const subjectIds = subjects.map((subject) => subject.id)
  const activeProjects = projects.filter((project) => !project.isArchived && !project.isFinished).slice(0, 40)
  const projectIds = activeProjects.map((project) => project.id)
  const projectEnum = ["none", ...projectIds]
  const existingDraftIds = new Set(currentDrafts?.map((draft) => draft.draftId) ?? [])
  const activeProjectById = new Map(activeProjects.map((project) => [project.id, project]))

  // ponytail: grounding snapshot — auto-derived from the student's projects,
  // sessions, and subject coverage so the model plans around overdue work
  // and weak topics without us having to hand-curate it per call. Empty
  // string for brand-new users so the section drops cleanly.
  const copilotBriefing = buildUserBriefing({ projects, sessions, subjects, today })

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
  const availabilityLines = availableIntervals.map((interval) =>
    `${interval.date}: ${formatCopilotDateTime(interval.startTime)}-${formatCopilotDateTime(interval.endTime)} / ${interval.availableMinutes}m free / ${interval.dailyRemainingMinutes}m daily cap remaining`).join("\n")

  const systemMessage = `${VCE_SYSTEM_PREAMBLE}\n\n${copilotBriefing ? `${copilotBriefing}\n\n` : ""}Rules:\n- Today is ${today}; use it to resolve relative timing.\n- Create study sessions only. Do not create normal calendar events, deadlines, SACs, exams, assignments, or reminders.\n- Schedule sessions from ${today} through ${planningEnd} unless the user's refinement explicitly asks for another date range.\n- Every draft must fit completely inside one supplied free study interval. Never overlap drafts or exceed that day's remaining cap.\n- Prefer urgent assessments, weak topics, blockers, low-confidence completed sessions, and low planned prep time.\n- Return 2 to 5 practical study-session drafts.\n- Use 24-hour start_time in HH:mm format.\n- Use durations from 30 to 180 minutes in 15-minute increments.\n- Every session must include at least one concrete subject id in subject_ids.\n- Use project_id when a session clearly supports an existing active assessment; otherwise use "none".\n- If a refinement is provided, treat the current edited drafts as the source of truth and apply ONLY the requested changes \u2014 do not silently rewrite preserved drafts.\n- Keep summary and focus items concise.\n\n${VCE_JSON_FORMAT_GUARD}`

  const userMessage = `${refinement ? `Refinement request:\n"""\n${refinement}\n"""\n\nCurrent edited drafts:\n${currentDraftLines ?? "None"}\n\n` : ""}Free study intervals (the only allowed times):\n${availabilityLines || "None"}\n\nAvailable subjects:\n${subjectLines}\n\nActive assessments:\n${assessmentLines || "None"}\n\nAssessment priority items:\n${priorityLines || "None"}\n\nPrep balance for ${format(currentMonth, "MMMM yyyy")}:\n${prepLines || "None"}\n\nRelevant sessions:\n${sessionLines || "None"}\n\nUpcoming assessment events:\n${eventLines || "None"}`

  const schema = {
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
  } as const

  const reasoning = getReasoningConfig().reasoning ?? undefined

  const result = await provider.chatCompletion({
    model,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    jsonSchema: { name: "assessment_copilot_plan", strict: true, schema },
    temperature: refinement ? 0.15 : 0.25,
    maxTokens: 2400,
    reasoning,
    ...(signal ? { signal } : {}),
  })

  const parsed = parseCopilotResponse(result.content, subjectIds, projectIds, existingDraftIds)
  if (parsed.sessions.length === 0) {
    throw new Error("Copilot did not return usable study sessions")
  }
  return parsed
}
