import { useState, memo, useCallback, useRef, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { staggerContainer, staggerItem } from "@/lib/motion"
import {
  Archive,
  Atom,
  BarChart3,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  CalendarDays,
  Calendar as CalendarIcon,
  Calculator,
  ChartNoAxesColumn,
  CheckCircle2,
  ClipboardList,
  CircleDot,
  Dna,
  FlaskConical,
  Folder,
  FolderOpen,
  Home,
  Landmark,
  Languages,
  Library,
  Link,
  Map as MapIcon,
  MapPin,
  MoreHorizontal,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Star,
  Timer,
  Upload,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem as CtxMenuItem,
  ContextMenuSeparator as CtxMenuSep,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { StudyTimer } from "@/components/StudyTimer"
import { cn, formatDeadline, isOverdue, sortProjectsByDeadline, getDeadlineTypeInfo, getSubjectById } from "@/lib/utils"
import type { DeadlineType, Project, StudySession, Subject } from "@/lib/types"

type FilterMode = "active" | "favorites" | "archived" | "finished"

interface AssessmentSubjectGroup {
  subjectId: string
  label: string
  shortCode: string
  color?: string
  assessments: Project[]
}

const SIDEBAR_PRESS_TRANSITION = { type: "spring", stiffness: 520, damping: 34, mass: 0.65 } as const

function CollapsibleInline({
  show,
  children,
  className,
}: {
  show: boolean
  children: ReactNode
  className?: string
}) {
  if (!show) return null

  return (
    <span className={cn("inline-flex min-w-0 overflow-hidden whitespace-nowrap", className)}>
      {children}
    </span>
  )
}

function CollapsibleBlock({
  show,
  children,
  className,
}: {
  show: boolean
  children: ReactNode
  className?: string
}) {
  if (!show) return null

  return (
    <div className={cn("min-w-0 overflow-hidden", className)}>
      {children}
    </div>
  )
}

const SUBJECT_ICONS: Record<string, LucideIcon> = {
  eng: BookOpen,
  "eng-lang": Languages,
  lit: Library,
  mm: Calculator,
  sm: Calculator,
  gm: ChartNoAxesColumn,
  chem: FlaskConical,
  phys: Atom,
  bio: Dna,
  psych: Brain,
  hist: Landmark,
  geo: MapIcon,
  econ: TrendingUp,
  bm: BriefcaseBusiness,
}

const DEADLINE_ICONS: Record<DeadlineType | "default", LucideIcon> = {
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

function getAssessmentSubjectGroups(assessments: Project[]): AssessmentSubjectGroup[] {
  const groups = new Map<string, AssessmentSubjectGroup>()

  assessments.forEach((assessment) => {
    const subject = getSubjectById(assessment.subjectId)
    const subjectId = assessment.subjectId ?? "unassigned"
    const existing = groups.get(subjectId)
    if (existing) {
      existing.assessments.push(assessment)
      return
    }

    groups.set(subjectId, {
      subjectId,
      label: subject?.name ?? "Unassigned",
      shortCode: subject?.shortCode ?? "GEN",
      color: subject?.color,
      assessments: [assessment],
    })
  })

  return Array.from(groups.values()).sort((a, b) => {
    if (a.subjectId === "unassigned") return 1
    if (b.subjectId === "unassigned") return -1
    return a.label.localeCompare(b.label)
  })
}

interface SidebarProps {
  projects: Project[]
  sessions: StudySession[]
  customSubjects: Subject[]
  availableSubjects?: Subject[]
  selectedId: string | null
  homeSelected: boolean
  timetableSelected: boolean
  analyticsSelected: boolean
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSelect: (id: string) => void
  onSelectHome: () => void
  onSelectTimetable: () => void
  onSelectAnalytics: () => void
  onDelete: (id: string) => void
  onNewProject: () => void
  onToggleFavorite?: (id: string) => void
  onToggleArchive?: (id: string) => void
  onToggleFinished?: (id: string) => void
  onOpenProjectSettings?: (id: string) => void
  onDropFolder?: (path: string) => void
  onStartPomodoroSession: (data: {
    subjectIds: string[]
    durationSeconds: number
    projectId?: string
    cycleNumber: number
  }) => Promise<StudySession>
  onUpdatePomodoroSession: (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => Promise<void>
  onDeletePomodoroSession?: (id: string) => Promise<void>
  onAddFile?: (projectId: string) => void
  fileCounts: Record<string, number>
  bumpProjectIds?: Set<string>
  onSearch?: () => void
  onSettings?: () => void
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
  onDropFolder,
  fileCounts,
  bumpProjectIds,
  onSearch,
  onSettings,
}: SidebarProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("active")
  const [isDragOver, setIsDragOver] = useState(false)
  const reduceMotion = useReducedMotion() === true

  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current += 1
    if (!isDragOver) setIsDragOver(true)
  }, [isDragOver])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragOver(false)

    if (!onDropFolder) return

    // Try to get the path from text/uri-list first (gives file:// URLs on most platforms)
    const uriList = e.dataTransfer.getData("text/uri-list")
    if (uriList) {
      const lines = uriList.split(/\r?\n/).filter((line) => line.trim())
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith("file://")) {
          onDropFolder(trimmed)
          return
        }
      }
    }

    // Fallback: try text/plain (some platforms send the raw path)
    const plain = e.dataTransfer.getData("text/plain")
    if (plain) {
      const trimmed = plain.trim()
      if (trimmed) {
        onDropFolder(trimmed)
        return
      }
    }
  }, [onDropFolder])
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
  const subjectGroups = getAssessmentSubjectGroups(filtered)
  const selectedProject = selectedId ? projects.find((project) => project.id === selectedId) : undefined
  const filterItems: { mode: FilterMode; label: string; icon: LucideIcon; count?: number }[] = [
    { mode: "active", label: "Current", icon: CircleDot },
    { mode: "favorites", label: "Starred", icon: Star, count: favoriteCount },
    { mode: "archived", label: "Archive", icon: Archive, count: archivedCount },
    { mode: "finished", label: "Done", icon: CheckCircle2, count: finishedCount },
  ]
  const pressTransition = reduceMotion ? { duration: 0 } : SIDEBAR_PRESS_TRANSITION
  const hoverLift = reduceMotion ? undefined : { scale: 1.025 }
  const tapPress = reduceMotion ? undefined : { scale: 0.96 }

  return (
    <aside
      className={cn(
        "glass-sidebar relative flex h-full flex-col overflow-hidden rounded-2xl text-sidebar-foreground transition-all duration-300 ease-out min-[1200px]:rounded-[1.35rem]",
        isDragOver && "ring-2 ring-primary/50 ring-inset"
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
            <span className="text-sm font-medium">Drop folder to create assessment</span>
          </div>
        </div>
      )}
      <div className={cn(
        "pb-2 pt-2.5 min-[1200px]:pb-3 min-[1200px]:pt-3",
        isCollapsed ? "px-1.5 min-[1200px]:px-2" : "px-3 min-[1200px]:px-4"
      )}>
        <div className={cn(
          "flex items-center gap-3 select-none",
          isCollapsed && "justify-center gap-1"
        )}>
            <CollapsibleBlock show={!isCollapsed}>
              <h1 className="font-heading text-base font-semibold">Focal</h1>
              <p className="text-caption text-muted-foreground max-[900px]:hidden">Study workspace</p>
            </CollapsibleBlock>
            <motion.button
              onClick={onToggleCollapse}
              whileHover={hoverLift}
              whileTap={tapPress}
              transition={pressTransition}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground",
                !isCollapsed && "ml-auto"
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
            className={cn("h-8 overflow-hidden rounded-2xl text-primary-foreground btn-glow-primary", isCollapsed ? "w-8 px-0" : "w-full gap-1")}
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

      <div className={cn(
        "space-y-1.5 min-[1200px]:space-y-2",
        isCollapsed ? "px-1.5 min-[1200px]:px-2" : "px-2.5 min-[1200px]:px-3"
      )}>
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
            isCollapsed && "justify-center px-0"
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
            isCollapsed && "justify-center px-0"
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
            isCollapsed && "justify-center px-0"
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
            isCollapsed ? "flex flex-col" : "grid grid-cols-2"
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
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={isCollapsed ? label : undefined}
            >
              <Icon className={cn("shrink-0", isCollapsed ? "h-4 w-4" : "h-3 w-3")} />
              <CollapsibleInline show={!isCollapsed}>
                {label}
              </CollapsibleInline>
              {count != null && count > 0 && !isCollapsed && (
                <CollapsibleInline show={!isCollapsed} className="tabular-nums text-caption">
                  {count}
                </CollapsibleInline>
              )}
            </motion.button>
          ))}
        </div>
      </div>

      <ScrollArea className="min-h-0 w-full max-w-full flex-1 overflow-hidden">
        <div className={cn(
          "w-full max-w-full overflow-x-hidden pb-1.5 pt-2 min-[1200px]:pt-2.5",
          "px-1.5 min-[1200px]:px-2"
        )}>
          {subjectGroups.length > 0 ? (
            <motion.div
              className="flex w-full min-w-0 max-w-full flex-col gap-2"
              variants={staggerContainer(0.04, 0.08)}
              initial="initial"
              animate="animate"
            >
              {!isCollapsed && (
                <motion.div
                  variants={staggerItem}
                  className="px-2 text-micro font-semibold uppercase text-muted-foreground/60"
                >
                  Subjects
                </motion.div>
              )}
              {subjectGroups.map((group) => (
                <motion.div key={group.subjectId} variants={staggerItem} className="min-w-0">
                  {!isCollapsed && (
                    <div className="mb-0.5 flex items-center gap-1.5 px-2">
                      <span
                        className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40"
                        style={group.color ? { backgroundColor: group.color } : undefined}
                      />
                      <p className="min-w-0 flex-1 truncate text-micro font-semibold uppercase text-muted-foreground/75">
                        {group.label}
                      </p>
                      <span className="text-micro tabular-nums text-muted-foreground/60">{group.assessments.length}</span>
                    </div>
                  )}
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-0.5">
                {group.assessments.map((project) => {
                const ProjectIcon = getSidebarProjectIcon(project)
                const subject = getSubjectById(project.subjectId)
                const deadlineInfo = getDeadlineTypeInfo(project.deadlineType)
                const DeadlineIcon = getSidebarDeadlineIcon(project.deadlineType)

                return (
                    <ContextMenu key={project.id}>
                      <ContextMenuTrigger asChild>
                    <motion.div
                      key={project.id}
                      layout
                      variants={staggerItem}
                      whileHover={reduceMotion ? undefined : { x: isCollapsed ? 0 : 2, scale: isCollapsed ? 1.04 : 1.01 }}
                      whileTap={tapPress}
                      transition={pressTransition}
                      className={cn(
                        "group relative flex w-full min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg transition-colors",
                        isCollapsed ? "justify-center px-2 py-1.25" : "px-2 py-1.25 pr-8 min-[1200px]:rounded-xl",
                        selectedId === project.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm active-glow active-glow-pulse"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-foreground",
                        project.isArchived && "opacity-60",
                        project.isFinished && "opacity-70"
                      )}
                      onClick={() => onSelect(project.id)}
                    >
                      <span className="relative shrink-0">
                        <span
                          className={cn(
                            "flex items-center justify-center rounded-md border border-sidebar-border bg-background/45 text-muted-foreground shadow-xs",
                            isCollapsed ? "size-6.5 rounded-xl" : "size-5"
                          )}
                          style={subject ? {
                            backgroundColor: subject.color + "14",
                            color: subject.color,
                          } : undefined}
                        >
                          <ProjectIcon className={cn(isCollapsed ? "size-4" : "size-3")} aria-hidden="true" />
                        </span>
                        {project.isLinked && isCollapsed && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary/90 ring-1 ring-background">
                            <Link className="size-2 text-background" />
                          </span>
                        )}
                      </span>
                      <CollapsibleBlock show={!isCollapsed} className="flex-1">
                          <div className="flex w-full min-w-0 items-center gap-1">
                            <p className="w-0 min-w-0 flex-1 truncate text-xs font-medium leading-4">{project.name}</p>
                            {project.isFinished && (
                              <span className="hidden text-micro font-medium text-green-600 dark:text-green-400 shrink-0 min-[1050px]:inline-flex">
                                Done
                              </span>
                            )}
                            {project.isLinked && (
                              <span className="shrink-0 text-muted-foreground/70" title="Linked folder">
                                <Link className="size-3" aria-hidden="true" />
                              </span>
                            )}
                            {fileCounts[project.id] > 0 && (
                              <span className={cn(
                                "text-caption text-muted-foreground tabular-nums shrink-0 max-[900px]:hidden inline-block",
                                bumpProjectIds?.has(project.id) && "animate-badge-bump",
                              )}>
                                {fileCounts[project.id]}
                              </span>
                            )}
                          </div>
                          {project.deadline && !project.isFinished && (
                            <div className="mt-0.5 flex max-w-full items-center gap-1 overflow-hidden">
                              {project.deadline && !project.isFinished && (
                                <>
                                  <span
                                  className="flex items-center gap-0.5 text-micro text-muted-foreground/70 select-none max-[900px]:hidden"
                                    style={{
                                      color: deadlineInfo.color
                                    }}
                                  >
                                    <DeadlineIcon className="size-2.5" aria-hidden="true" />
                                    {deadlineInfo.label}
                                  </span>
                                  <span className={cn(
                                    "truncate text-micro font-medium select-none",
                                    isOverdue(project.deadline)
                                      ? "text-destructive"
                                      : "text-muted-foreground"
                                  )}>
                                    {formatDeadline(project.deadline)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                      </CollapsibleBlock>
                      {!isCollapsed && (
                        <div
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 shrink-0"
                        >
                          <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              aria-label={`Assessment actions for ${project.name}`}
                              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-sidebar-accent/70 data-[state=open]:text-foreground data-[state=open]:opacity-100 group-hover:opacity-100"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            {onOpenProjectSettings && (
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.stopPropagation()
                                  onOpenProjectSettings(project.id)
                                }}
                              >
                                <Pencil />
                                Rename
                              </DropdownMenuItem>
                            )}
                            {onToggleFinished && (
                              <DropdownMenuItem
                                onSelect={(event) => {
                                  event.stopPropagation()
                                  onToggleFinished(project.id)
                                }}
                              >
                                <CheckCircle2 className={cn(project.isFinished && "text-green-500")} />
                                {project.isFinished ? "Mark current" : "Mark complete"}
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
                      )}
                    </motion.div>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-44">
                        {onOpenProjectSettings && (
                          <CtxMenuItem
                            onSelect={(event) => {
                              event.stopPropagation()
                              onOpenProjectSettings(project.id)
                            }}
                          >
                            <Pencil />
                            Rename
                          </CtxMenuItem>
                        )}
                        <CtxMenuItem
                          onSelect={(event) => {
                            event.stopPropagation()
                            const subjectIds = project.subjectId ? [project.subjectId] : []
                            void onStartPomodoroSession({
                              subjectIds,
                              durationSeconds: 25 * 60,
                              projectId: project.id,
                              cycleNumber: 0,
                            })
                          }}
                        >
                          <Timer />
                          Start Session
                        </CtxMenuItem>
                        {onAddFile && (
                          <CtxMenuItem
                            onSelect={(event) => {
                              event.stopPropagation()
                              onAddFile(project.id)
                            }}
                          >
                            <Upload />
                            Add File
                          </CtxMenuItem>
                        )}
                        <CtxMenuSep />
                        {onToggleFinished && (
                          <CtxMenuItem
                            onSelect={(event) => {
                              event.stopPropagation()
                              onToggleFinished(project.id)
                            }}
                          >
                            <CheckCircle2 />
                            {project.isFinished ? "Mark current" : "Mark complete"}
                          </CtxMenuItem>
                        )}
                        {onToggleFavorite && (
                          <CtxMenuItem
                            onSelect={(event) => {
                              event.stopPropagation()
                              onToggleFavorite(project.id)
                            }}
                          >
                            <Star />
                            {project.isFavorite ? "Unstar" : "Star"}
                          </CtxMenuItem>
                        )}
                        {onToggleArchive && (
                          <CtxMenuItem
                            onSelect={(event) => {
                              event.stopPropagation()
                              onToggleArchive(project.id)
                            }}
                          >
                            <Archive />
                            {project.isArchived ? "Restore" : "Archive"}
                          </CtxMenuItem>
                        )}
                        <CtxMenuSep />
                        <CtxMenuItem
                          variant="destructive"
                          onSelect={(event) => {
                            event.stopPropagation()
                            onDelete(project.id)
                          }}
                        >
                          <Trash2 />
                          Delete
                        </CtxMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                )
              })}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : null}
        </div>
      </ScrollArea>

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
  )
})
