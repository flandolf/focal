import { useState } from "react"
import { Plus, Trash2, Home, Star, Archive, CheckCircle2, Search, Database, Palette, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StudyTimer } from "@/components/StudyTimer"
import { cn, formatDeadline, isOverdue, sortProjectsByDeadline, getDeadlineTypeInfo, getSubjectById } from "@/lib/utils"
import type { Project } from "@/lib/types"

type FilterMode = "active" | "favorites" | "archived" | "finished"

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
  onToggleFinished?: (id: string) => void
  fileCounts: Record<string, number>
  onOpenSettings?: () => void
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
  onToggleFinished,
  fileCounts,
  onOpenSettings,
  onOpenSearch,
  onOpenExport,
  onOpenSubjects,
}: SidebarProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("active")
  const sorted = sortProjectsByDeadline(projects)

  const filtered = sorted.filter((p) => {
    if (filterMode === "favorites") return p.isFavorite && !p.isArchived && !p.isFinished
    if (filterMode === "archived") return p.isArchived
    if (filterMode === "finished") return p.isFinished && !p.isArchived
    return !p.isArchived && !p.isFinished
  })

  const favoriteCount = sorted.filter((p) => p.isFavorite && !p.isArchived && !p.isFinished).length
  const archivedCount = sorted.filter((p) => p.isArchived).length
  const finishedCount = sorted.filter((p) => p.isFinished && !p.isArchived).length
  const activeCount = sorted.filter((p) => !p.isArchived && !p.isFinished).length

  return (
    <div className="glass-sidebar flex h-full flex-col overflow-hidden rounded-[1.35rem] text-sidebar-foreground">
      <div className="px-4 pb-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 select-none">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-sidebar-border bg-background/55 text-sm shadow-sm backdrop-blur">
              F
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-base font-semibold tracking-tight">Focal</h1>
              <p className="text-caption text-muted-foreground">Study workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {onOpenSearch && (
              <button
                onClick={onOpenSearch}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <Button onClick={onNewProject} className="mt-4 h-9 w-full gap-1.5 rounded-2xl" size="sm">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="space-y-3 px-3">
        <button
          onClick={onSelectHome}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors",
            homeSelected
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          <span className="font-medium">Today</span>
          <span className="ml-auto rounded-full bg-background/55 px-2 py-0.5 text-caption text-muted-foreground">
            {activeCount}
          </span>
        </button>

        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-sidebar-border bg-background/30 p-1">
          <button
            onClick={() => setFilterMode("active")}
            className={cn(
              "rounded-xl px-2 py-1.5 text-xs transition-colors",
              filterMode === "active"
                ? "bg-background/80 text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Active
          </button>
          <button
            onClick={() => setFilterMode("favorites")}
            className={cn(
              "flex items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs transition-colors",
              filterMode === "favorites"
                ? "bg-background/80 text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Star className="h-3 w-3" />
            Starred
            {favoriteCount > 0 && (
              <span className="tabular-nums text-caption">{favoriteCount}</span>
            )}
          </button>
          <button
            onClick={() => setFilterMode("archived")}
            className={cn(
              "flex items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs transition-colors",
              filterMode === "archived"
                ? "bg-background/80 text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Archive className="h-3 w-3" />
            Archive
            {archivedCount > 0 && (
              <span className="tabular-nums text-caption">{archivedCount}</span>
            )}
          </button>
          <button
            onClick={() => setFilterMode("finished")}
            className={cn(
              "flex items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-xs transition-colors",
              filterMode === "finished"
                ? "bg-background/80 text-foreground shadow-xs font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CheckCircle2 className="h-3 w-3" />
            Done
            {finishedCount > 0 && (
              <span className="tabular-nums text-caption">{finishedCount}</span>
            )}
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 pt-4">
          {filtered.length > 0 ? (
            <div className="flex flex-col gap-1">
              {filtered.map((project) => (
                <div
                  key={project.id}
                  className={cn(
                    "group relative flex cursor-pointer items-start gap-2.5 rounded-2xl px-3 py-2.5 transition-colors",
                    selectedId === project.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-foreground",
                    project.isArchived && "opacity-60",
                    project.isFinished && "opacity-70"
                  )}
                  onClick={() => onSelect(project.id)}
                >
                  <span className="text-sm leading-none shrink-0 mt-0.5 select-none">
                    {project.icon ?? "📄"}
                  </span>
                  <div className="flex-1 min-w-0 pr-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      {project.isFinished && (
                        <span className="text-micro px-1.5 py-0.5 rounded font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-950/40 shrink-0">
                          Finished
                        </span>
                      )}
                      {fileCounts[project.id] > 0 && (
                        <span className="text-caption text-muted-foreground tabular-nums shrink-0">
                          {fileCounts[project.id]}
                        </span>
                      )}
                    </div>
                    {((project.subjectId != null) || (project.deadline != null && !project.isFinished)) && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {project.subjectId && (
                          <span
                            className="text-micro px-1.5 py-0.5 rounded-md font-medium select-none"
                            style={{
                              backgroundColor: getSubjectById(project.subjectId)?.color + "20",
                              color: getSubjectById(project.subjectId)?.color
                            }}
                          >
                            {getSubjectById(project.subjectId)?.shortCode}
                          </span>
                        )}
                        {project.deadline && !project.isFinished && (
                          <>
                            <span
                              className="text-micro px-1.5 py-0.5 rounded-md flex items-center gap-0.5 select-none"
                              style={{
                                backgroundColor: getDeadlineTypeInfo(project.deadlineType).color + "20",
                                color: getDeadlineTypeInfo(project.deadlineType).color
                              }}
                            >
                              {getDeadlineTypeInfo(project.deadlineType).icon}
                              {getDeadlineTypeInfo(project.deadlineType).label}
                            </span>
                            <span className={cn(
                              "text-micro px-1.5 py-0.5 rounded-md font-medium select-none",
                              isOverdue(project.deadline)
                                ? "bg-destructive/15 text-destructive"
                                : "bg-muted text-muted-foreground"
                            )}>
                              {formatDeadline(project.deadline)}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 shrink-0">
                    {onToggleFinished && (
                      <button
                        aria-label={project.isFinished ? "Mark as active" : "Mark as complete"}
                        className={cn(
                          "h-6 w-6 flex items-center justify-center rounded transition-opacity hover:bg-sidebar-accent/50",
                          project.isFinished
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleFinished(project.id)
                        }}
                      >
                        <CheckCircle2 className={cn(
                          "h-3.5 w-3.5",
                          project.isFinished ? "text-green-500" : "text-muted-foreground"
                        )} />
                      </button>
                    )}
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
                  : filterMode === "finished"
                    ? "No finished projects"
                    : "No projects yet"}
            </p>
          )}
        </div>
      </ScrollArea>

      {(onOpenExport != null || onOpenSubjects != null) && (
        <div className="border-t border-sidebar-border/70 px-3 pb-2 pt-2.5">
          <div className="flex items-center gap-1 rounded-2xl bg-background/25 p-1">
            {onOpenExport && (
              <button
                onClick={onOpenExport}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-caption text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
              >
                <Database className="h-3.5 w-3.5" />
                Export
              </button>
            )}
            {onOpenSubjects && (
              <button
                onClick={onOpenSubjects}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-caption text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
              >
                <Palette className="h-3.5 w-3.5" />
                Subjects
              </button>
            )}
          </div>
        </div>
      )}

      <StudyTimer />
    </div>
  )
}
