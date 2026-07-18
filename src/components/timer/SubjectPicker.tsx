import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
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
                <Button
                  key={subject.id}
                  variant={selected ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={selected}
                  onClick={() => onSubjectClick(subject.id)}
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
                </Button>
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
            <Button
              key={subject.id}
              variant={selected ? "secondary" : "outline"}
              size="sm"
              aria-pressed={selected}
              onClick={() => onSubjectClick(subject.id)}
              style={selected ? {
                backgroundColor: `${subject.color}18`,
                borderColor: `${subject.color}40`,
                color: subject.color,
              } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: subject.color }} />
              {subject.shortCode}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
