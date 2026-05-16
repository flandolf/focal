import { useState } from "react"
import { Plus, Trash2, Sun, Moon, Home, Star, Archive, Search, Database, Palette } from "lucide-react"
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
  onOpenSearch?: () => void
  onOpenExport?: () => void
  onOpenSubjects?: () => void
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
  onOpenSearch,
  onOpenExport,
  onOpenSubjects,
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
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 select-none">
            <span className="text-lg leading-none">🎯</span>
            <h1 className="font-semibold text-base tracking-tight">Focal</h1>
          </div>
          <div className="flex items-center gap-0.5">
            {onOpenSearch && (
              <button
                onClick={onOpenSearch}
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                aria-label="Search"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onToggleDark}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <Button onClick={onNewProject} className="w-full gap-1.5 h-8" size="sm">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Navigation + Filters */}
      <div className="px-3 space-y-3">
        <button
          onClick={onSelectHome}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
            homeSelected
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          Dashboard
        </button>

        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-sidebar-accent/40">
          <button
            onClick={() => setFilterMode("active")}
            className={cn(
              "flex-1 py-1.5 text-xs rounded-sm transition-colors",
              filterMode === "active"
                ? "bg-background text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Active
          </button>
          <button
            onClick={() => setFilterMode("favorites")}
            className={cn(
              "flex-1 py-1.5 text-xs rounded-sm transition-colors flex items-center justify-center gap-1",
              filterMode === "favorites"
                ? "bg-background text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Star className="h-3 w-3" />
            Starred
            {favoriteCount > 0 && (
              <span className="tabular-nums text-[11px]">{favoriteCount}</span>
            )}
          </button>
          <button
            onClick={() => setFilterMode("archived")}
            className={cn(
              "flex-1 py-1.5 text-xs rounded-sm transition-colors flex items-center justify-center gap-1",
              filterMode === "archived"
                ? "bg-background text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Archive className="h-3 w-3" />
            Archive
            {archivedCount > 0 && (
              <span className="tabular-nums text-[11px]">{archivedCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Project list */}
      <ScrollArea className="flex-1">
        <div className="pt-2 pb-1">
          {filtered.length > 0 ? (
            <div className="flex flex-col gap-px">
              {filtered.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "group relative flex items-start gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-colors",
                    selectedId === project.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground",
                    project.isArchived && "opacity-60"
                  )}
                  onClick={() => onSelect(project.id)}
                >
                  <span className="text-sm leading-none shrink-0 mt-0.5 select-none">
                    {project.icon ?? "📄"}
                  </span>
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      {fileCounts[project.id] > 0 && (
                        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                          {fileCounts[project.id]}
                        </span>
                      )}
                    </div>
                    {(project.subjectId ?? project.deadline) && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {project.subjectId && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium select-none"
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
                              className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 select-none"
                              style={{
                                backgroundColor: getDeadlineTypeInfo(project.deadlineType).color + "20",
                                color: getDeadlineTypeInfo(project.deadlineType).color
                              }}
                            >
                              {getDeadlineTypeInfo(project.deadlineType).icon}
                              {getDeadlineTypeInfo(project.deadlineType).label}
                            </span>
                            <span className={cn(
                              "text-[11px] leading-tight select-none",
                              isOverdue(project.deadline) ? "text-destructive" : "text-muted-foreground/70"
                            )}>
                              {formatDeadline(project.deadline)}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 shrink-0">
                    {onToggleArchive && !project.isArchived && (
                      <button
                        aria-label={`Archive ${project.name}`}
                        className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-sidebar-accent/50"
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleArchive(project.id)
                        }}
                      >
                        <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                    <button
                      aria-label={`Delete ${project.name}`}
                      className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-sidebar-accent/50"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(project.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                    </button>
                    {onToggleFavorite && (
                      <button
                        aria-label={project.isFavorite ? "Remove from favorites" : "Add to favorites"}
                        className={cn(
                          "h-6 w-6 flex items-center justify-center rounded transition-opacity hover:bg-sidebar-accent/50",
                          project.isFavorite
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFavorite(project.id)
                        }}
                      >
                        <Star className={cn(
                          "h-3.5 w-3.5",
                          project.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
                        )} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12 px-4 leading-relaxed">
              {filterMode === "archived"
                ? "No archived projects"
                : filterMode === "favorites"
                  ? "No favorites yet"
                  : "No projects yet"}
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Footer utilities */}
      {(onOpenExport != null || onOpenSubjects != null) && (
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center gap-0.5">
            {onOpenExport && (
              <button
                onClick={onOpenExport}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
              >
                <Database className="h-3.5 w-3.5" />
                Export
              </button>
            )}
            {onOpenSubjects && (
              <button
                onClick={onOpenSubjects}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors"
              >
                <Palette className="h-3.5 w-3.5" />
                Subjects
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pomodoro timer */}
      <StudyTimer />
    </div>
  )
}
