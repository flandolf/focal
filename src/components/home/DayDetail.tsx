import { format, parseISO } from "date-fns"
import { X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDeadline, getSubjectById, getEventTypeInfo, getSessionSubjectIds, cn } from "@/lib/utils"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"

function formatTimeRange(startTime: string, endTime?: string) {
  const startLabel = format(parseISO(startTime), "h:mm a")
  if (!endTime) return startLabel
  return `${startLabel} - ${format(parseISO(endTime), "h:mm a")}`
}

interface DayDetailProps {
  selectedDate: string
  deadlines: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  projects: Project[]
  calendarSelectionMode: boolean
  selectedEventIdSet: Set<string>
  selectedSessionIdSet: Set<string>
  onClose: () => void
  onToggleSelectionMode: () => void
  onClearSelection: () => void
  onToggleEventSelection: (eventId: string) => void
  onToggleSessionSelection: (sessionId: string) => void
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: StudySession) => void
  onSelectEvent: (event: CalendarEvent) => void
}

export function DayDetail({
  selectedDate,
  deadlines,
  sessions,
  events,
  projects,
  calendarSelectionMode,
  selectedEventIdSet,
  selectedSessionIdSet,
  onClose,
  onToggleSelectionMode,
  onClearSelection,
  onToggleEventSelection,
  onToggleSessionSelection,
  onSelectProject,
  onSelectSession,
  onSelectEvent,
}: DayDetailProps) {
  const hasItems = deadlines.length > 0 || sessions.length > 0 || events.length > 0

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/18 p-3 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {format(parseISO(selectedDate), "EEEE")}
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {format(parseISO(selectedDate), "MMMM d")}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {(events.length > 0 || sessions.length > 0) && (
            <Button
              variant={calendarSelectionMode ? "secondary" : "ghost"}
              size="sm"
              className="h-7 rounded-lg px-2 text-xs"
              onClick={() => {
                if (calendarSelectionMode) {
                  onClearSelection()
                  return
                }
                onToggleSelectionMode()
              }}
            >
              {calendarSelectionMode ? "Cancel" : "Select"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-lg p-0"
            onClick={onClose}
            aria-label="Close selected day"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg bg-background/42 px-2 py-1.5">
          <p className="text-xs font-semibold tabular-nums">{deadlines.length}</p>
          <p className="text-micro leading-3 text-muted-foreground">due</p>
        </div>
        <div className="rounded-lg bg-background/42 px-2 py-1.5">
          <p className="text-xs font-semibold tabular-nums">{events.length}</p>
          <p className="text-micro leading-3 text-muted-foreground">events</p>
        </div>
        <div className="rounded-lg bg-background/42 px-2 py-1.5">
          <p className="text-xs font-semibold tabular-nums">{sessions.length}</p>
          <p className="text-micro leading-3 text-muted-foreground">sessions</p>
        </div>
      </div>
      {calendarSelectionMode && (
        <div className="mb-2 rounded-xl border border-primary/20 bg-primary/8 px-2.5 py-2">
          <p className="text-micro font-medium text-primary">
            Pick events or sessions below. Actions appear at the bottom of the window.
          </p>
        </div>
      )}

      {hasItems ? (
        <div className="space-y-2">
          {deadlines.map((p) => {
            const subject = getSubjectById(p.subjectId)
            return (
              <button
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className="w-full rounded-xl border border-border/70 bg-background/30 p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{p.icon} {p.name}</p>
                    <p className="text-micro text-muted-foreground mt-0.5">
                      {formatDeadline(p.deadline!)}
                    </p>
                  </div>
                  {subject && (
                    <div
                      className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium shrink-0"
                      style={{
                        backgroundColor: subject.color + "18",
                        color: subject.color,
                      }}
                    >
                      {subject.shortCode}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
          {sessions.map((s) => {
            const project = projects.find((p) => p.id === s.projectId)
            const subjects = getSessionSubjectIds(s, project)
              .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
              .join(", ")
            const selected = selectedSessionIdSet.has(s.id)
            return (
              <button
                key={s.id}
                onClick={() => {
                  if (calendarSelectionMode) {
                    onToggleSessionSelection(s.id)
                    return
                  }
                  onSelectSession(s)
                }}
                className={cn(
                  "w-full rounded-xl border p-2 text-left transition-colors",
                  selected
                    ? "border-primary/65 bg-primary/10 ring-1 ring-primary/25"
                    : "border-blue-200/40 bg-blue-50/20 hover:border-blue-400/60 dark:border-blue-900/40 dark:bg-blue-950/20"
                )}
              >
                <div className="flex items-start gap-2">
                  {calendarSelectionMode && (
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background/50"
                      )}
                      aria-hidden="true"
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-medium">{s.title}</p>
                      {s.status === "completed" && (
                        <span className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                          Done
                        </span>
                      )}
                    </div>
                    <p className="text-micro text-muted-foreground mt-0.5">
                      {project?.name ?? subjects}
                    </p>
                    <p className="text-micro text-muted-foreground mt-1">
                      {formatTimeRange(s.startTime, s.endTime)}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
          {events.map((event) => {
            const subject = getSubjectById(event.subjectId)
            const eventInfo = getEventTypeInfo(event.eventType)
            const selected = selectedEventIdSet.has(event.id)
            return (
              <button
                key={event.id}
                onClick={() => {
                  if (calendarSelectionMode) {
                    onToggleEventSelection(event.id)
                    return
                  }
                  onSelectEvent(event)
                }}
                className={cn(
                  "w-full rounded-xl border p-2 text-left transition-colors",
                  selected
                    ? "border-primary/65 bg-primary/10 ring-1 ring-primary/25"
                    : "border-border/70 bg-background/30 hover:border-primary/50 hover:bg-accent/30"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {calendarSelectionMode && (
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background/50"
                        )}
                        aria-hidden="true"
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{event.title}</p>
                      <p className="text-micro text-muted-foreground mt-0.5">
                        {formatTimeRange(event.startTime, event.endTime)}
                        {event.location ? ` · ${event.location}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {subject && (
                      <span
                        className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
                        style={{
                          backgroundColor: subject.color + "18",
                          color: subject.color,
                        }}
                      >
                        {subject.shortCode}
                      </span>
                    )}
                    <span
                      className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium"
                      style={{
                        backgroundColor: eventInfo.color + "18",
                        color: eventInfo.color,
                      }}
                    >
                      {eventInfo.label}
                    </span>
                    {event.isFinished && (
                      <span className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
                        Done
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-background/24 px-3 py-3">
          <p className="text-xs text-muted-foreground">No calendar items scheduled.</p>
        </div>
      )}
    </div>
  )
}