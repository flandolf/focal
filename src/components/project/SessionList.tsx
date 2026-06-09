import { Clock, Calendar, Plus } from "lucide-react"
import { format, parseISO } from "date-fns"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getSubjectById, getSessionSubjectIds } from "@/lib/utils"
import type { Project, StudySession, StudySessionStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

interface SessionListProps {
  sessions: StudySession[]
  project: Project
  projectName: string
  onSelectSession?: (session: StudySession) => void
  onNewSession?: () => void
}

export function SessionList({
  sessions,
  project,
  projectName,
  onSelectSession,
  onNewSession,
}: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-5 min-[1200px]:px-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background/35">
          <Clock className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No study sessions</p>
        <p className="text-xs text-muted-foreground mb-5 max-w-56 leading-relaxed">
          Plan study sessions for {projectName} to track your revision time and progress.
        </p>
        {onNewSession && (
          <Button variant="secondary" size="sm" onClick={onNewSession} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Plan Session
          </Button>
        )}
      </div>
    )
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  )

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-1.5 px-5 py-3 min-[1200px]:px-8">
        {sorted.map((session) => {
          const start = parseISO(session.startTime)
          const end = parseISO(session.endTime)
          const durationMs = end.getTime() - start.getTime()
          const hours = Math.floor(durationMs / (1000 * 60 * 60))
          const minutes = Math.round((durationMs % (1000 * 60 * 60)) / (1000 * 60))
          const sessionSubjects = getSessionSubjectIds(session, project)

          return (
            <button
              type="button"
              key={session.id}
              onClick={() => onSelectSession?.(session)}
              className="w-full rounded-lg border border-border/60 bg-background/20 p-3 text-left transition-colors outline-none hover:border-border hover:bg-accent/25 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{session.title}</p>
                    <StatusBadge status={session.status} />
                  </div>
                  {session.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{session.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(start, "MMM d, yyyy")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(start, "h:mm a")} — {format(end, "h:mm a")}
                    </span>
                    <span className="tabular-nums">{hours > 0 ? `${hours}h ` : ""}{minutes}m</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sessionSubjects.map((subjectId) => {
                      const subject = getSubjectById(subjectId)
                      return (
                        <span
                          key={subjectId}
                          className="text-micro px-1.5 py-0.5 rounded font-medium"
                          style={subject ? { backgroundColor: subject.color + "14", color: subject.color } : undefined}
                        >
                          {subject?.shortCode ?? subjectId}
                        </span>
                      )
                    })}
                    {session.topics && session.topics.length > 0 && session.topics.map((topic, i) => (
                      <span key={i} className="text-micro px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function StatusBadge({ status }: { status: StudySessionStatus }) {
  const config = {
    planned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "in-progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  }
  const labels = {
    planned: "Planned",
    "in-progress": "In Progress",
    completed: "Completed",
  }
  return (
    <span className={cn("text-micro px-1.5 py-0.5 rounded font-medium", config[status])}>
      {labels[status]}
    </span>
  )
}
