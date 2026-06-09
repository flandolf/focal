import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { Subject } from "@/lib/types"

interface SubjectPickerProps {
  variant: "focus" | "sidebar"
  subjects: Subject[]
  selectedSubjectIds: string[]
  activeSessionId: string | null
  onSubjectClick: (subjectId: string) => void
}

export function SubjectPicker({
  variant,
  subjects,
  selectedSubjectIds,
  activeSessionId,
  onSubjectClick,
}: SubjectPickerProps) {
  if (variant === "sidebar") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-micro font-semibold uppercase text-muted-foreground/70">Studying</span>
          {activeSessionId && (
            <span className="text-micro font-medium text-background">Logging now</span>
          )}
        </div>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex w-max gap-1.5 pb-2">
            {subjects.map((subject) => {
              const selected = selectedSubjectIds.includes(subject.id)
              return (
                <button
                  key={subject.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSubjectClick(subject.id)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/35",
                    selected
                      ? "border-transparent text-foreground shadow-xs"
                      : "border-sidebar-border bg-background/35 text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                  )}
                  style={selected ? {
                    backgroundColor: `${subject.color}18`,
                    borderColor: `${subject.color}40`,
                    color: subject.color,
                  } : undefined}
                  title={activeSessionId && selected ? `${subject.name} is logged for this session` : subject.name}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: subject.color }}
                  />
                  {subject.shortCode}
                </button>
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-micro font-semibold uppercase tracking-normal text-muted-foreground">Subjects</p>
        <span className="text-micro font-medium text-muted-foreground">{selectedSubjectIds.length} selected</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {subjects.map((subject) => {
          const selected = selectedSubjectIds.includes(subject.id)
          return (
            <button
              key={subject.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSubjectClick(subject.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/35",
                selected
                  ? "border-transparent bg-primary/10 text-background"
                  : "border-border/70 bg-background/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
              style={selected ? {
                backgroundColor: `${subject.color}18`,
                borderColor: `${subject.color}40`,
                color: subject.color,
              } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: subject.color }} />
              {subject.shortCode}
            </button>
          )
        })}
      </div>
    </div>
  )
}
