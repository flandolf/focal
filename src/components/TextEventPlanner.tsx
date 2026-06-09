import { useState, useCallback } from "react"
import { addMinutes } from "date-fns"
import { AlertCircle, BookOpen, CheckCircle2, ClipboardList, Loader2, Square, SquareCheck, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getApiKey, getModel, getReasoningConfig } from "@/lib/settings"
import { getSubjectById, cn, combineDateAndTime, getLocalDateValue } from "@/lib/utils"
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
function parseTextEventResponse(content: string, subjectIds: string[], projectIds: string[]): TextEventDraft[] {
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid planner response")
  }

  const items = (parsed as { events?: unknown }).events
  if (!Array.isArray(items)) {
    throw new Error("Planner response missing events array")
  }

  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const record = item as Record<string, unknown>
    const title = typeof record.title === "string" ? record.title.trim() : ""
    const date = typeof record.date === "string" ? record.date.trim() : ""
    const endDate = typeof record.end_date === "string" ? record.end_date.trim() : undefined
    const startTime = typeof record.start_time === "string" ? record.start_time.trim() : ""
    const durationMinutes = typeof record.duration_minutes === "number" ? record.duration_minutes : 60
    const kind = record.item_type === "session" ? "session" : "event"
    const eventType = VALID_EVENT_TYPES.has(record.event_type as EventType) ? (record.event_type as EventType) : "event"
    const subjectId = typeof record.subject_id === "string" && subjectIds.includes(record.subject_id)
      ? record.subject_id
      : undefined
    const subjectIdsForDraft = Array.isArray(record.subject_ids)
      ? record.subject_ids.filter((id): id is string => typeof id === "string" && subjectIds.includes(id))
      : subjectId ? [subjectId] : []
    const projectId = typeof record.project_id === "string" && projectIds.includes(record.project_id)
      ? record.project_id
      : undefined

    if (!title || !date || !startTime) return []
    if (kind === "session" && subjectIdsForDraft.length === 0) return []

    return [{
      kind,
      title,
      description: typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : undefined,
      date,
      endDate: endDate && endDate !== date ? endDate : undefined,
      startTime,
      durationMinutes: Math.min(180, Math.max(15, Math.round(durationMinutes))),
      eventType,
      subjectId,
      subjectIds: subjectIdsForDraft,
      projectId,
      location: typeof record.location === "string" && record.location.trim()
        ? record.location.trim()
        : undefined,
      topics: Array.isArray(record.topics)
        ? record.topics.filter((topic): topic is string => typeof topic === "string" && topic.trim().length > 0).map((topic) => topic.trim())
        : undefined,
      approved: true,
    }]
  })
}

async function generateEventsFromText(
  sourceText: string,
  projects: Project[],
  subjects: Subject[],
  apiKey: string,
  model: string,

): Promise<TextEventDraft[]> {
  const today = getLocalDateValue(new Date())
  const subjectIds = subjects.map((subject) => subject.id)
  const subjectEnum = ["none", ...subjectIds]
  const activeProjects = projects.filter((project) => !project.isFinished).slice(0, 40)
  const projectIds = activeProjects.map((project) => project.id)
  const projectEnum = ["none", ...projectIds]
  const itemTypeEnum = ["event", "session"]
  const modeRules = `- Use item_type "session" for study blocks, revision plans, homework blocks, practice tasks, or prep work.
- Use item_type "event" for real calendar events, due dates, SACs, exams, assignments, meetings, or reminders.
- Use event_type "sac", "exam", "practice-sac", "homework", "other", "assignment" only for real assessment/homework items; use "event" for reminders, meetings, or admin tasks.`
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
          content: `You convert pasted school notices, teacher messages, planner notes, and rough text into practical calendar events and study sessions for a VCE student.

Rules:
- Today is ${today}; use this date to resolve relative dates.
- Return 1 to 8 useful items.
${modeRules}
- Use 24-hour start_time in HH:mm format.
- Use durations from 15 to 180 minutes. Preserve exact odd durations when the source gives them.
- If the source text has no time, choose a reasonable after-school time.
- Use subject_id "none" when the subject is unclear for an event.
- Study sessions must include at least one concrete subject id in subject_ids.
- Use project_id when a study session clearly supports an existing active assessment; otherwise use "none".
- Prefer concise titles that fit in a calendar cell.
- For events spanning multiple days (e.g. a 3-day camp, multi-day exam block, or week-long event), set end_date to the last day in YYYY-MM-DD format. Omit end_date for single-day events. When end_date is set, start_time applies to the start date and the event continues through end_date.`,
        },
        {
          role: "user",
          content: `Available subjects:
${subjectLines}

Existing active assessments for context:
${assessmentLines || "None"}

Text to convert:
"""
${sourceText}
"""`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "text_calendar_events",
          strict: true,
          schema: {
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
                    item_type: {
                      type: "string",
                      enum: itemTypeEnum,
                    },
                    date: { type: "string", description: "YYYY-MM-DD" },
                    end_date: { type: "string", description: "YYYY-MM-DD — end date for multi-day events. Omit or set same as date for single-day events." },
                    start_time: { type: "string", description: "HH:mm in 24-hour time" },
                    duration_minutes: { type: "number" },
                    event_type: {
                      type: "string",
                      enum: ["sac", "exam", "assignment", "event", "homework", "other", "practice-sac"],
                    },
                    subject_id: {
                      type: "string",
                      enum: subjectEnum,
                    },
                    subject_ids: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: subjectIds,
                      },
                    },
                    project_id: {
                      type: "string",
                      enum: projectEnum,
                    },
                    location: { type: "string" },
                    topics: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["title", "description", "item_type", "date", "start_time", "duration_minutes", "event_type", "subject_id", "subject_ids", "project_id", "location", "topics"],
                  additionalProperties: false,
                },
              },
            },
            required: ["events"],
            additionalProperties: false,
          },
        },
      },
      provider: {
        require_parameters: true,
      },
      temperature: 0.2,
      max_tokens: 1800,
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

  const drafts = parseTextEventResponse(content, subjectIds, projectIds)

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
  const [plannerError, setPlannerError] = useState<string | null>(null)

  const approvedCount = plannerDrafts.filter((draft) => draft.approved).length
  const hasDrafts = plannerDrafts.length > 0
  const allApproved = hasDrafts && approvedCount === plannerDrafts.length

  const handleGenerate = useCallback(async () => {
    const key = getApiKey()
    if (!key) {
      setPlannerError("OpenRouter API key not configured. Set it in Settings.")
      return
    }
    if (!plannerText.trim()) {
      setPlannerError("Paste text to convert into events.")
      return
    }

    setPlannerLoading(true)
    setPlannerError(null)
    try {
      const drafts = await generateEventsFromText(plannerText.trim(), projects, planningSubjects, key, getModel())
      setPlannerDrafts(drafts)
    } catch (e) {
      setPlannerError(e instanceof Error ? e.message : String(e))
    } finally {
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
      setPlannerError("The generated dates could not be converted into calendar items.")
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
      setPlannerError(e instanceof Error ? e.message : String(e))
    } finally {
      setPlannerApplying(false)
    }
  }, [onCreateEvents, onCreateStudySessions, plannerDrafts, onOpenChange])

  const apiMissing = !getApiKey()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88dvh,48rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pr-14 pt-5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
          {plannerError && (
            <p className="flex shrink-0 items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {plannerError}
            </p>
          )}

          {apiMissing && (
            <p className="flex shrink-0 items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              OpenRouter API key not configured. Go to Settings to set it up.
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

          {hasDrafts && (
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
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
            </div>
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
