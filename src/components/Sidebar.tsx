import { useState } from "react"
import { Plus, Trash2, Sun, Moon, Home, Star, Archive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StudyTimer } from "@/components/StudyTimer"
import { cn, formatDeadline, isOverdue, sortProjectsByDeadline, getDeadlineTypeInfo, getSubjectById } from "@/lib/utils"
import type { Project } from "@/lib/types"

type FilterMode = "active" | "favorites" | "archived"

interface SidebarProps {
  projects: Project[]
  selectedId: string | null
  homeSelected: boolean
  onSelect: (id: string) => void
  onSelectHome: () => void
  onDelete: (id: string) => void
  onNewProject: () => void
  onToggleFavorite?: (id: string) => void
  onToggleArchive?: (id: string) => void
  fileCounts: Record<string, number>
  dark: boolean
  onToggleDark: () => void
}

export function Sidebar({
  projects,
  selectedId,
  homeSelected,
  onSelect,
  onSelectHome,
  onDelete,
  onNewProject,
  onToggleFavorite,
  onToggleArchive,
  fileCounts,
  dark,
  onToggleDark,
}: SidebarProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("active")
  const sorted = sortProjectsByDeadline(projects)

  const filtered = sorted.filter((p) => {
    if (filterMode === "favorites") return p.isFavorite && !p.isArchived
    if (filterMode === "archived") return p.isArchived
    return !p.isArchived
  })

  const favoriteCount = sorted.filter((p) => p.isFavorite && !p.isArchived).length
  const archivedCount = sorted.filter((p) => p.isArchived).length

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
        <Button
          onClick={onSelectHome}
          variant={homeSelected ? "default" : "ghost"}
          className={cn("w-full gap-1.5 justify-start", homeSelected && "bg-accent text-accent-foreground")}
          size="sm"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </Button>
        <Button onClick={onNewProject} className="w-full gap-1.5" size="sm">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="flex items-center gap-0.5 px-1 mb-2">
            <button
              onClick={() => setFilterMode("active")}
              className={cn(
                "flex-1 py-1.5 text-xs rounded-md transition-colors",
                filterMode === "active"
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Active
            </button>
            <button
              onClick={() => setFilterMode("favorites")}
              className={cn(
                "flex-1 py-1.5 text-xs rounded-md transition-colors flex items-center justify-center gap-1",
                filterMode === "favorites"
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Star className="h-3 w-3" />
              Starred
              {favoriteCount > 0 && <span className="tabular-nums">{favoriteCount}</span>}
            </button>
            <button
              onClick={() => setFilterMode("archived")}
              className={cn(
                "flex-1 py-1.5 text-xs rounded-md transition-colors flex items-center justify-center gap-1",
                filterMode === "archived"
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Archive className="h-3 w-3" />
              Archive
              {archivedCount > 0 && <span className="tabular-nums">{archivedCount}</span>}
            </button>
          </div>
          {filtered.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {filtered.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "group flex items-start gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors",
                    selectedId === project.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-muted-foreground hover:text-foreground",
                    project.isArchived && "opacity-60"
                  )}
                  onClick={() => onSelect(project.id)}
                >
                  <span className="text-base leading-none shrink-0 mt-0.5">{project.icon ?? "📄"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      {fileCounts[project.id] > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {fileCounts[project.id]}
                        </span>
                      )}
                    </div>
                      {(project.subjectId ?? project.deadline) && (
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
                  <div className="flex items-center gap-0.5 shrink-0">
                    {onToggleFavorite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={project.isFavorite ? "Remove from favorites" : "Add to favorites"}
                        className={cn(
                          "h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                          project.isFavorite && "opacity-100"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFavorite(project.id)
                        }}
                      >
                        <Star className={cn(
                          "h-3.5 w-3.5",
                          project.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground hover:text-yellow-400"
                        )} />
                      </Button>
                    )}
                    {onToggleArchive && !project.isArchived && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Archive ${project.name}`}
                        className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleArchive(project.id)
                        }}
                      >
                        <Archive className="h-3.5 w-3.5 text-muted-foreground hover:text-muted-foreground/80" />
                      </Button>
                    )}
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
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12 px-4 leading-relaxed">
              {filterMode === "archived" ? "No archived projects" : filterMode === "favorites" ? "No favorites yet" : "No projects yet"}
            </p>
          )}
        </div>
      </ScrollArea>
      <StudyTimer />
    </div>
  )
}
