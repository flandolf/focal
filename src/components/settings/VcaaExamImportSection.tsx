import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, CalendarSync, CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchVcaaExamTimetable, vcaaCandidateToEvent, type VcaaExamCandidate, type VcaaExamParseResult } from "@/lib/vcaa"
import type { CalendarEvent, Subject } from "@/lib/types"

interface VcaaExamImportSectionProps {
  subjects: Subject[]
  hiddenSubjectIds: string[]
  events: CalendarEvent[]
  onImport: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
}

function sameOfficialFields(event: CalendarEvent, candidate: VcaaExamCandidate): boolean {
  return event.title === candidate.title && event.startTime === candidate.startTime &&
    event.endTime === candidate.endTime && event.subjectId === candidate.subjectId
}

export function VcaaExamImportSection({
  subjects,
  hiddenSubjectIds,
  events,
  onImport,
}: VcaaExamImportSectionProps) {
  const activeSubjects = useMemo(
    () => subjects.filter((subject) => !hiddenSubjectIds.includes(subject.id)),
    [hiddenSubjectIds, subjects],
  )
  const [result, setResult] = useState<VcaaExamParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [subjectById, setSubjectById] = useState<Record<string, string | undefined>>({})
  const [extraIds, setExtraIds] = useState<string[]>([])

  const loadTimetable = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchVcaaExamTimetable(activeSubjects)
      setResult(next)
      const relevant = next.exams.filter((exam) => exam.isGat || exam.subjectId !== undefined)
      setSelectedIds(new Set(relevant.map((exam) => exam.sourceId)))
      setSubjectById(Object.fromEntries(next.exams.map((exam) => [exam.sourceId, exam.subjectId])))
      setExtraIds([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [activeSubjects])

  useEffect(() => {
    // The timetable is an external resource; load it when this settings section mounts or its subject scope changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTimetable()
  }, [loadTimetable])

  const displayed = useMemo(
    () => result?.exams.filter((exam) => exam.isGat || exam.subjectId !== undefined || extraIds.includes(exam.sourceId)) ?? [],
    [extraIds, result],
  )
  const remaining = useMemo(
    () => result?.exams.filter((exam) => !displayed.some((item) => item.sourceId === exam.sourceId)) ?? [],
    [displayed, result],
  )
  const existingBySource = useMemo(
    () => new Map(events.flatMap((event) => event.source?.type === "vcaa" ? [[event.source.id, event] as const] : [])),
    [events],
  )
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setApplying(false)
    }
  }

  return (
    <section className="rounded-xl border border-border/70 bg-background/40 p-5 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">VCAA exam timetable</h2>
          <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
            Review exact written exams before adding or refreshing them in your calendar. Your visible subjects are selected by default.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadTimetable()} disabled={loading || applying} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5${loading ? " animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="mt-4 space-y-4">
        {timezone !== "Australia/Melbourne" && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            VCAA publishes Melbourne times. Your system timezone is {timezone ?? "unknown"}; verify imported times before applying.
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error} You can still add the exam manually from the calendar.</span>
          </div>
        )}
        {loading && (
          <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
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
                            {activeSubjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.shortCode} / {subject.name}</SelectItem>)}
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
            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button onClick={() => void handleImport()} disabled={!result || applying} className="gap-1.5 text-background">
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarSync className="h-4 w-4" />}
                {applying ? "Applying…" : "Apply selected"}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
