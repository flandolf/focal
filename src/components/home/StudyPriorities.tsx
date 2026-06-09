import { ChevronRight, Target } from "lucide-react"
import { getSubjectById, cn } from "@/lib/utils"
import { getUrgencyLabel, getUrgencyClassName } from "@/lib/planning"
import type { PriorityItem } from "@/lib/types"

interface StudyPrioritiesProps {
  items: PriorityItem[]
  isOpen: boolean
  onToggle: () => void
  onSelectItem: (item: PriorityItem) => void
}

export function StudyPriorities({
  items,
  isOpen,
  onToggle,
  onSelectItem,
}: StudyPrioritiesProps) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/38 p-3.5 shadow-sm backdrop-blur">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
      >
        <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          Study Priorities
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-micro leading-3 text-muted-foreground tabular-nums">{items.length}/7</span>
          <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
        </div>
      </button>
      {isOpen && (
        <div className="mt-2.5">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No urgent study actions. Add an assessment, plan a session, or review a completed one to sharpen the queue.
            </p>
          ) : (
            <div className="space-y-1">
              {items.map((item) => {
                const subjectLabels = item.subjectIds
                  .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
                  .slice(0, 2)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.reason}</p>
                      </div>
                      <span className={cn("shrink-0 rounded p-1 text-xs font-medium leading-3", getUrgencyClassName(item.urgency))}>
                        {getUrgencyLabel(item.urgency)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-micro font-medium text-primary">{item.action}</span>
                      {subjectLabels.map((label) => (
                        <span key={label} className="rounded bg-muted/70 px-1 py-0 text-micro leading-3 text-muted-foreground">
                          {label}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
