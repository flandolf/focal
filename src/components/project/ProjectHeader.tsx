import { createElement, useMemo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Clock,
  Download,
  Folder,
  Bookmark,
  Link,
  Settings,
  FolderUp,
  Plus,
  CheckCircle2,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatDeadline,
  isOverdue,
  getSubjectById,
  getDeadlineTypeInfo,
} from "@/lib/utils";
import type {
  Project,
  StudySession,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { pressable, staggerContainer, staggerItem } from "@/lib/motion";
import { getProjectIcon, getSegmentedButtonClassName } from "./shared";

interface ProjectHeaderProps {
  project: Project;
  sessions: StudySession[];
  viewMode: "files" | "sessions";
  onViewModeChange: (mode: "files" | "sessions") => void;
  onOpenSettings: () => void;
  onToggleFinished?: (id: string) => void;
  onOpenFolder: () => void;
  onAddFiles: () => void;
  onRefresh?: () => void;
  hasPendingChanges?: boolean;
  onExport?: () => void;
  onSaveAsTemplate?: () => void;
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
  onRefresh,
  hasPendingChanges,
  onExport,
  onSaveAsTemplate,
}: ProjectHeaderProps) {
  const subject = getSubjectById(project.subjectId);
  const deadlineInfo = getDeadlineTypeInfo(project.deadlineType);
  const projectIcon = getProjectIcon(project.subjectId);
  const headerVariants = useMemo(() => staggerContainer(0.06, 0.04), []);
  const reduceMotion = useReducedMotion() === true;

  return (
    <motion.div
      className="border-b border-border/60"
      variants={headerVariants}
      initial="initial"
      animate="animate"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 min-[1200px]:px-5">
        {/* Left: icon + title + inline metadata */}
        <motion.div
          variants={staggerItem}
          className="flex min-w-0 items-center gap-2.5"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-background/45 shadow-sm"
            style={
              subject
                ? {
                    backgroundColor: subject.color + "14",
                    color: subject.color,
                  }
                : undefined
            }
          >
            {createElement(projectIcon, {
              className: "h-4 w-4",
              "aria-hidden": true,
            })}
          </span>

          <div className="flex min-w-0 items-center gap-2">
            <div className="group/left flex min-w-0 items-center gap-1.5">
              <h2 className="truncate text-base font-medium">{project.name}</h2>
              <motion.button
                type="button"
                onClick={onOpenSettings}
                whileHover={reduceMotion ? undefined : { rotate: -14 }}
                transition={{ type: "spring", stiffness: 520, damping: 24 }}
                className="flex h-5 w-5 shrink-0 origin-top-right items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,background-color] duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/left:opacity-100"
                aria-label={`Rename ${project.name}`}
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </motion.button>
            </div>

            <div className="hidden items-center gap-1 sm:flex">
              {project.deadline && (
                <Badge
                  variant={
                    !project.isFinished && isOverdue(project.deadline)
                      ? "destructive"
                      : "secondary"
                  }
                  className="h-4 gap-0.5 border-0 px-1.5 text-[0.6rem] font-normal"
                  style={
                    project.deadlineType
                      ? {
                          backgroundColor: deadlineInfo.color + "14",
                          color: deadlineInfo.color,
                        }
                      : undefined
                  }
                >
                  {deadlineInfo.icon} {formatDeadline(project.deadline)}
                </Badge>
              )}
              {project.isLinked && (
                <span className="hidden h-4 items-center gap-0.5 rounded bg-primary/10 px-1.5 text-[0.6rem] font-medium text-primary lg:flex">
                  <Link className="h-2.5 w-2.5" aria-hidden="true" />
                  Linked
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Right: view toggle + actions */}
        <motion.div
          variants={staggerItem}
          className="flex shrink-0 items-center gap-1"
        >
          {/* View toggle */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("files")}
              aria-pressed={viewMode === "files"}
              className={getSegmentedButtonClassName(
                viewMode === "files",
                "flex items-center gap-1",
              )}
            >
              <Folder className="h-3.5 w-3.5" />
              Files
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("sessions")}
              aria-pressed={viewMode === "sessions"}
              className={getSegmentedButtonClassName(
                viewMode === "sessions",
                "flex items-center gap-1",
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              Sessions
              {sessions.length > 0 && (
                <span className="tabular-nums text-micro">
                  {sessions.length}
                </span>
              )}
            </button>
          </div>

          <div className="mx-1 hidden h-4 w-px bg-border/60 sm:block" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={onOpenSettings}
                aria-label="Assessment details"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Assessment details</TooltipContent>
          </Tooltip>

          {onRefresh && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-8 w-8 rounded-lg"
                  onClick={onRefresh}
                  aria-label={hasPendingChanges ? "Refresh files with external changes" : "Refresh files"}
                >
                  <RefreshCw className="h-4 w-4" />
                  {hasPendingChanges && (
                    <motion.span
                      aria-hidden
                      className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background"
                      animate={
                        reduceMotion
                          ? undefined
                          : { scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }
                      }
                      transition={{
                        duration: 1.6,
                        repeat: 3,
                        ease: "easeOut",
                      }}
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {hasPendingChanges
                  ? "External changes detected — click to refresh"
                  : "Refresh files"}
              </TooltipContent>
            </Tooltip>
          )}

          {onToggleFinished && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => onToggleFinished(project.id)}
                  aria-label={project.isFinished ? "Mark as current" : "Mark as complete"}
                >
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={project.isFinished ? "done" : "todo"}
                      initial={{
                        scale: 0.55,
                        opacity: 0,
                        rotate: project.isFinished ? -8 : 6,
                      }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      exit={{
                        scale: 0.55,
                        opacity: 0,
                        rotate: project.isFinished ? 6 : -8,
                      }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : {
                              type: "spring",
                              stiffness: 620,
                              damping: 30,
                              mass: 0.5,
                            }
                      }
                      className="flex items-center justify-center"
                    >
                      <CheckCircle2
                        className={cn(
                          "h-4 w-4",
                          project.isFinished && "text-green-500",
                        )}
                      />
                    </motion.span>
                  </AnimatePresence>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {project.isFinished ? "Mark as current" : "Mark as complete"}
              </TooltipContent>
            </Tooltip>
          )}

          {onSaveAsTemplate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={onSaveAsTemplate}
                  aria-label="Save as template"
                >
                  <Bookmark className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Save as template</TooltipContent>
            </Tooltip>
          )}

          {onExport && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={onExport}
                  aria-label="Export project"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export project</TooltipContent>
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
                <span className="max-[950px]:hidden">Open</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open in Finder</TooltipContent>
          </Tooltip>

          <motion.span {...pressable(reduceMotion)} className="inline-flex">
            <Button
              size="sm"
              onClick={onAddFiles}
              className="h-8 gap-1.5 rounded-lg text-background shadow-[0_1px_0_oklch(0_0_0/0.06)] transition-shadow hover:shadow-[0_2px_4px_oklch(0_0_0/0.10)]"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </Button>
          </motion.span>
        </motion.div>
      </div>
    </motion.div>
  );
}
