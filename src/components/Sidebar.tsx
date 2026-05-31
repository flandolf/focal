import { useState } from "react"
import {
  Archive,
  Atom,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Calculator,
  ChartNoAxesColumn,
  CheckCircle2,
  ClipboardList,
  Database,
  Dna,
  FlaskConical,
  Folder,
  Home,
  Landmark,
  Languages,
  Library,
  Map,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  Palette,
  Plus,
  Star,
  Target,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StudyTimer } from "@/components/StudyTimer"
import { cn, formatDeadline, isOverdue, sortProjectsByDeadline, getDeadlineTypeInfo, getSubjectById } from "@/lib/utils"
import type { DeadlineType, Project } from "@/lib/types"

type FilterMode = "active" | "favorites" | "archived" | "finished"

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  eng: BookOpen,
  "eng-lang": Languages,
  lit: Library,
  mm: Calculator,
  sm: Calculator,
  fm: ChartNoAxesColumn,
  chem: FlaskConical,
  phys: Atom,
  bio: Dna,
  psych: Brain,
  hist: Landmark,
  geo: Map,
  econ: TrendingUp,
  bm: BriefcaseBusiness,
}

const DEADLINE_ICONS: Record<DeadlineType | "default", LucideIcon> = {
  gat: Target,
  sac: NotebookPen,
  exam: CalendarDays,
  assignment: ClipboardList,
  default: MapPin,
}

function getSidebarProjectIcon(project: Project): LucideIcon {
  if (project.subjectId && SUBJECT_ICONS[project.subjectId]) {
    return SUBJECT_ICONS[project.subjectId]
  }
  return Folder
}

function getSidebarDeadlineIcon(type?: DeadlineType): LucideIcon {
  return type ? DEADLINE_ICONS[type] : DEADLINE_ICONS.default
}

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
    <div className="glass-sidebar flex h-full flex-col overflow-hidden rounded-2xl text-sidebar-foreground min-[1200px]:rounded-[1.35rem]">
      <div className="px-3 pb-3 pt-3 min-[1200px]:px-4 min-[1200px]:pb-4 min-[1200px]:pt-4">
        <div className="flex items-center gap-3 select-none">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-sidebar-border bg-background/55 text-sm shadow-sm backdrop-blur min-[1200px]:h-9 min-[1200px]:w-9 min-[1200px]:rounded-2xl">
              F
            </span>
            <div className="min-w-0">
              <h1 className="font-heading text-base font-semibold">Focal</h1>
              <p className="text-caption text-muted-foreground max-[900px]:hidden">Study workspace</p>
            </div>
        </div>

        <Button onClick={onNewProject} className="mt-4 h-9 w-full gap-1.5 rounded-2xl" size="sm">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="space-y-2 px-2.5 min-[1200px]:space-y-3 min-[1200px]:px-3">
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

        <div className="grid grid-cols-2 gap-1 rounded-xl border border-sidebar-border bg-background/30 p-1 min-[1200px]:rounded-2xl">
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

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 pb-2 pt-3 min-[1200px]:px-2 min-[1200px]:pt-4">
          {filtered.length > 0 ? (
            <div className="flex flex-col gap-1">
              {filtered.map((project) => {
                const ProjectIcon = getSidebarProjectIcon(project)
                const subject = getSubjectById(project.subjectId)
                const deadlineInfo = getDeadlineTypeInfo(project.deadlineType)
                const DeadlineIcon = getSidebarDeadlineIcon(project.deadlineType)

                return (
                  <div
                    key={project.id}
                    className={cn(
                      "group relative flex cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2.5 pr-9 transition-colors min-[1200px]:gap-2.5 min-[1200px]:rounded-2xl min-[1200px]:px-3 min-[1200px]:pr-24",
                      selectedId === project.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-foreground",
                      project.isArchived && "opacity-60",
                      project.isFinished && "opacity-70"
                    )}
                    onClick={() => onSelect(project.id)}
                  >
                    <span
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-background/45 text-muted-foreground shadow-xs min-[1200px]:size-7 min-[1200px]:rounded-xl"
                      style={subject ? {
                        backgroundColor: subject.color + "14",
                        color: subject.color,
                      } : undefined}
                    >
                      <ProjectIcon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        {project.isFinished && (
                          <span className="hidden text-micro px-1.5 py-0.5 rounded font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-950/40 shrink-0 min-[1050px]:inline-flex">
                            Finished
                          </span>
                        )}
                        {fileCounts[project.id] > 0 && (
                          <span className="text-caption text-muted-foreground tabular-nums shrink-0 max-[900px]:hidden">
                            {fileCounts[project.id]}
                          </span>
                        )}
                      </div>
                      {((project.subjectId != null) || (project.deadline != null && !project.isFinished)) && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {subject && (
                            <span
                              className="text-micro px-1.5 py-0.5 rounded-md font-medium select-none"
                              style={{
                                backgroundColor: subject.color + "20",
                                color: subject.color
                              }}
                            >
                              {subject.shortCode}
                            </span>
                          )}
                          {project.deadline && !project.isFinished && (
                            <>
                              <span
                              className="text-micro px-1.5 py-0.5 rounded-md flex items-center gap-0.5 select-none max-[900px]:hidden"
                                style={{
                                  backgroundColor: deadlineInfo.color + "20",
                                  color: deadlineInfo.color
                                }}
                              >
                                <DeadlineIcon className="size-2.5" aria-hidden="true" />
                                {deadlineInfo.label}
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
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            aria-label={`Project actions for ${project.name}`}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-sidebar-accent/70 data-[state=open]:text-foreground data-[state=open]:opacity-100 group-hover:opacity-100"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {onToggleFinished && (
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.stopPropagation()
                                onToggleFinished(project.id)
                              }}
                            >
                              <CheckCircle2 className={cn(project.isFinished && "text-green-500")} />
                              {project.isFinished ? "Mark active" : "Mark complete"}
                            </DropdownMenuItem>
                          )}
                          {onToggleFavorite && (
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.stopPropagation()
                                onToggleFavorite(project.id)
                              }}
                            >
                              <Star className={cn(project.isFavorite && "fill-yellow-400 text-yellow-400")} />
                              {project.isFavorite ? "Unstar" : "Star"}
                            </DropdownMenuItem>
                          )}
                          {onToggleArchive && (
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.stopPropagation()
                                onToggleArchive(project.id)
                              }}
                            >
                              <Archive />
                              {project.isArchived ? "Restore" : "Archive"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={(event) => {
                              event.stopPropagation()
                              onDelete(project.id)
                            }}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
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
