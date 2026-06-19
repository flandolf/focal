import { useEffect, useRef, useState } from "react"
import type { StudySession, Subject, Project } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, NotebookPen, Sparkles, X } from "lucide-react"
import { cn, getSessionEffectiveMinutes } from "@/lib/utils"
import {
  aiChatCompletion,
  describeAiError,
  VCE_SYSTEM_PREAMBLE,
  type ChatTurn,
} from "@/lib/aiAssistant"

/**
 * Reflection summary returned by the model. We use freeform completion (no
 * JSON schema) so the model can write a short natural paragraph; rebuild into
 * the `reflection` / `next_action` strings heuristically via the colon split.
 * ponytail: this is intentional — forcing structured output here would add
 * cost and shape constraints for an answer that humans read as prose.
 */
interface ReflectionDraft {
  reflection: string
  nextAction: string
}

function parseReflection(content: string): ReflectionDraft {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let reflection = content.trim()
  let nextAction = ""
  const actionIdx = lines.findIndex((l) => /^(next\s*action|next\s*step|then:)/i.test(l))
  if (actionIdx >= 0) {
    const reflectionLines = lines.slice(0, actionIdx)
    const actionLines = lines.slice(actionIdx + 1)
    reflection = reflectionLines.join("\n").replace(/^reflection:?\s*/i, "").trim()
    nextAction = actionLines.join(" ").replace(/^next\s*(action|step):?\s*/i, "").trim()
  }
  return { reflection: reflection || content.trim(), nextAction }
}

interface SessionReflectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: StudySession | null
  project: Project | undefined
  subjects: Subject[]
}

export function SessionReflectionDialog({
  open,
  onOpenChange,
  session,
  project,
  subjects,
}: SessionReflectionDialogProps) {
  const [reflection, setReflection] = useState<ReflectionDraft | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      /* eslint-disable react-hooks/set-state-in-effect */
      setReflection(null)
      setError(null)
      setPending(false)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    if (!session) return

    const subjectLabels = (session.subjectIds ?? []).map((id) => {
      const subject = subjects.find((s) => s.id === id)
      return subject ? `${subject.shortCode} (${subject.name})` : id
    })
    const duration = getSessionEffectiveMinutes(session)

    const userContext = [
      `Title: ${session.title}`,
      project ? `Assessment: ${project.name}${project.deadline ? `, due ${project.deadline}` : ""}` : "",
      subjectLabels.length > 0 ? `Subjects: ${subjectLabels.join(", ")}` : "",
      `Duration: ${duration} minutes`,
      `Confidence (1\u20135): ${session.confidence ?? "not set"}`,
      session.blockers ? `Blockers: ${session.blockers}` : "",
      session.description ? `Goal: ${session.description}` : "",
      session.topics?.length ? `Topics: ${session.topics.join(", ")}` : "",
      session.notes ? `Notes (verbatim):\n"""\n${session.notes}\n"""` : "Notes: (none were recorded)",
    ].filter(Boolean).join("\n")

    const system = `${VCE_SYSTEM_PREAMBLE}\n\nYou are writing a short post-study reflection for a VCE student. Given the session context below, write two short paragraphs:\n1. A 2\u20133 sentence "Reflection" summarising what the session covered and any useful signals from their notes.\n2. A 1 sentence "Next action" suggesting the most useful concrete next step (a specific study block, a topic to revise, or a question to follow up on).\nHard limits:\n- Keep it under 90 words total.\n- Do not invent marks, page numbers, or specific rubric language.\n- Reply with EXACTLY the format:\nReflection: <short paragraph>\nNext action: <one sentence>`
    const user = `Session context:\n${userContext}`

    const messages: ChatTurn[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ]

    abortRef.current = new AbortController()
    setPending(true)
    setError(null)
    void aiChatCompletion({
      messages,
      temperature: 0.4,
      maxTokens: 300,
      signal: abortRef.current.signal,
    })
      .then((reply) => setReflection(parseReflection(reply)))
      .catch((e) => {
        const { message, hint, cancelled } = describeAiError(e)
        if (!cancelled) setError({ message, hint })
      })
      .finally(() => {
        abortRef.current = null
        setPending(false)
      })
  }, [open, session, project, subjects])

  const cancel = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setPending(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(85dvh,36rem)] w-[calc(100vw-1rem)] max-w-xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5 pr-14">
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="h-4 w-4 text-primary" />
            Session Reflection
          </DialogTitle>
          <DialogDescription>
            A quick AI summary of what you covered and a suggested next move.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <p className="flex-1">
                <span className="font-medium">{error.message}</span>
                {error.hint && (
                  <span className="mt-0.5 block text-destructive/70">{error.hint}</span>
                )}
              </p>
            </div>
          )}

          {pending && (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/35 px-3 py-2.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Summarising your reflections and notes{"\u2026"}
            </div>
          )}

          {reflection && !pending && (
            <section className="rounded-xl border border-border/60 bg-background/35 p-4 space-y-3">
              <div>
                <p className="text-micro font-medium uppercase tracking-wide text-muted-foreground/70">
                  Reflection
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {reflection.reflection}
                </p>
              </div>
              {reflection.nextAction && (
                <div className="border-t border-border/60 pt-3">
                  <p className="text-micro font-medium uppercase tracking-wide text-muted-foreground/70">
                    Next action
                  </p>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-foreground">
                    {reflection.nextAction}
                  </p>
                </div>
              )}
            </section>
          )}

          {!reflection && !pending && !error && (
            <p className="text-xs text-muted-foreground">
              No notes yet \u2014 record what you covered in the session dialog and reopen reflection.
            </p>
          )}
        </div>

        <DialogFooter className="m-0 shrink-0 border-t px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {pending && (
            <Button
              size="sm"
              variant="ghost"
              onClick={cancel}
              className={cn("gap-1.5")}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
          {!pending && reflection && (
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                // ponytail: copy both bits to the clipboard so the student can
                // paste into their planner; we treat plain errors silently.
                const text = `${reflection.reflection}\n\nNext action: ${reflection.nextAction}`
                if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                  void navigator.clipboard.writeText(text).catch(() => undefined)
                }
              }}
              className="gap-1.5 text-background"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Copy reflection
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
