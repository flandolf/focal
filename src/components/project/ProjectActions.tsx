import { Settings, FolderUp, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CalendarEvent, FileInfo, Project } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProjectActionsProps {
  project: Project;
  onOpenSettings: () => void;
  onToggleFinished?: (id: string) => void;
  onOpenFolder: () => void;
  onAddFiles: () => void;
  onCreateEvents?: (
    events: Omit<CalendarEvent, "id" | "created_at">[],
  ) => Promise<void>;
  filteredFiles: FileInfo[];
  selectedFiles: Set<string>;
}

export function ProjectActions({
  project,
  onOpenSettings,
  onToggleFinished,
  onOpenFolder,
  onAddFiles,
}: ProjectActionsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Assessment details</TooltipContent>
      </Tooltip>
      {onToggleFinished && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => onToggleFinished(project.id)}
            >
              <CheckCircle2
                className={cn(
                  "h-4 w-4",
                  project.isFinished && "text-green-500",
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {project.isFinished ? "Mark as current" : "Mark as complete"}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenFolder}
            className="h-8 gap-1.5 rounded-lg bg-background/45"
          >
            <FolderUp className="h-4 w-4" />
            <span className="max-[950px]:hidden">Open Folder</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open in Finder</TooltipContent>
      </Tooltip>
      <Button
        size="sm"
        onClick={onAddFiles}
        className="h-8 gap-1.5 rounded-lg text-background"
      >
        <Plus className="h-4 w-4" />
        <span>Add Files</span>
      </Button>
    </div>
  );
}
