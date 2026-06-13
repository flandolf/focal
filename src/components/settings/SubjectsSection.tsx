import { Button } from "@/components/ui/button"
import { EyeOff, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Subject } from "@/lib/types"

interface SubjectsSectionProps {
  subjects: Subject[]
  hiddenSubjectIds: string[]
  onToggleSubjectVisibility: (subjectId: string) => void
  onShowAllSubjects: () => void
}

export function SubjectsSection({
  subjects,
  hiddenSubjectIds,
  onToggleSubjectVisibility,
  onShowAllSubjects,
}: SubjectsSectionProps) {
  const hiddenSubjectCount = hiddenSubjectIds.length
  const visibleCount = subjects.length - hiddenSubjectCount

  return (
    <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Visible Subjects</h2>
          <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
            Hide subjects you are not taking from assessment, event, and study-session pickers.
          </p>
        </div>
        {hiddenSubjectCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowAllSubjects}
            className="h-7 shrink-0 px-2 text-xs"
          >
            Show all
          </Button>
        )}
      </div>

      {/* Count summary */}
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-background/30 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground/80">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="tabular-nums font-medium text-foreground/90">{visibleCount}</span>
          <span>visible</span>
        </div>
        <span className="text-caption text-muted-foreground/30" aria-hidden="true">·</span>
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground/80">
          <span
            className={cn(
              "inline-flex h-1.5 w-1.5 rounded-full",
              hiddenSubjectCount > 0 ? "bg-muted-foreground/50" : "bg-emerald-500/0",
            )}
            aria-hidden="true"
          />
          <span className="tabular-nums font-medium text-foreground/90">{hiddenSubjectCount}</span>
          <span>hidden</span>
        </div>
        <span className="ml-auto text-caption text-muted-foreground/55 tabular-nums">
          {subjects.length} total
        </span>
      </div>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {subjects.map((subject) => {
          const hidden = hiddenSubjectIds.includes(subject.id)
          return (
            <label
              key={subject.id}
              className={cn(
                "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
                hidden
                  ? "border-border/60 bg-background/20 text-muted-foreground"
                  : "border-border/70 bg-background/35 text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  hidden
                    ? "border-muted-foreground/30 bg-background/40"
                    : "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                )}
                aria-hidden="true"
              >
                {!hidden && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <input
                type="checkbox"
                checked={!hidden}
                onChange={() => onToggleSubjectVisibility(subject.id)}
                className="sr-only"
                aria-label={hidden ? `Show ${subject.name}` : `Hide ${subject.name}`}
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: subject.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">
                {subject.icon} {subject.name}
              </span>
              {hidden && <EyeOff className="h-3.5 w-3.5 shrink-0" />}
            </label>
          )
        })}
      </div>
    </section>
  )
}
