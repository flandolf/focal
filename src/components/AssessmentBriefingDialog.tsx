import { useEffect, useRef, useState } from "react"
import type { Project, StudySession, CalendarEvent, Subject } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AlertCircle, Loader2, Sparkles, Wand2, X } from "lucide-react"
import { cn, formatDeadline, getSubjectById, getSessionEffectiveMinutes } from "@/lib/utils"
import {
  aiStructuredCompletion,
  buildUserBriefing,
  describeAiError,
  VCE_JSON_FORMAT_GUARD,
  VCE_SYSTEM_PREAMBLE,
} from "@/lib/aiAssistant"

/**
 * Briefing is a structured response. Schema enforces per-section presence so
 * the UI can render well-defined cards even when the model degrades; we then
 * recover via `recoverFromModelDrift` upstream via `JsonSchemaSpec`.
 */
interface BriefingResponse {
  headline: string
  readiness: string
  focus_topics: string[]
  suggested_sessions: { title: string; description: string; durationMinutes: number }[]
  recent_progress: string
  blockers: string | null
}

interface AssessmentBriefingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Project
  sessions: StudySession[]
  events: CalendarEvent[]
  subjects: Subject[]
}

export function AssessmentBriefingDialog({
  open,
  onOpenChange,
  project,
  sessions,
  events,
  subjects,
}: AssessmentBriefingDialogProps) {
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      setBriefing(null)
      setError(null)
      setPending(false)
      return
    }

    abortRef.current = new AbortController()
    setPending(true)
    setError(null)

    const subjectLabels = subjects
      .map((s) => `${s.id}: ${s.name} (${s.shortCode})`)
      .join("\n")

    const projectSessions = sessions
      .filter((s) => s.projectId === project.id)
      .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime))
      .slice(0, 15)
    const sessionLines = projectSessions
      .map((s) => {
        const mins = Math.round(getSessionEffectiveMinutes(s))
        const confidence = s.confidence ? `, confidence ${s.confidence}/5` : ""
        const blockers = s.blockers ? `, blockers: ${s.blockers}` : ""
        return `- ${s.title} (${mins}m${confidence}${blockers})`
      })
      .join("\n")

    const linkedEvents = events
      .filter((e) => e.subjectId === project.subjectId)
      .filter((e) => !e.isFinished)
      .slice(0, 8)
      .map((e) => `- ${e.eventType}: ${e.title} on ${e.startTime}`)
      .join("\n")

    const minutesBySubject = new Map<string, number>()
    const sessionsBySubject = new Map<string, number>()
    for (const s of projectSessions) {
      const ids = s.subjectIds?.length ? s.subjectIds : project.subjectId ? [project.subjectId] : []
      const perMin = getSessionEffectiveMinutes(s) / Math.max(ids.length, 1)
      for (const id of ids) {
        minutesBySubject.set(id, (minutesBySubject.get(id) ?? 0) + perMin)
        sessionsBySubject.set(id, (sessionsBySubject.get(id) ?? 0) + 1)
      }
    }
    const subjectStats = Array.from(minutesBySubject.entries())
      .map(([id, mins]) => {
        const subject = getSubjectById(id)
        return `${subject?.shortCode ?? id}: ${Math.round(mins)}m across ${sessionsBySubject.get(id) ?? 0} sessions`
      })
      .join("\n")

    // ponytail: auto-derive a quick snapshot of the student's broader study
    // state so the briefing calibrates to weak subjects + recent
    // low-confidence work. The dialog gets a singular project so we wrap it
    // here; cross-project "other overdue work" context is intentionally
    // dropped to keep the prop signature unchanged for callers.
    const briefingSnapshot = buildUserBriefing({
      projects: [project],
      sessions,
      subjects,
    })

    const system = `${VCE_SYSTEM_PREAMBLE}\n\nWrite a tight, actionable assessment briefing using ONLY the data provided below. If a field is empty, leave it empty or write "None"; never invent.\n\n${briefingSnapshot ? `${briefingSnapshot}\n\n` : ""}Rules:\n- Summary sentences: \u226425 words each.\n- focus_topics: 3-5 concrete topic names, \u22644 words each, no duplicates.\n- suggested_sessions: 2-4 study blocks. Title (3-7 words), description (1 sentence, \u226420 words), durationMinutes (30, 45, 60, 75, 90, 120, 150, or 180).\n- readiness: pick exactly one of "Behind", "On track", "Ready", or "Overprepared".\n- blockers: a single short sentence naming the most pressing gap, or "" if there are none (the schema treats it as a string, not null).\n\n${VCE_JSON_FORMAT_GUARD}`

    const user = `Assessment: ${project.name}
Subject: ${project.subjectId ? getSubjectById(project.subjectId)?.name ?? project.subjectId : "(unassigned)"}
Deadline: ${project.deadline ? formatDeadline(project.deadline) : "(none)"}
Description: ${project.description?.trim() || "(none)"}

Recent study sessions (most recent first):
${sessionLines || "None"}

Linked events on same subject:
${linkedEvents || "None"}

Subject-level study totals:
${subjectStats || "None"}

Subject catalog (id: name (code)):
${subjectLabels || "None"}`

    const schema = {
      type: "object",
      properties: {
        headline: { type: "string" },
        readiness: { type: "string", enum: ["Behind", "On track", "Ready", "Overprepared"] },
        focus_topics: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: { type: "string" },
        },
        suggested_sessions: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              durationMinutes: { type: "number" },
            },
            required: ["title", "description", "durationMinutes"],
            additionalProperties: false,
          },
        },
        recent_progress: { type: "string" },
        blockers: { type: "string" },
      },
      required: ["headline", "readiness", "focus_topics", "suggested_sessions", "recent_progress", "blockers"],
      additionalProperties: false,
    } as const

    void aiStructuredCompletion<BriefingResponse>({
      system,
      user,
      schemaName: "assessment_briefing",
      schema,
      temperature: 0.3,
      maxTokens: 900,
      signal: abortRef.current.signal,
    })
      .then((result) => setBriefing(result))
      .catch((e) => {
        const { message, hint, cancelled } = describeAiError(e)
        if (!cancelled) setError({ message, hint })
      })
      .finally(() => {
        abortRef.current = null
        setPending(false)
      })
  }, [open, project, sessions, events, subjects])

  const cancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setPending(false)
  }

  const readinessClass = (readiness: string) => {
    switch (readiness) {
      case "Behind":
        return "bg-destructive/15 text-destructive"
      case "On track":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      case "Ready":
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      case "Overprepared":
        return "bg-primary/15 text-primary"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85dvh,40rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5 pr-14">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            {project.name} {"\u2014"} Briefing
          </DialogTitle>
          <DialogDescription>
            AI snapshot of where this assessment stands.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <p>{error.message}</p>
                {error.hint && (
                  <p className="mt-0.5 text-destructive/70">{error.hint}</p>
                )}
              </div>
            </div>
          )}

          {pending && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/35 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Composing your briefing{"\u2026"}
            </div>
          )}

          {!pending && briefing && (
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 pr-2">
                <section className="rounded-xl border border-border/60 bg-background/35 p-4">
                  <p className="text-sm font-semibold leading-snug">{briefing.headline}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", readinessClass(briefing.readiness))}>
                      {briefing.readiness}
                    </span>
                  </div>
                </section>

                <section className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Focus topics</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {briefing.focus_topics.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No topics identified.</p>
                    ) : (
                      briefing.focus_topics.map((topic) => (
                        <span
                          key={topic}
                          className="rounded-md bg-muted/65 px-2 py-0.5 text-xs font-medium text-foreground/80"
                        >
                          {topic}
                        </span>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Suggested study blocks</h3>
                  <ul className="space-y-1.5">
                    {briefing.suggested_sessions.map((suggestion, idx) => (
                      <li
                        key={`${suggestion.title}-${idx}`}
                        className="flex items-start gap-2 rounded-lg bg-background/55 px-2.5 py-2"
                      >
                        <span className="mt-0.5 text-micro font-medium tabular-nums text-muted-foreground w-7 shrink-0">
                          {suggestion.durationMinutes}m
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{suggestion.title}</p>
                          <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-micro text-muted-foreground/70">
                    These are suggestions only \u2014 add them from the planner when you're ready.
                  </p>
                </section>

                <section className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-2">
                  <h3 className="text-sm font-semibold">Recent progress</h3>
                  <p className="text-sm text-foreground/85">{briefing.recent_progress}</p>
                  {briefing.blockers && briefing.blockers.trim() && briefing.blockers.trim().toLowerCase() !== "null" && (
                    <p className="rounded-lg bg-destructive/8 px-2.5 py-1.5 text-xs text-destructive">
                      <span className="font-medium">Blocker:</span> {briefing.blockers}
                    </p>
                  )}
                </section>
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {pending && (
            <Button size="sm" variant="ghost" onClick={cancel} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
          {!pending && briefing && (
            <Button
              size="sm"
              variant="default"
              className="gap-1.5 text-background"
              onClick={() => onOpenChange(false)}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Got it
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
