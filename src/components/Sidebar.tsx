import { useState, memo, useCallback, useRef, useMemo, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Archive,
  ArrowUpDown,
  BarChart3,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FolderOpen,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Star,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StudyTimer } from "@/components/StudyTimer";
import { AssessmentRow } from "@/components/AssessmentRow";
import { cn, getSubjectById } from "@/lib/utils";
import type { ProjectSortKey } from "@/hooks/useProjects";
import { sortProjects } from "@/hooks/useProjects";
import type { Project, StudySession, Subject } from "@/lib/types";

type FilterMode = "active" | "favorites" | "archived" | "finished";

interface AssessmentSubjectGroup {
  subjectId: string;
  label: string;
  shortCode: string;
  color?: string;
  assessments: Project[];
}

type SidebarListItem =
  | { type: "top-header"; id: "top-header" }
  | { type: "group-header"; id: string; group: AssessmentSubjectGroup }
  | { type: "assessment"; id: string; project: Project };

const SIDEBAR_PRESS_TRANSITION = {
  type: "spring",
  stiffness: 520,
  damping: 34,
  mass: 0.65,
} as const;

function CollapsibleInline({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!show) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-0 overflow-hidden whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

function CollapsibleBlock({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!show) return null;
  return (
    <div className={cn("min-w-0 overflow-hidden", className)}>{children}</div>
  );
}

function getAssessmentSubjectGroups(
  assessments: Project[],
): AssessmentSubjectGroup[] {
  const groups = new Map<string, AssessmentSubjectGroup>();
  assessments.forEach((assessment) => {
    const subject = getSubjectById(assessment.subjectId);
    const subjectId = assessment.subjectId ?? "unassigned";
    const existing = groups.get(subjectId);
    if (existing) {
      existing.assessments.push(assessment);
      return;
    }
    groups.set(subjectId, {
      subjectId,
      label: subject?.name ?? "Unassigned",
      shortCode: subject?.shortCode ?? "GEN",
      color: subject?.color,
      assessments: [assessment],
    });
  });
  return Array.from(groups.values()).sort((a, b) => {
    if (a.subjectId === "unassigned") return 1;
    if (b.subjectId === "unassigned") return -1;
    return a.label.localeCompare(b.label);
  });
}

const SORT_OPTIONS: { key: ProjectSortKey; label: string }[] = [
  { key: "deadline", label: "Deadline" },
  { key: "name", label: "Name A–Z" },
  { key: "created-newest", label: "Newest" },
  { key: "created-oldest", label: "Oldest" },
  { key: "fileCount", label: "File count" },
];

interface SidebarProps {
  projects: Project[];
  sessions: StudySession[];
  customSubjects: Subject[];
  availableSubjects?: Subject[];
  selectedId: string | null;
  homeSelected: boolean;
  timetableSelected: boolean;
  analyticsSelected: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (id: string) => void;
  onSelectHome: () => void;
  onSelectTimetable: () => void;
  onSelectAnalytics: () => void;
  onDelete: (id: string) => void;
  onNewProject: () => void;
  onToggleFavorite?: (id: string) => void;
  onToggleArchive?: (id: string) => void;
  onToggleFinished?: (id: string) => void;
  onOpenProjectSettings?: (id: string) => void;
  onDuplicateProject?: (id: string) => void;
  onDropFolder?: (path: string) => void;
  onStartPomodoroSession: (data: {
    subjectIds: string[];
    durationSeconds: number;
    projectId?: string;
    cycleNumber: number;
  }) => Promise<StudySession>;
  onUpdatePomodoroSession: (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>,
  ) => Promise<void>;
  onDeletePomodoroSession?: (id: string) => Promise<void>;
  onAddFile?: (projectId: string) => void;
  fileCounts: Record<string, number>;
  bumpProjectIds?: Set<string>;
  onSearch?: () => void;
  onSettings?: () => void;
  sortKey?: ProjectSortKey;
  onSortChange?: (key: ProjectSortKey) => void;
  selectedProjectIds?: Set<string>;
  onToggleProjectSelection?: (id: string) => void;
  onBulkArchive?: (ids: string[]) => void;
  onBulkUnarchive?: (ids: string[]) => void;
  onBulkFinish?: (ids: string[]) => void;
  onBulkDelete?: (ids: string[]) => void;
}

export const Sidebar = memo(function Sidebar({
  projects,
  sessions,
  customSubjects,
  availableSubjects,
  selectedId,
  homeSelected,
  timetableSelected,
  analyticsSelected,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  onSelectHome,
  onSelectTimetable,
  onSelectAnalytics,
  onDelete,
  onNewProject,
  onToggleFavorite,
  onToggleArchive,
  onToggleFinished,
  onStartPomodoroSession,
  onUpdatePomodoroSession,
  onDeletePomodoroSession,
  onAddFile,
  onOpenProjectSettings,
  onDuplicateProject,
  onDropFolder,
  fileCounts,
  bumpProjectIds,
  onSearch,
  onSettings,
  sortKey = "deadline",
  onSortChange,
  selectedProjectIds,
  onToggleProjectSelection,
  onBulkArchive,
  onBulkUnarchive,
  onBulkFinish,
  onBulkDelete,
}: SidebarProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("active");
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const reduceMotion = useReducedMotion() === true;

  const dragCounter = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (!isDragOver) setIsDragOver(true);
    },
    [isDragOver],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragOver(false);

      if (!onDropFolder) return;

      const uriList = e.dataTransfer.getData("text/uri-list");
      if (uriList) {
        const lines = uriList.split(/\r?\n/).filter((line) => line.trim());
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("file://")) {
            onDropFolder(trimmed);
            return;
          }
        }
      }

      const plain = e.dataTransfer.getData("text/plain");
      if (plain) {
        const trimmed = plain.trim();
        if (trimmed) {
          onDropFolder(trimmed);
          return;
        }
      }
    },
    [onDropFolder],
  );

  const effectiveSortKey = sortKey ?? "deadline";
  const sorted = useMemo(() => sortProjects(projects, effectiveSortKey, fileCounts), [projects, effectiveSortKey, fileCounts]);

  const filtered = useMemo(() => sorted.filter((p) => {
    if (filterMode === "favorites")
      return p.isFavorite && !p.isArchived && !p.isFinished;
    if (filterMode === "archived") return p.isArchived;
    if (filterMode === "finished") return p.isFinished && !p.isArchived;
    return !p.isArchived && !p.isFinished;
  }), [sorted, filterMode]);

  const subjectGroups = useMemo(() => getAssessmentSubjectGroups(filtered), [filtered]);

  const parentRef = useRef<HTMLDivElement>(null);

  const flatItems = useMemo<SidebarListItem[]>(() => {
    const items: SidebarListItem[] = [];
    if (!isCollapsed) {
      items.push({ type: "top-header", id: "top-header" });
    }
    for (const group of subjectGroups) {
      if (!isCollapsed) {
        items.push({ type: "group-header", id: `group-${group.subjectId}`, group });
      }
      for (const project of group.assessments) {
        items.push({ type: "assessment", id: project.id, project });
      }
    }
    return items;
  }, [subjectGroups, isCollapsed]);

  // ponytail: TanStack Virtual's useVirtualizer returns non-memoizable functions;
  // we rely on TanStack Virtual intentionally and accept that React Compiler skips this hook.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const item = flatItems[index];
      if (!item) return 44;
      if (item.type === "top-header") return 20;
      if (item.type === "group-header") return 24;
      return isCollapsed ? 32 : 44;
    },
    overscan: 5,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const selectedProject = selectedId
    ? projects.find((project) => project.id === selectedId)
    : undefined;

  const { activeCount, filterItems } = useMemo(() => {
    let favoriteCount = 0;
    let archivedCount = 0;
    let finishedCount = 0;
    let activeCount = 0;
    for (const p of sorted) {
      if (p.isArchived) {
        archivedCount++;
      } else if (p.isFinished) {
        finishedCount++;
      } else {
        activeCount++;
        if (p.isFavorite) favoriteCount++;
      }
    }
    const items: {
      mode: FilterMode;
      label: string;
      icon: LucideIcon;
      count?: number;
    }[] = [
      { mode: "active", label: "Current", icon: CircleDot },
      { mode: "favorites", label: "Starred", icon: Star, count: favoriteCount },
      { mode: "archived", label: "Archive", icon: Archive, count: archivedCount },
      { mode: "finished", label: "Done", icon: CheckCircle2, count: finishedCount },
    ];
    return { activeCount, filterItems: items };
  }, [sorted]);
  const pressTransition = reduceMotion
    ? { duration: 0 }
    : SIDEBAR_PRESS_TRANSITION;
  const hoverLift = reduceMotion ? undefined : { scale: 1.025 };
  const tapPress = reduceMotion ? undefined : { scale: 0.96 };

  const selectedCount = selectedProjectIds?.size ?? 0;
  const selectedIdsArray = selectedProjectIds
    ? Array.from(selectedProjectIds)
    : [];
  const bulkBarVisible = selectedCount > 0 && !isCollapsed;

  const sortLabel =
    SORT_OPTIONS.find((o) => o.key === sortKey)?.label ?? "Sort";

  return (
    <aside
      className={cn(
        "glass-sidebar relative flex h-full flex-col overflow-hidden rounded-2xl text-sidebar-foreground transition-all duration-300 ease-out min-[1200px]:rounded-[1.35rem]",
        isDragOver && "ring-2 ring-primary/50 ring-inset",
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-[inherit] bg-primary/8 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-primary">
            <FolderOpen className="h-8 w-8" />
            <span className="text-sm font-medium">
              Drop folder to create assessment
            </span>
          </div>
        </div>
      )}
      <div
        className={cn(
          "pb-2 pt-2.5 min-[1200px]:pb-3 min-[1200px]:pt-3",
          isCollapsed ? "px-1.5 min-[1200px]:px-2" : "px-3 min-[1200px]:px-4",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 select-none",
            isCollapsed && "justify-center gap-1",
          )}
        >
          <CollapsibleBlock show={!isCollapsed}>
            <h1 className="font-heading text-base font-semibold">Focal</h1>
            <p className="text-caption text-muted-foreground max-[900px]:hidden">
              Study workspace
            </p>
          </CollapsibleBlock>
          <motion.button
            onClick={onToggleCollapse}
            whileHover={hoverLift}
            whileTap={tapPress}
            transition={pressTransition}
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
              !isCollapsed && "ml-auto",
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftClose className="h-3.5 w-3.5" />
            )}
          </motion.button>
        </div>

        <div className="mt-3 flex justify-center">
          <Button
            onClick={onNewProject}
            className={cn(
              "h-8 overflow-hidden rounded-2xl text-primary-foreground btn-glow-primary",
              isCollapsed ? "w-8 px-0" : "w-full gap-1",
            )}
            size="sm"
            title={isCollapsed ? "New Assessment" : undefined}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <CollapsibleInline show={!isCollapsed}>
              New Assessment
            </CollapsibleInline>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "space-y-1.5 min-[1200px]:space-y-2",
          isCollapsed ? "px-1.5 min-[1200px]:px-2" : "px-2.5 min-[1200px]:px-3",
        )}
      >
        <motion.button
          onClick={onSelectHome}
          whileHover={hoverLift}
          whileTap={tapPress}
          transition={pressTransition}
          className={cn(
            "relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition-colors",
            homeSelected
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm active-glow active-glow-pulse"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            isCollapsed && "justify-center px-0",
          )}
          title={isCollapsed ? "Today" : undefined}
        >
          <Home className="h-4 w-4 shrink-0" />
          <CollapsibleInline show={!isCollapsed} className="font-medium">
            Today
          </CollapsibleInline>
          <CollapsibleInline show={!isCollapsed} className="ml-auto">
            <span className="rounded-full bg-background/55 px-2 py-0.5 text-caption text-muted-foreground">
              {activeCount}
            </span>
          </CollapsibleInline>
        </motion.button>

        <motion.button
          onClick={onSelectTimetable}
          whileHover={hoverLift}
          whileTap={tapPress}
          transition={pressTransition}
          className={cn(
            "relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition-colors",
            timetableSelected
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm active-glow active-glow-pulse"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            isCollapsed && "justify-center px-0",
          )}
          title={isCollapsed ? "Timetable" : undefined}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <CollapsibleInline show={!isCollapsed} className="font-medium">
            Timetable
          </CollapsibleInline>
        </motion.button>

        <motion.button
          onClick={onSelectAnalytics}
          whileHover={hoverLift}
          whileTap={tapPress}
          transition={pressTransition}
          className={cn(
            "relative flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition-colors",
            analyticsSelected
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm active-glow active-glow-pulse"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            isCollapsed && "justify-center px-0",
          )}
          title={isCollapsed ? "Analytics" : undefined}
        >
          <BarChart3 className="h-4 w-4 shrink-0" />
          <CollapsibleInline show={!isCollapsed} className="font-medium">
            Analytics
          </CollapsibleInline>
        </motion.button>

        <div
          className={cn(
            "gap-1 rounded-xl border border-sidebar-border bg-background/30 p-0.5 min-[1200px]:rounded-2xl",
            isCollapsed ? "flex flex-col" : "grid grid-cols-2",
          )}
        >
          {filterItems.map(({ mode, label, icon: Icon, count }) => (
            <motion.button
              key={mode}
              onClick={() => setFilterMode(mode)}
              whileHover={hoverLift}
              whileTap={tapPress}
              transition={pressTransition}
              className={cn(
                "relative flex h-7 items-center justify-center rounded-xl transition-colors",
                isCollapsed ? "px-0" : "gap-1 px-2 py-1.5 text-xs",
                filterMode === mode
                  ? "bg-background/80 text-foreground shadow-xs font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={isCollapsed ? label : undefined}
            >
              <Icon
                className={cn("shrink-0", isCollapsed ? "h-4 w-4" : "h-3 w-3")}
              />
              <CollapsibleInline show={!isCollapsed}>{label}</CollapsibleInline>
              {count != null && count > 0 && !isCollapsed && (
                <CollapsibleInline
                  show={!isCollapsed}
                  className="tabular-nums text-caption"
                >
                  {count}
                </CollapsibleInline>
              )}
            </motion.button>
          ))}
        </div>

        {/* Sort dropdown */}
        {!isCollapsed && onSortChange && (
          <DropdownMenu open={showSortMenu} onOpenChange={setShowSortMenu}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-micro text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <ArrowUpDown className="h-3 w-3 shrink-0" />
                <span>{sortLabel}</span>
                <ChevronDown className="ml-auto h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.key}
                  onSelect={() => onSortChange(opt.key)}
                  className={cn(
                    sortKey === opt.key && "font-medium text-foreground",
                  )}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Virtualized project list */}
      <div
        ref={parentRef}
        className={cn(
          "min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden",
          "pb-1.5 pt-2 min-[1200px]:pt-2.5 px-1.5 min-[1200px]:px-2",
        )}
      >
        {subjectGroups.length > 0 ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
              }}
            >
              {virtualItems.map((virtualItem) => {
                const item = flatItems[virtualItem.index];
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    className="mb-0.5"
                  >
                    {item.type === "top-header" && !isCollapsed && (
                      <div className="px-2 text-micro font-semibold uppercase text-muted-foreground/60">
                        Subjects
                      </div>
                    )}
                    {item.type === "group-header" && !isCollapsed && (
                      <div className="mb-0.5 flex items-center gap-2 px-2">
                        <span
                          className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40"
                          style={
                            item.group.color
                              ? { backgroundColor: item.group.color }
                              : undefined
                          }
                        />
                        <p className="min-w-0 flex-1 truncate text-micro font-semibold uppercase text-muted-foreground/75">
                          {item.group.label}
                        </p>
                        <span className="text-micro tabular-nums text-muted-foreground/60">
                          {item.group.assessments.length}
                        </span>
                      </div>
                    )}
                    {item.type === "assessment" && (
                      <AssessmentRow
                        project={item.project}
                        isCollapsed={isCollapsed}
                        selectedId={selectedId}
                        selectedProjectIds={selectedProjectIds}
                        onToggleProjectSelection={onToggleProjectSelection}
                        onSelect={onSelect}
                        fileCounts={fileCounts}
                        bumpProjectIds={bumpProjectIds}
                        onOpenProjectSettings={onOpenProjectSettings}
                        onDuplicateProject={onDuplicateProject}
                        onToggleFinished={onToggleFinished}
                        onToggleFavorite={onToggleFavorite}
                        onToggleArchive={onToggleArchive}
                        onDelete={onDelete}
                        onStartPomodoroSession={onStartPomodoroSession}
                        onAddFile={onAddFile}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Bulk action bar */}
      {bulkBarVisible &&
        (onBulkArchive ?? onBulkUnarchive) &&
        onBulkFinish &&
        onBulkDelete && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="mx-2 mb-2 flex items-center gap-1.5 rounded-xl border border-primary/20 bg-sidebar-accent/80 backdrop-blur-sm p-1.5"
          >
            <span className="px-2 text-micro font-medium tabular-nums">
              {selectedCount} selected
            </span>
            <div className="ml-auto flex items-center gap-0.5">
              {filterMode === "archived"
                ? onBulkUnarchive && (
                    <button
                      type="button"
                      onClick={() => onBulkUnarchive(selectedIdsArray)}
                      className="rounded-lg px-2 py-1 text-micro text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      Restore
                    </button>
                  )
                : onBulkArchive && (
                    <button
                      type="button"
                      onClick={() => onBulkArchive(selectedIdsArray)}
                      className="rounded-lg px-2 py-1 text-micro text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      Archive
                    </button>
                  )}
              <button
                type="button"
                onClick={() => onBulkFinish(selectedIdsArray)}
                className="rounded-lg px-2 py-1 text-micro text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
              >
                Finish
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onBulkDelete) onBulkDelete(selectedIdsArray);
                }}
                className="rounded-lg px-2 py-1 text-micro text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                Delete
              </button>
            </div>
          </motion.div>
        )}

      <StudyTimer
        isCollapsed={isCollapsed}
        onExpand={onToggleCollapse}
        customSubjects={customSubjects}
        availableSubjects={availableSubjects}
        sessions={sessions}
        selectedProject={selectedProject}
        onSearch={onSearch}
        onSettings={onSettings}
        onStartSession={onStartPomodoroSession}
        onUpdateSession={onUpdatePomodoroSession}
        onDeleteSession={onDeletePomodoroSession}
      />
    </aside>
  );
});
