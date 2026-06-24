import { useState, useMemo } from "react"
import { format, parseISO, differenceInDays } from "date-fns"
import { X, Check, ChevronDown, CheckCircle2, Trash2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem as CtxMenuItem,
  ContextMenuSeparator as CtxMenuSep,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { formatDeadline, getSubjectById, getEventTypeInfo, getSessionEffectiveMinutes, getSessionSubjectIds, cn } from "@/lib/utils"
import { groupSessionsBySubject } from "@/lib/groupSessions"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"

function formatTimeRange(startTime: string, endTime?: string) {
  const startLabel = format(parseISO(startTime), "h:mm a")
  if (!endTime) return startLabel
  const startKey = format(parseISO(startTime), "yyyy-MM-dd")
  const endKey = format(parseISO(endTime), "yyyy-MM-dd")
  if (startKey !== endKey) {
    return `${format(parseISO(startTime), "MMM d, h:mm a")} – ${format(parseISO(endTime), "MMM d, h:mm a")}`
  }
  return `${startLabel} - ${format(parseISO(endTime), "h:mm a")}`
}

function formatMultiDayEventMeta(startTime: string, endTime: string): string {
  const startDate = parseISO(startTime)
  const endDate = parseISO(endTime)
  const dayCount = differenceInDays(endDate, startDate) + 1
  if (dayCount <= 1) {
    // Same-day event — fall back to normal time display (caller handles this)
    return `${format(parseISO(startTime), "h:mm a")} - ${format(endDate, "h:mm a")}`
  }
  const endLabel = format(endDate, "EEE d MMM")
  return `Multi-day · Ends ${endLabel} (${dayCount} days)`
}

function isEventOnDate(event: CalendarEvent, dateKey: string): boolean {
  const startKey = format(parseISO(event.startTime), "yyyy-MM-dd")
  if (startKey === dateKey) return true
  if (!event.endTime) return false
  const endKey = format(parseISO(event.endTime), "yyyy-MM-dd")
  return dateKey >= startKey && dateKey <= endKey
}

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 1) return "<1m"
  const hours = Math.floor(totalMinutes / 60)
  const mins = Math.round(totalMinutes % 60)
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
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
  onDeleteCalendarItems?: (itemIds: { eventIds: string[]; sessionIds: string[] }) => void
  onSetCalendarItemsCompleted?: (itemIds: { eventIds: string[]; sessionIds: string[] }, isCompleted: boolean) => void
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
  onDeleteCalendarItems,
  onSetCalendarItemsCompleted,
}: DayDetailProps) {
  const dateKey = selectedDate
  const dayEvents = useMemo(() =>
    events.filter((event) => isEventOnDate(event, dateKey)),
    [events, dateKey],
  )
  const hasItems = deadlines.length > 0 || sessions.length > 0 || dayEvents.length > 0
  const subjectGroups = useMemo(() => groupSessionsBySubject(sessions, projects), [sessions, projects])
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(() => new Set(subjectGroups.map((g) => g.subjectId)))
  const toggleSubject = (subjectId: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(subjectId)) next.delete(subjectId)
      else next.add(subjectId)
      return next
    })
  }

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
          {(dayEvents.length > 0 || sessions.length > 0) && (
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
          <p className="text-xs font-semibold tabular-nums">{dayEvents.length}</p>
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
          {subjectGroups.map((group) => {
            const isExpanded = expandedSubjects.has(group.subjectId)
            const sessionLabel = group.count === 1 ? "session" : "sessions"
            return (
              <div key={group.subjectId} className="rounded-xl border border-border/40 bg-background/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSubject(group.subjectId)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent/20"
                >
                  <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                  <span className="text-xs font-semibold" style={{ color: group.color }}>
                    {group.shortCode}
                  </span>
                  <span className="text-xs font-medium text-foreground/80">
                    {group.count} {sessionLabel}
                  </span>
                  <span className="text-micro text-muted-foreground tabular-nums">
                    · {formatDuration(group.totalMinutes)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-3.5 w-3.5 text-muted-foreground/50 transition-transform",
                      isExpanded && "rotate-180",
                    )}
                  />
                </button>
                {isExpanded && group.projectGroups.map((pg) => (
                  <div key={pg.projectId ?? "__none__"} className="border-t border-border/30">
                    {group.projectGroups.length > 1 && (
                      <div className="px-3 pt-2 pb-1">
                        <p className="text-micro font-medium text-muted-foreground/70">
                          {pg.projectName}
                          <span className="text-muted-foreground/40 ml-1">· {pg.count} {pg.count === 1 ? "session" : "sessions"} · {formatDuration(pg.totalMinutes)}</span>
                        </p>
                      </div>
                    )}
                    <div className="space-y-1 px-2 pb-2 pt-1">
                      {pg.sessions.map((s) => {
                        const project = s.projectId ? projects.find((p) => p.id === s.projectId) : undefined
                        const subjects = getSessionSubjectIds(s, project)
                          .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
                          .join(", ")
                        const selected = selectedSessionIdSet.has(s.id)
                        return (
                          <ContextMenu key={s.id}>
                            <ContextMenuTrigger asChild>
                          <button
                            onClick={() => {
                              if (calendarSelectionMode) {
                                onToggleSessionSelection(s.id)
                                return
                              }
                              onSelectSession(s)
                            }}
                            className={cn(
                              "w-full rounded-lg border p-2 text-left transition-colors",
                              selected
                                ? "border-primary/65 bg-primary/10 ring-1 ring-primary/25"
                                : "border-transparent bg-background/40 hover:bg-accent/20",
                              s.status === "completed" && "opacity-75 hover:opacity-95",
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {calendarSelectionMode && (
                                <span
                                  className={cn(
                                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                                    selected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background/50",
                                  )}
                                  aria-hidden="true"
                                >
                                  {selected && <Check className="h-3 w-3" />}
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="min-w-0 truncate text-xs font-medium">{s.title}</p>
                                  {s.status !== "planned" && (
                                    <span className={cn(
                                      "rounded px-1.5 py-0.5 text-micro font-medium whitespace-nowrap",
                                      s.status === "completed"
                                        ? "bg-success/15 text-success"
                                        : "bg-primary/12 text-primary",
                                    )}>
                                      {s.status === "completed" ? "Done" : "Active"}
                                    </span>
                                  )}
                                </div>
                                <p className="text-micro text-muted-foreground mt-0.5">
                                  {project?.name ?? subjects}
                                </p>
                                <p className="mt-1 text-micro font-medium tabular-nums text-muted-foreground">
                                  {formatTimeRange(s.startTime, s.endTime)} · {formatDuration(getSessionEffectiveMinutes(s))}
                                  {s.schedule.blocks.length > 1 ? ` · ${s.schedule.blocks.length} blocks` : ""}
                                </p>
                              </div>
                            </div>
                          </button>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-40">
                              <CtxMenuItem onSelect={() => onSelectSession(s)}>
                                <Pencil className="h-4 w-4" />
                                Edit
                              </CtxMenuItem>
                              {onSetCalendarItemsCompleted && (
                                <CtxMenuItem onSelect={() => onSetCalendarItemsCompleted({ eventIds: [], sessionIds: [s.id] }, s.status !== "completed")}>
                                  <CheckCircle2 className="h-4 w-4" />
                                  {s.status === "completed" ? "Mark current" : "Mark complete"}
                                </CtxMenuItem>
                              )}
                              <CtxMenuSep />
                              <CtxMenuItem
                                variant="destructive"
                                onSelect={() => onDeleteCalendarItems?.({ eventIds: [], sessionIds: [s.id] })}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </CtxMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          {(() => {
            const upcomingEvents = dayEvents.filter((e) => !e.isFinished)
            const completedEvents = dayEvents.filter((e) => e.isFinished)
            return (
              <>
                {upcomingEvents.map((event) => {
                  const subject = getSubjectById(event.subjectId)
                  const eventInfo = getEventTypeInfo(event.eventType)
                  const selected = selectedEventIdSet.has(event.id)
                  const isMultiDay = event.endTime && format(parseISO(event.startTime), "yyyy-MM-dd") !== format(parseISO(event.endTime), "yyyy-MM-dd")
                  return (
                    <ContextMenu key={event.id}>
                      <ContextMenuTrigger asChild>
                    <button
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
                              {isMultiDay && event.endTime
                                ? formatMultiDayEventMeta(event.startTime, event.endTime)
                                : `${formatTimeRange(event.startTime, event.endTime)}${event.location ? ` · ${event.location}` : ""}`}
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
                        </div>
                      </div>
                    </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-40">
                        <CtxMenuItem onSelect={() => onSelectEvent(event)}>
                          <Pencil className="h-4 w-4" />
                          Edit
                        </CtxMenuItem>
                        {onSetCalendarItemsCompleted && (
                          <CtxMenuItem onSelect={() => onSetCalendarItemsCompleted({ eventIds: [event.id], sessionIds: [] }, !event.isFinished)}>
                            <CheckCircle2 className="h-4 w-4" />
                            {event.isFinished ? "Mark current" : "Mark complete"}
                          </CtxMenuItem>
                        )}
                        <CtxMenuSep />
                        <CtxMenuItem
                          variant="destructive"
                          onSelect={() => onDeleteCalendarItems?.({ eventIds: [event.id], sessionIds: [] })}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </CtxMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
                {completedEvents.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex-1 border-t border-border/40" />
                      <p className="text-micro text-muted-foreground/50 font-medium">Completed</p>
                      <div className="flex-1 border-t border-border/40" />
                    </div>
                    {completedEvents.map((event) => {
                      const subject = getSubjectById(event.subjectId)
                      const eventInfo = getEventTypeInfo(event.eventType)
                      const selected = selectedEventIdSet.has(event.id)
                      const isMultiDay = event.endTime && format(parseISO(event.startTime), "yyyy-MM-dd") !== format(parseISO(event.endTime), "yyyy-MM-dd")
                      return (
                        <ContextMenu key={event.id}>
                          <ContextMenuTrigger asChild>
                        <button
                          onClick={() => {
                            if (calendarSelectionMode) {
                              onToggleEventSelection(event.id)
                              return
                            }
                            onSelectEvent(event)
                          }}
                          className={cn(
                            "w-full rounded-xl border p-2 text-left transition-colors opacity-60 hover:opacity-80",
                            selected
                              ? "border-primary/65 bg-primary/10 ring-1 ring-primary/25"
                              : "border-border/70 bg-background/30"
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
                                  {isMultiDay && event.endTime
                                    ? formatMultiDayEventMeta(event.startTime, event.endTime)
                                    : `${formatTimeRange(event.startTime, event.endTime)}${event.location ? ` · ${event.location}` : ""}`}
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
                              <span className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium bg-success/15 text-success">
                                Done
                              </span>
                            </div>
                          </div>
                        </button>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-40">
                            <CtxMenuItem onSelect={() => onSelectEvent(event)}>
                              <Pencil className="h-4 w-4" />
                              Edit
                            </CtxMenuItem>
                            {onSetCalendarItemsCompleted && (
                              <CtxMenuItem onSelect={() => onSetCalendarItemsCompleted({ eventIds: [event.id], sessionIds: [] }, !event.isFinished)}>
                                <CheckCircle2 className="h-4 w-4" />
                                {event.isFinished ? "Mark current" : "Mark complete"}
                              </CtxMenuItem>
                            )}
                            <CtxMenuSep />
                            <CtxMenuItem
                              variant="destructive"
                              onSelect={() => onDeleteCalendarItems?.({ eventIds: [event.id], sessionIds: [] })}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </CtxMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )
                    })}
                  </>
                )}
              </>
            )
          })()}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-background/24 px-3 py-3">
          <p className="text-xs text-muted-foreground">No calendar items scheduled.</p>
        </div>
      )}
    </div>
  )
}
