import { useEffect, useMemo, useState } from "react"
import { AlertCircle, CalendarSync, CheckCircle2, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchVcaaExamTimetable, vcaaCandidateToEvent, type VcaaExamCandidate, type VcaaExamParseResult } from "@/lib/vcaa"
import type { CalendarEvent, Subject } from "@/lib/types"

interface VcaaExamImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjects: Subject[]
  events: CalendarEvent[]
  onImport: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
}

function sameOfficialFields(event: CalendarEvent, candidate: VcaaExamCandidate): boolean {
  return event.title === candidate.title && event.startTime === candidate.startTime &&
    event.endTime === candidate.endTime && event.subjectId === candidate.subjectId
}

export function VcaaExamImportDialog({
  open,
  onOpenChange,
  subjects,
  events,
  onImport,
}: VcaaExamImportDialogProps) {
  const [result, setResult] = useState<VcaaExamParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [subjectById, setSubjectById] = useState<Record<string, string | undefined>>({})
  const [extraIds, setExtraIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchVcaaExamTimetable(subjects).then((next) => {
      if (cancelled) return
      setResult(next)
      const relevant = next.exams.filter((exam) => exam.isGat || exam.subjectId)
      setSelectedIds(new Set(relevant.map((exam) => exam.sourceId)))
      setSubjectById(Object.fromEntries(next.exams.map((exam) => [exam.sourceId, exam.subjectId])))
      setExtraIds([])
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, subjects])

  const displayed = useMemo(() => result?.exams.filter((exam) => exam.isGat || exam.subjectId || extraIds.includes(exam.sourceId)) ?? [], [extraIds, result])
  const remaining = useMemo(() => result?.exams.filter((exam) => !displayed.some((item) => item.sourceId === exam.sourceId)) ?? [], [displayed, result])
  const existingBySource = useMemo(() => new Map(events.flatMap((event) => event.source?.type === "vcaa" ? [[event.source.id, event] as const] : [])), [events])
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const toggle = (sourceId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(sourceId)
      else next.delete(sourceId)
      return next
    })
  }

  const handleImport = async () => {
    if (!result) return
    const candidates = displayed.flatMap((candidate) => {
      if (!selectedIds.has(candidate.sourceId)) return []
      const subjectId = subjectById[candidate.sourceId]
      if (!candidate.isGat && !subjectId) return []
      return [{ ...candidate, subjectId }]
    })
    if (candidates.length === 0) {
      setError("Select at least one mapped exam.")
      return
    }
    setApplying(true)
    setError(null)
    try {
      await onImport(candidates.map(vcaaCandidateToEvent))
      toast.success(`${candidates.length} VCAA calendar item${candidates.length === 1 ? "" : "s"} imported`)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(88dvh,46rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
          <DialogTitle>Import VCAA exams</DialogTitle>
          <DialogDescription>Review exact written-exam sessions before adding or refreshing them.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-5 py-4">
            {timezone !== "Australia/Melbourne" && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                VCAA publishes Melbourne times. Your system timezone is {timezone || "unknown"}; verify imported times before applying.
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error} You can still add the exam manually from the calendar.</span>
              </div>
            )}
            {loading && (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Fetching the official timetable…
              </div>
            )}
            {!loading && result && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{result.year} timetable</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {displayed.length} matched item{displayed.length === 1 ? "" : "s"}; oral and performance appointment windows are not imported.
                    </p>
                  </div>
                  {remaining.length > 0 && (
                    <Select value="" onValueChange={(sourceId) => {
                      setExtraIds((current) => [...current, sourceId])
                      setSelectedIds((current) => new Set(current).add(sourceId))
                    }}>
                      <SelectTrigger className="h-8 w-56 text-xs"><Plus className="mr-1.5 h-3.5 w-3.5" /><SelectValue placeholder="Add another exam" /></SelectTrigger>
                      <SelectContent>
                        {remaining.map((exam) => <SelectItem key={exam.sourceId} value={exam.sourceId}>{exam.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="divide-y divide-border/60 rounded-xl border border-border/70">
                  {displayed.map((candidate) => {
                    const existing = existingBySource.get(candidate.sourceId)
                    const mappedSubjectId = subjectById[candidate.sourceId]
                    const possibleDuplicate = events.some((event) => event.source?.type !== "vcaa" && event.eventType === "exam" &&
                      event.subjectId === mappedSubjectId && event.startTime.slice(0, 10) === candidate.startTime.slice(0, 10))
                    const status = existing ? (sameOfficialFields(existing, { ...candidate, subjectId: mappedSubjectId }) ? "Current" : "Changed") : "New"
                    return (
                      <div key={candidate.sourceId} className="flex items-start gap-3 px-3 py-3">
                        <Checkbox
                          checked={selectedIds.has(candidate.sourceId)}
                          onCheckedChange={(checked) => toggle(candidate.sourceId, checked === true)}
                          aria-label={`Import ${candidate.title}`}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-medium">{candidate.title}</p>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">{status}</span>
                            {possibleDuplicate && <span className="text-micro text-warning">Possible manual duplicate</span>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {new Date(candidate.startTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}–{new Date(candidate.endTime).toLocaleTimeString([], { timeStyle: "short" })}
                          </p>
                          {!candidate.isGat && (
                            <Select value={mappedSubjectId ?? ""} onValueChange={(subjectId) => setSubjectById((current) => ({ ...current, [candidate.sourceId]: subjectId }))}>
                              <SelectTrigger className="mt-2 h-8 w-56 text-xs"><SelectValue placeholder="Map to a subject" /></SelectTrigger>
                              <SelectContent>
                                {subjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.shortCode} / {subject.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {status === "Current" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
                      </div>
                    )
                  })}
                </div>
                {result.appointmentWindows.length > 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {result.appointmentWindows.length} oral or performance window{result.appointmentWindows.length === 1 ? " was" : "s were"} found. VCAA provides individual appointment details separately, so Focal does not create placeholder events.
                  </p>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="m-0 shrink-0 items-center justify-between gap-3 rounded-none px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleImport()} disabled={!result || loading || applying} className="gap-1.5 text-background">
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />}
            {applying ? "Applying…" : "Apply selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
