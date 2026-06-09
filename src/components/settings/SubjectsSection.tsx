import { Button } from "@/components/ui/button"
import { EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Subject } from "@/lib/types"
import { SETTINGS_SECTION_CLASS, SETTINGS_CHECKBOX_CLASS } from "./constants"

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

  return (
    <section className={SETTINGS_SECTION_CLASS}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Visible Subjects</h2>
          <p className="mt-1 text-caption text-muted-foreground/70">
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
                  : "border-border/70 bg-background/35 text-foreground"
              )}
            >
              <input
                type="checkbox"
                checked={!hidden}
                onChange={() => onToggleSubjectVisibility(subject.id)}
                className={SETTINGS_CHECKBOX_CLASS}
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
