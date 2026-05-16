import { Plus, Trash2, Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn, formatDeadline, isOverdue, sortProjectsByDeadline, getDeadlineTypeInfo, getSubjectById } from "@/lib/utils"
import type { Project } from "@/lib/types"

interface SidebarProps {
  projects: Project[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNewProject: () => void
  fileCounts: Record<string, number>
  dark: boolean
  onToggleDark: () => void
}

export function Sidebar({
  projects,
  selectedId,
  onSelect,
  onDelete,
  onNewProject,
  fileCounts,
  dark,
  onToggleDark,
}: SidebarProps) {
  const sorted = sortProjectsByDeadline(projects)

  return (
    <div className="flex flex-col h-full bg-sidebar border-r">
      <div className="flex flex-col px-4 pt-5 pb-4 gap-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg leading-none">🎯</span>
            <h1 className="font-semibold text-base tracking-tight">Focal</h1>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleDark}>
            {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <Button onClick={onNewProject} className="w-full gap-1.5" size="sm">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sorted.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {sorted.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "group flex items-start gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors",
                    selectedId === project.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => onSelect(project.id)}
                >
                  <span className="text-base leading-none shrink-0 mt-0.5">{project.icon || "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      {fileCounts[project.id] > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {fileCounts[project.id]}
                        </span>
                      )}
                    </div>
                    {(project.subjectId || project.deadline) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {project.subjectId && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              backgroundColor: getSubjectById(project.subjectId)?.color + "20",
                              color: getSubjectById(project.subjectId)?.color
                            }}
                          >
                            {getSubjectById(project.subjectId)?.shortCode}
                          </span>
                        )}
                        {project.deadline && (
                          <>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5"
                              style={{
                                backgroundColor: getDeadlineTypeInfo(project.deadlineType).color + "20",
                                color: getDeadlineTypeInfo(project.deadlineType).color
                              }}
                            >
                              {getDeadlineTypeInfo(project.deadlineType).icon}
                              {getDeadlineTypeInfo(project.deadlineType).label}
                            </span>
                            <span className={cn(
                              "text-xs leading-tight",
                              isOverdue(project.deadline) ? "text-destructive" : "text-muted-foreground/70"
                            )}>
                              {formatDeadline(project.deadline)}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${project.name}`}
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(project.id)
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12 px-4 leading-relaxed">
              No projects yet
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
