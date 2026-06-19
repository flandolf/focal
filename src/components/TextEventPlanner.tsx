import { useState, useCallback, useRef } from "react"
import { addMinutes } from "date-fns"
import { AlertCircle, BookOpen, CheckCircle2, ClipboardList, Loader2, Square, SquareCheck, Wand2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getActiveProvider, getEffectiveModel } from "@/lib/providers"
import { getSubjectById, cn, combineDateAndTime, getLocalDateValue } from "@/lib/utils"
import { aiChatCompletion, buildUserBriefing, describeAiError, VCE_JSON_FORMAT_GUARD, type ChatTurn } from "@/lib/aiAssistant"
import type { CalendarEvent, EventType, Project, StudySession, Subject } from "@/lib/types"

// --- Types ---

interface TextEventDraft {
  kind: "event" | "session"
  title: string
  description?: string
  date: string
  endDate?: string
  startTime: string
  durationMinutes: number
  eventType: EventType
  subjectId?: string
  subjectIds: string[]
  projectId?: string
  location?: string
  topics?: string[]
  approved: boolean
}

// --- Constants ---

const VALID_EVENT_TYPES = new Set<EventType>(["sac", "exam", "assignment", "event", "homework", "other", "practice-sac"])
const textareaClass = "min-h-20 resize-none rounded-lg border border-input bg-background/65 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

// --- API / Parsing ---

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function readStringArray(record: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    }
    if (typeof value === "string" && value.trim()) return [value.trim()]
  }
  return []
}

function readNumber(record: Record<string, unknown>, fallback: number, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

function keyText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function compactKey(value: string): string {
  return keyText(value).replace(/\s+/g, "")
}

function resolveSubjectId(raw: string, subjects: Subject[]): string | undefined {
  if (!raw || raw.toLowerCase() === "none") return undefined
  const rawKey = keyText(raw)
  const rawCompact = compactKey(raw)
  for (const subject of subjects) {
    if (
      subject.id === raw ||
      keyText(subject.id) === rawKey ||
      keyText(subject.shortCode) === rawKey ||
      keyText(subject.name) === rawKey ||
      compactKey(subject.shortCode) === rawCompact ||
      compactKey(subject.name) === rawCompact
    ) {
      return subject.id
    }
  }
  const fuzzy = subjects.filter((subject) => {
    const name = keyText(subject.name)
    const code = keyText(subject.shortCode)
    return rawKey.length >= 4 && (name.includes(rawKey) || rawKey.includes(name) || code.includes(rawKey))
  })
  // ponytail: one unambiguous fuzzy subject match is useful; multiple matches
  // stay unresolved so we don't attach sessions to the wrong class.
  return fuzzy.length === 1 ? fuzzy[0].id : undefined
}

function resolveProjectId(raw: string, projects: Project[]): string | undefined {
  if (!raw || raw.toLowerCase() === "none") return undefined
  const rawKey = keyText(raw)
  const exact = projects.find((project) => project.id === raw || keyText(project.name) === rawKey)
  if (exact) return exact.id
  const fuzzy = projects.filter((project) => rawKey.length >= 4 && keyText(project.name).includes(rawKey))
  return fuzzy.length === 1 ? fuzzy[0].id : undefined
}

function normaliseDateValue(value: string): string {
  const trimmed = value.trim()
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  const local = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed)
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
  return trimmed
}

function normaliseTimeValue(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "")
  const ampm = /^(\d{1,2})(?::?(\d{2}))?(am|pm)$/.exec(compact)
  if (ampm) {
    let hours = Number(ampm[1])
    const minutes = Number(ampm[2] ?? "00")
    if (hours === 12) hours = 0
    if (ampm[3] === "pm") hours += 12
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  }
  const time = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(compact)
  if (time) {
    return `${time[1].padStart(2, "0")}:${(time[2] ?? "00").padStart(2, "0")}`
  }
  return value.trim()
}

function coerceItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (typeof parsed !== "object" || parsed === null) return []
  const events = (parsed as { events?: unknown }).events
  // ponytail: 8B local models sometimes return one event object or a bare
  // array even after schema nudging; accept those shallow shapes here.
  if (Array.isArray(events)) return events.flat()
  if (typeof events === "object" && events !== null) return [events]
  return []
}

// eslint-disable-next-line react-refresh/only-export-components
export function parseTextEventResponse(content: string, subjects: Subject[], projects: Project[]): TextEventDraft[] {
  const parsed: unknown = JSON.parse(content)
  if ((typeof parsed !== "object" || parsed === null) && !Array.isArray(parsed)) {
    throw new Error("Invalid planner response")
  }

  const items = coerceItems(parsed)
  if (items.length === 0) {
    throw new Error("Planner response missing events array")
  }

  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const record = item as Record<string, unknown>
    const title = readString(record, "title", "name")
    const date = normaliseDateValue(readString(record, "date", "start_date", "startDate"))
    const endDate = normaliseDateValue(readString(record, "end_date", "endDate")) || undefined
    const startTime = normaliseTimeValue(readString(record, "start_time", "startTime", "time"))
    const durationMinutes = readNumber(record, 60, "duration_minutes", "durationMinutes", "duration", "minutes")
    const itemType = readString(record, "item_type", "itemType", "kind", "type").toLowerCase()
    const kind = itemType === "session" || itemType === "study" || itemType === "study_session" ? "session" : "event"
    const rawEventType = readString(record, "event_type", "eventType").toLowerCase()
    const eventType = VALID_EVENT_TYPES.has(rawEventType as EventType) ? (rawEventType as EventType) : "event"
    const rawSubjectId = readString(record, "subject_id", "subjectId")
    const subjectId = resolveSubjectId(rawSubjectId, subjects)
    const subjectIdsForDraft = readStringArray(record, "subject_ids", "subjectIds", "subjects")
      .flatMap((id) => {
        const resolved = resolveSubjectId(id, subjects)
        return resolved ? [resolved] : []
      })
    const resolvedSubjectIds = subjectIdsForDraft.length > 0
      ? Array.from(new Set(subjectIdsForDraft))
      : subjectId ? [subjectId] : []
    const rawProjectId = readString(record, "project_id", "projectId", "assessment_id", "assessmentId")
    const projectId = resolveProjectId(rawProjectId, projects)
    const description = readString(record, "description", "notes")
    const location = readString(record, "location", "place")
    const topics = readStringArray(record, "topics", "topic")

    if (!title || !date || !startTime || !combineDateAndTime(date, startTime)) return []
    if (endDate && !combineDateAndTime(endDate, startTime)) return []
    if (kind === "session" && resolvedSubjectIds.length === 0) return []

    return [{
      kind,
      title,
      description: description || undefined,
      date,
      endDate: endDate && endDate !== date ? endDate : undefined,
      startTime,
      durationMinutes: Math.min(180, Math.max(15, Math.round(durationMinutes))),
      eventType,
      subjectId,
      subjectIds: resolvedSubjectIds,
      projectId,
      location: location || undefined,
      topics: topics.length > 0 ? topics : undefined,
      approved: true,
    }]
  })
}

