import { createElement } from "react"
import { Clock, Folder, Settings, FolderUp, Plus, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FileStudyPlannerButton } from "@/components/FileStudyPlannerButton"
import { formatDeadline, isOverdue, getSubjectById, getDeadlineTypeInfo } from "@/lib/utils"
import type { CalendarEvent, FileInfo, Project, StudySession } from "@/lib/types"
import { cn } from "@/lib/utils"
import { getProjectIcon, getSegmentedButtonClassName } from "./shared"

interface ProjectHeaderProps {
  project: Project
  sessions: StudySession[]
  viewMode: "files" | "sessions"
  onViewModeChange: (mode: "files" | "sessions") => void
  onOpenSettings: () => void
  onToggleFinished?: (id: string) => void
  onOpenFolder: () => void
  onAddFiles: () => void
  onCreateEvents?: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
  filteredFiles: FileInfo[]
  selectedFiles: Set<string>
}

export function ProjectHeader({
  project,
  sessions,
  viewMode,
  onViewModeChange,
  onOpenSettings,
  onToggleFinished,
  onOpenFolder,
  onAddFiles,
  onCreateEvents,
  filteredFiles,
  selectedFiles,
}: ProjectHeaderProps) {
  const subject = getSubjectById(project.subjectId)
  const deadlineInfo = getDeadlineTypeInfo(project.deadlineType)
  const projectIcon = getProjectIcon(project.subjectId)

  return (
    <div className="border-b border-border/70">
      <div className="px-5 pb-4 pt-5 min-[1200px]:px-8 min-[1200px]:pb-5 min-[1200px]:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 min-[1200px]:gap-3.5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/45 shadow-sm"
                style={subject ? { backgroundColor: subject.color + "14", color: subject.color } : undefined}
              >
                {createElement(projectIcon, { className: "h-5 w-5", "aria-hidden": true })}
              </span>
              <h2 className="truncate font-heading text-xl font-semibold min-[1200px]:text-2xl">{project.name}</h2>
            </div>
            <p className="mt-1.5 truncate text-caption text-muted-foreground">
              Files folder / <span className="font-mono">{project.folder_path}</span>
            </p>
            {project.description && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{project.description}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {project.unit && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Unit {project.unit}
                </span>
              )}
              {subject && (
                <span
                  className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: subject.color + "14", color: subject.color }}
                >
                  {subject.icon} {subject.name}
                </span>
              )}
              {project.deadline && (
                <Badge
                  variant={!project.isFinished && isOverdue(project.deadline) ? "destructive" : "secondary"}
                  className="gap-1 font-normal"
                  style={project.deadlineType ? { backgroundColor: deadlineInfo.color + "14", color: deadlineInfo.color, border: 'none' } : undefined}
                >
                  {deadlineInfo.icon} {formatDeadline(project.deadline)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onOpenSettings}>
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
                <TooltipContent side="bottom">Assessment details</TooltipContent>
            </Tooltip>
            {onToggleFinished && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                    onClick={() => onToggleFinished(project.id)}>
                    <CheckCircle2 className={cn("h-4 w-4", project.isFinished && "text-green-500")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {project.isFinished ? "Mark as current" : "Mark as complete"}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={onOpenFolder} className="h-8 gap-1.5 rounded-lg bg-background/45">
                  <FolderUp className="h-4 w-4" />
                  <span className="max-[950px]:hidden">Open Folder</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in Finder</TooltipContent>
            </Tooltip>
            {onCreateEvents && (
              <FileStudyPlannerButton
                project={project}
                files={filteredFiles}
                selectedFilePaths={selectedFiles}
                onCreateEvents={onCreateEvents}
              />
            )}
            <Button size="sm" onClick={onAddFiles} className="h-8 gap-1.5 rounded-lg">
              <Plus className="h-4 w-4" />
              <span>Add Files</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="border-t border-border/30 px-5 py-2 min-[1200px]:px-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("files")}
              aria-pressed={viewMode === "files"}
              className={getSegmentedButtonClassName(viewMode === "files", "flex items-center gap-1.5")}
            >
              <Folder className="h-3.5 w-3.5" />
              Files
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("sessions")}
              aria-pressed={viewMode === "sessions"}
              className={getSegmentedButtonClassName(viewMode === "sessions", "flex items-center gap-1.5")}
            >
              <Clock className="h-3.5 w-3.5" />
              Sessions
              {sessions.length > 0 && (
                <span className="tabular-nums text-micro">{sessions.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