async function generateEventsFromText(
  sourceText: string,
  projects: Project[],
  subjects: Subject[],
  model: string,
  signal?: AbortSignal,
): Promise<TextEventDraft[]> {
  // ponytail: validation lives in aiChatCompletion; we just compose the
  // messages here so the chokepoint owns the provider-not-configured case.
  void getActiveProvider()
  // ponytail: small local models (7-13B) can't compute "next Tuesday" from
  // YYYY-MM-DD alone; supplying the weekday anchors their date arithmetic so
  // they don't have to guess timezone or week boundaries.
  const todayDate = new Date()
  const today = getLocalDateValue(todayDate)
  const todayHuman = todayDate.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
  // ponytail: subject ids are listed in the user message below (subjectLines);
  // no JS-side enum list needed after the schema-side enum was removed.
  const activeProjects = projects.filter((project) => !project.isFinished && !project.isArchived).slice(0, 25)
  const projectIds = activeProjects.map((project) => project.id)
  const projectEnum = ["none", ...projectIds]
  const itemTypeEnum = ["event", "session"]
  const modeRules = `- item_type "session" (study/prep/revision/homework) vs "event" (SACs/exams/deadlines/meetings/reminders). Default event_type to "event" for admin items; otherwise pick the closest enum.`
  // ponytail: grounding snapshot — auto-derived active projects + overdue
  // deadlines so the planner can map extracted events/sessions onto existing
  // assessments (project_id matches) rather than guessing. Empty for new users.
  const plannerBriefing = buildUserBriefing({ projects, subjects, sessions: [], today })
  const subjectLines = subjects
    .map((subject) => `${subject.id}: ${subject.name} (${subject.shortCode})`)
    .join("\n")
  const assessmentLines = activeProjects
    .map((project) => {
      const subject = getSubjectById(project.subjectId)
      return [
        `id ${project.id}`,
        project.name,
        project.deadline ? `due ${project.deadline}` : null,
        project.deadlineType ? `type ${project.deadlineType}` : null,
        subject ? `subject ${subject.id}` : null,
      ].filter(Boolean).join(" / ")
    })
    .join("\n")

  // ponytail: small local models collapse on strict 13-key required arrays and
  // need a concrete example shape; the parser already falls back to ""/[] for
  // missing optional fields so the schema can stay lax. The one-shot below
  // is only injected on the Ollama path where it measurably helps 7B-class
  // models conform to native schema enforcement (OpenRouter's larger models
  // don't need it and we avoid burning tokens on them).
  const ollamaOneShot = getActiveProvider().id === "ollama"
    ? `\n\nExample for input "Maths SAC next Tuesday 2pm, 60 min, prepare 1h revision":\n{"events":[{"title":"Maths SAC","item_type":"event","date":"<actual next Tuesday as YYYY-MM-DD — compute it, do not echo this placeholder>","end_date":"","start_time":"14:00","duration_minutes":60,"event_type":"sac","subject_id":"<one subject id from the list, or 'none'>","subject_ids":[],"description":"","location":"","topics":["chapter 5"],"project_id":"none"}]}`
    : ""

  const systemMessage = `Convert school notices, teacher messages, planner notes, and rough text into VCE calendar items.

Today is ${todayHuman} (${today}, ISO YYYY-MM-DD). Use the day-of-week to resolve phrases like "next Tuesday" or "tomorrow" without doing date math.
${plannerBriefing ? `${plannerBriefing}\n` : ""}Return 1-8 useful items.
${modeRules}
- Dates: YYYY-MM-DD (ISO). Times: HH:mm 24-hour. If no time is given, choose after school (~15:30).
- Durations: 15-180 minutes; preserve exact source durations.
- Single-day events use end_date "". Multi-day events set end_date to the inclusive end date.
- Subjects/projects: choose ids only from the lists. Use subject_id "none" for unclear event subjects and project_id "none" when no assessment matches. subject_ids may include multiple subjects; an empty list is fine for events but study sessions need at least one.
- Only title, item_type, date, start_time, duration_minutes, event_type are strictly required. All other keys are optional; default to "" or [] when no value applies.
- Australian input (mention of "next Tuesday", calendar dates like 10/05) reads as DD/MM/YYYY; convert to ISO YYYY-MM-DD in the output.
${VCE_JSON_FORMAT_GUARD}${ollamaOneShot}`

  const userMessage = `Available subjects:
${subjectLines}

Existing active assessments for context:
${assessmentLines || "None"}

Text to convert:
"""
${sourceText}
"""`

  const schema = {
    type: "object",
    properties: {
      events: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            item_type: { type: "string", enum: itemTypeEnum },
            date: { type: "string", description: "YYYY-MM-DD" },
            end_date: { type: "string", description: "YYYY-MM-DD for multi-day events; empty string for single-day events." },
            start_time: { type: "string", description: "HH:mm in 24-hour time" },
            duration_minutes: { type: "number" },
            event_type: {
              type: "string",
              enum: ["sac", "exam", "assignment", "event", "homework", "other", "practice-sac"],
            },
            subject_id: { type: "string", description: "One subject id from the available list above, or 'none'. Approximate names (e.g. \"Maths\") that match a list entry are fine." },
            subject_ids: { type: "array", items: { type: "string", description: "Subject ids from the available list; empty array when not assignable." } },
            project_id: { type: "string", enum: projectEnum, description: "One active assessment id, or none." },
            location: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
          },
          required: ["title", "item_type", "date", "start_time", "duration_minutes", "event_type"],
          additionalProperties: false,
        },
      },
    },
    required: ["events"],
    additionalProperties: false,
  } as const

  const baseMessages: ChatTurn[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ]
  const content = await aiChatCompletion({
    model,
    messages: baseMessages,
    jsonSchema: { name: "text_calendar_events", strict: true, schema },
    temperature: 0.1,
    maxTokens: 1200,
    ...(signal ? { signal } : {}),
  })

  return parseUsableTextEventDrafts(content, subjects, activeProjects)
}

function parseUsableTextEventDrafts(content: string, subjects: Subject[], projects: Project[]): TextEventDraft[] {
  const drafts = parseTextEventResponse(content, subjects, projects)

  if (drafts.length === 0) {
    throw new Error("Planner did not return usable events")
  }
  return drafts
}

// --- Component ---

interface TextEventPlannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  initialText: string
  projects: Project[]
  planningSubjects: Subject[]
  onCreateEvents: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
  onCreateStudySessions: (sessions: Omit<StudySession, "id" | "status" | "created_at">[]) => Promise<void>
}

export function TextEventPlanner({
  open,
  onOpenChange,
  title,
  description,
  initialText,
  projects,
  planningSubjects,
  onCreateEvents,
  onCreateStudySessions,
}: TextEventPlannerProps) {
  const [plannerText, setPlannerText] = useState(initialText)
  const [plannerDrafts, setPlannerDrafts] = useState<TextEventDraft[]>([])
  const [plannerLoading, setPlannerLoading] = useState(false)
  const [plannerApplying, setPlannerApplying] = useState(false)
  const [plannerError, setPlannerError] = useState<{ message: string; hint: string | null } | null>(null)
  const plannerAbortRef = useRef<AbortController | null>(null)

  const approvedCount = plannerDrafts.filter((draft) => draft.approved).length
  const hasDrafts = plannerDrafts.length > 0
  const allApproved = hasDrafts && approvedCount === plannerDrafts.length

  const cancelPlannerRequest = useCallback(() => {
    plannerAbortRef.current?.abort()
    plannerAbortRef.current = null
  }, [])

  const handleGenerate = useCallback(async () => {
    const provider = getActiveProvider()
    if (!provider.isConfigured()) {
      setPlannerError({
        message: `${provider.displayName} is not configured.`,
        hint: "Open Settings \u2192 AI to choose and configure a provider.",
      })
      return
    }
    if (!plannerText.trim()) {
      setPlannerError({ message: "Paste text to convert into events.", hint: null })
      return
    }

    plannerAbortRef.current = new AbortController()
    setPlannerLoading(true)
    setPlannerError(null)
    try {
      const drafts = await generateEventsFromText(
        plannerText.trim(),
        projects,
        planningSubjects,
        getEffectiveModel(),
        plannerAbortRef.current.signal,
      )
      setPlannerDrafts(drafts)
    } catch (e) {
      const { message, hint, cancelled } = describeAiError(e)
      if (cancelled) return
      setPlannerError({ message, hint })
    } finally {
      plannerAbortRef.current = null
      setPlannerLoading(false)
    }
  }, [plannerText, projects, planningSubjects])

  const handleToggleDraft = useCallback((index: number) => {
    setPlannerDrafts((current) => current.map((draft, idx) => (
      idx === index ? { ...draft, approved: !draft.approved } : draft
    )))
  }, [])

  const handleToggleAll = useCallback(() => {
    setPlannerDrafts((current) => current.map((draft) => ({ ...draft, approved: !allApproved })))
  }, [allApproved])

  const handleApply = useCallback(async () => {
    const approvedDrafts = plannerDrafts.filter((draft) => draft.approved)
    if (approvedDrafts.length === 0) return

    const eventItems = approvedDrafts.flatMap((draft) => {
      if (draft.kind !== "event") return []
      const start = combineDateAndTime(draft.date, draft.startTime)
      if (!start) return []
      let end: Date
      if (draft.endDate) {
        // Multi-day event: end time on end date = same start time
        const endDateWithTime = combineDateAndTime(draft.endDate, draft.startTime)
        end = endDateWithTime ?? addMinutes(start, draft.durationMinutes)
      } else {
        end = addMinutes(start, draft.durationMinutes)
      }
      return [{
        title: draft.title,
        description: draft.description,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        eventType: draft.eventType,
        subjectId: draft.subjectId,
        location: draft.location,
      }]
    })
    const sessionItems = approvedDrafts.flatMap((draft) => {
      if (draft.kind !== "session") return []
      const start = combineDateAndTime(draft.date, draft.startTime)
      if (!start) return []
      const end = addMinutes(start, draft.durationMinutes)
      return [{
        projectId: draft.projectId,
        subjectIds: draft.subjectIds,
        title: draft.title,
        description: draft.description,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        topics: draft.topics,
        notes: draft.location ? `Location: ${draft.location}` : undefined,
      }]
    })

    if (eventItems.length === 0 && sessionItems.length === 0) {
      setPlannerError({ message: "The generated dates could not be converted into calendar items.", hint: null })
      return
    }

    setPlannerApplying(true)
    setPlannerError(null)
    try {
      if (eventItems.length > 0) {
        await onCreateEvents(eventItems)
      }
      if (sessionItems.length > 0) {
        await onCreateStudySessions(sessionItems)
      }
      onOpenChange(false)
      setPlannerDrafts([])
      setPlannerText("")
    } catch (e) {
      setPlannerError({ message: describeAiError(e).message, hint: null })
    } finally {
      setPlannerApplying(false)
    }
  }, [onCreateEvents, onCreateStudySessions, plannerDrafts, onOpenChange])

  const apiMissing = !getActiveProvider().isConfigured()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88dvh,48rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pr-14 pt-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
          {plannerError && (
            <div className="flex shrink-0 items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <p>{plannerError.message}</p>
                {plannerError.hint && (
                  <p className="mt-0.5 text-destructive/70">{plannerError.hint}</p>
                )}
              </div>
            </div>
          )}

          {apiMissing && (
            <p className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {`${getActiveProvider().displayName} is not configured. Go to Settings to set it up.`}
            </p>
          )}

          <div className="grid shrink-0 gap-2">
            <label className="text-control font-medium text-muted-foreground" htmlFor="text-event-planner-input">Source text</label>
            <textarea
              id="text-event-planner-input"
              value={plannerText}
              onChange={(event) => setPlannerText(event.target.value)}
              placeholder="Paste dates, tasks, teacher notes, or a weekly plan..."
              rows={4}
              className={textareaClass}
            />
            <p className="text-xs text-muted-foreground/70">AI extracts events, SACs, study sessions, and deadlines.</p>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3">
            <div className="min-w-0">
              {hasDrafts && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {approvedCount} of {plannerDrafts.length} selected
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {plannerLoading && (
                <Button
                  onClick={cancelPlannerRequest}
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 rounded-xl text-xs"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              )}
              <Button
                onClick={handleGenerate}
                disabled={plannerLoading || !plannerText.trim() || apiMissing}
                size="sm"
                className="gap-1.5 text-background"
              >
                {plannerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {plannerLoading ? "Generating..." : "Generate Drafts"}
              </Button>
            </div>
          </div>

          {hasDrafts && (
            <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border/60">
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={handleToggleAll}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                  aria-label={allApproved ? "Deselect all" : "Select all"}
                >
                  {allApproved
                    ? <SquareCheck className="h-3 w-3 text-primary" />
                    : <Square className="h-3 w-3 text-muted-foreground/50" />}
                </button>
                <span className="text-xs font-medium text-muted-foreground">
                  {allApproved ? "All selected" : `${approvedCount} of ${plannerDrafts.length}`}
                </span>
              </div>

              <div className="divide-y divide-border/50">
                {plannerDrafts.map((draft, index) => {
                  const subject = getSubjectById(draft.subjectId)
                  const sessionSubjects = draft.subjectIds
                    .map((subjectId) => getSubjectById(subjectId))
                    .filter((item): item is Subject => Boolean(item))

                  return (
                    <div
                      key={`${draft.title}-${draft.date}-${draft.startTime}`}
                      className={cn(
                        "flex items-center gap-3 bg-background/40 px-3 py-2.5 transition-opacity",
                        !draft.approved && "opacity-40",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleDraft(index)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center"
                        aria-label={draft.approved ? "Deselect" : "Select"}
                      >
                        {draft.approved
                          ? <SquareCheck className="h-3.5 w-3.5 text-primary" />
                          : <Square className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{draft.title}</p>
                          {draft.kind === "session" ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
                              <BookOpen className="h-2.5 w-2.5" />
                              Study
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 rounded-md bg-muted/60 px-1.5 py-0.5 text-micro font-medium capitalize text-muted-foreground">
                              {draft.eventType}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {draft.kind === "event" && subject && (
                            <span
                              className="rounded-md px-1.5 py-0.5 text-micro font-medium"
                              style={{ backgroundColor: subject.color + "18", color: subject.color }}
                            >
                              {subject.shortCode}
                            </span>
                          )}
                          {draft.kind === "session" && sessionSubjects.slice(0, 2).map((sessionSubject) => (
                            <span
                              key={sessionSubject.id}
                              className="rounded-md px-1.5 py-0.5 text-micro font-medium"
                              style={{ backgroundColor: sessionSubject.color + "18", color: sessionSubject.color }}
                            >
                              {sessionSubject.shortCode}
                            </span>
                          ))}
                          {draft.location && (
                            <span className="max-w-36 truncate text-micro text-muted-foreground">
                              {draft.location}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end text-right">
                        <p className="text-xs font-medium tabular-nums text-foreground/80">
                          {draft.endDate ? `${draft.date} – ${draft.endDate}` : draft.date}
                        </p>
                        <p className="mt-0.5 text-micro tabular-nums text-muted-foreground">
                          {draft.startTime} · {draft.durationMinutes}m
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}

          {plannerLoading && (
            <div className="min-h-0 flex-1 space-y-0 overflow-hidden rounded-lg border border-border/60">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 border-b border-border/40 bg-background/40 px-3 py-3 last:border-b-0">
                  <div className="h-3.5 w-3.5 shrink-0 animate-pulse rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/60" />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="h-3 w-14 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-10 animate-pulse rounded bg-muted/60" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!hasDrafts && !plannerLoading && (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/40">
                  <ClipboardList className="h-5 w-5 text-muted-foreground/60" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Paste text to get started</p>
                  <p className="max-w-64 text-xs leading-relaxed text-muted-foreground/70">
                    School notices, teacher messages, rough plans, or weekly schedules. AI will extract what matters.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 rounded-none border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={plannerApplying || approvedCount === 0}
            className="gap-1.5 text-background"
          >
            {plannerApplying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {plannerApplying ? "Adding..." : `Add ${approvedCount} Item${approvedCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
