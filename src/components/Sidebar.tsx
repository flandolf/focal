import { useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
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
  CircleDot,
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
  PanelLeftClose,
  PanelLeftOpen,
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

const SIDEBAR_EASE = [0.16, 1, 0.3, 1] as const
const SIDEBAR_LAYOUT_TRANSITION = { type: "spring", stiffness: 430, damping: 42, mass: 0.85 } as const
const SIDEBAR_FADE_TRANSITION = { duration: 0.16, ease: SIDEBAR_EASE } as const
const SIDEBAR_PRESS_TRANSITION = { type: "spring", stiffness: 520, damping: 34, mass: 0.65 } as const

function CollapsibleInline({
  show,
  children,
  className,
  reduceMotion,
}: {
  show: boolean
  children: ReactNode
  className?: string
  reduceMotion: boolean
}) {
  const transition = reduceMotion ? { duration: 0 } : SIDEBAR_FADE_TRANSITION

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          initial={{ opacity: 0, x: reduceMotion ? 0 : -4, width: 0 }}
          animate={{ opacity: 1, x: 0, width: "auto" }}
          exit={{ opacity: 0, x: reduceMotion ? 0 : -3, width: 0 }}
          transition={transition}
          className={cn("inline-flex min-w-0 overflow-hidden whitespace-nowrap", className)}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function CollapsibleBlock({
  show,
  children,
  className,
  reduceMotion,
}: {
  show: boolean
  children: ReactNode
  className?: string
  reduceMotion: boolean
}) {
  const transition = reduceMotion ? { duration: 0 } : SIDEBAR_FADE_TRANSITION

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: reduceMotion ? 0 : -6, width: 0 }}
          animate={{ opacity: 1, x: 0, width: "auto" }}
          exit={{ opacity: 0, x: reduceMotion ? 0 : -4, width: 0 }}
          transition={transition}
          className={cn("min-w-0 overflow-hidden", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

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
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSelect: (id: string) => void
  onSelectHome: () => void
  onDelete: (id: string) => void
  onNewProject: () => void
  onToggleFavorite?: (id: string) => void
  onToggleArchive?: (id: string) => void
  onToggleFinished?: (id: string) => void
  fileCounts: Record<string, number>
}

export function Sidebar({
  projects,
  selectedId,
  homeSelected,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  onSelectHome,
  onDelete,
  onNewProject,
  onToggleFavorite,
  onToggleArchive,
  onToggleFinished,
  fileCounts,
}: SidebarProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>("active")
  const reduceMotion = useReducedMotion() === true
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
  const filterItems: { mode: FilterMode; label: string; icon: LucideIcon; count?: number }[] = [
    { mode: "active", label: "Active", icon: CircleDot },
    { mode: "favorites", label: "Starred", icon: Star, count: favoriteCount },
    { mode: "archived", label: "Archive", icon: Archive, count: archivedCount },
    { mode: "finished", label: "Done", icon: CheckCircle2, count: finishedCount },
  ]
  const layoutTransition = reduceMotion ? { duration: 0 } : SIDEBAR_LAYOUT_TRANSITION
  const pressTransition = reduceMotion ? { duration: 0 } : SIDEBAR_PRESS_TRANSITION
  const hoverLift = reduceMotion ? undefined : { scale: 1.025 }
  const tapPress = reduceMotion ? undefined : { scale: 0.96 }

  return (
    <motion.aside
      layout
      transition={layoutTransition}
      className="glass-sidebar flex h-full flex-col overflow-hidden rounded-2xl text-sidebar-foreground transition-all duration-300 ease-out min-[1200px]:rounded-[1.35rem]"
    >
      <div className={cn(
        "pb-3 pt-3 min-[1200px]:pb-4 min-[1200px]:pt-4",
        isCollapsed ? "px-2 min-[1200px]:px-2.5" : "px-3 min-[1200px]:px-4"
      )}>
        <div className={cn(
          "flex items-center gap-3 select-none",
          isCollapsed && "justify-center"
        )}>
            <motion.span
              layout
              transition={layoutTransition}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-sidebar-border bg-background/55 text-sm shadow-sm backdrop-blur min-[1200px]:h-9 min-[1200px]:w-9 min-[1200px]:rounded-2xl"
            >
              F
            </motion.span>
            <CollapsibleBlock show={!isCollapsed} reduceMotion={reduceMotion}>
              <h1 className="font-heading text-base font-semibold">Focal</h1>
              <p className="text-caption text-muted-foreground max-[900px]:hidden">Study workspace</p>
            </CollapsibleBlock>
        </div>

        <motion.div layout className="mt-4 flex justify-center" transition={layoutTransition}>
          <Button
            onClick={onNewProject}
            className={cn("h-9 overflow-hidden rounded-2xl", isCollapsed ? "w-9 px-0" : "w-full gap-1.5")}
            size="sm"
            title={isCollapsed ? "New Project" : undefined}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <CollapsibleInline show={!isCollapsed} reduceMotion={reduceMotion}>
              New Project
            </CollapsibleInline>
          </Button>
        </motion.div>
      </div>

      <div className={cn(
        "space-y-2 min-[1200px]:space-y-3",
        isCollapsed ? "px-2 min-[1200px]:px-2.5" : "px-2.5 min-[1200px]:px-3"
      )}>
        <motion.button
          layout
          onClick={onSelectHome}
          whileHover={hoverLift}
          whileTap={tapPress}
          transition={pressTransition}
          className={cn(
            "relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors",
            homeSelected
              ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            isCollapsed && "justify-center px-0"
          )}
          title={isCollapsed ? "Today" : undefined}
        >
          <Home className="h-4 w-4 shrink-0" />
          <CollapsibleInline show={!isCollapsed} className="font-medium" reduceMotion={reduceMotion}>
            Today
          </CollapsibleInline>
          <CollapsibleInline show={!isCollapsed} className="ml-auto" reduceMotion={reduceMotion}>
            <span className="rounded-full bg-background/55 px-2 py-0.5 text-caption text-muted-foreground">
                {activeCount}
            </span>
          </CollapsibleInline>
        </motion.button>

        <motion.div
          layout
          className={cn(
            "gap-1 rounded-xl border border-sidebar-border bg-background/30 p-1 min-[1200px]:rounded-2xl",
            isCollapsed ? "flex flex-col" : "grid grid-cols-2"
          )}
          transition={layoutTransition}
        >
          {filterItems.map(({ mode, label, icon: Icon, count }) => (
            <motion.button
              key={mode}
              layout
              onClick={() => setFilterMode(mode)}
              whileHover={hoverLift}
              whileTap={tapPress}
              transition={pressTransition}
              className={cn(
                "relative flex h-8 items-center justify-center rounded-xl transition-colors",
                isCollapsed ? "px-0" : "gap-1 px-2 py-1.5 text-xs",
                filterMode === mode
                  ? "bg-background/80 text-foreground shadow-xs font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={isCollapsed ? label : undefined}
            >
              <Icon className={cn("shrink-0", isCollapsed ? "h-4 w-4" : "h-3 w-3")} />
              <CollapsibleInline show={!isCollapsed} reduceMotion={reduceMotion}>
                {label}
              </CollapsibleInline>
              {count != null && count > 0 && !isCollapsed && (
                <CollapsibleInline show={!isCollapsed} className="tabular-nums text-caption" reduceMotion={reduceMotion}>
                  {count}
                </CollapsibleInline>
              )}
            </motion.button>
          ))}
        </motion.div>
      </div>

      <ScrollArea className="min-h-0 w-full max-w-full flex-1 overflow-hidden">
        <div className={cn(
          "w-full max-w-full overflow-x-hidden pb-2 pt-3 min-[1200px]:pt-4",
          isCollapsed ? "px-2 min-[1200px]:px-2.5" : "px-1.5 min-[1200px]:px-2"
        )}>
          {filtered.length > 0 ? (
            <div className="flex w-full min-w-0 max-w-full flex-col gap-1">
              {filtered.map((project) => {
                const ProjectIcon = getSidebarProjectIcon(project)
                const subject = getSubjectById(project.subjectId)
                const deadlineInfo = getDeadlineTypeInfo(project.deadlineType)
                const DeadlineIcon = getSidebarDeadlineIcon(project.deadlineType)

                return (
                  <motion.div
                    key={project.id}
                    layout
                    whileHover={reduceMotion ? undefined : { x: isCollapsed ? 0 : 2, scale: isCollapsed ? 1.04 : 1.01 }}
                    whileTap={tapPress}
                    transition={pressTransition}
                    className={cn(
                      "group relative flex w-full min-w-0 max-w-full cursor-pointer items-center gap-2 overflow-hidden rounded-xl transition-colors",
                      isCollapsed ? "justify-center px-2 py-1.5" : "items-start px-2.5 py-2.5 pr-10 min-[1200px]:gap-2.5 min-[1200px]:rounded-2xl min-[1200px]:px-3",
                      selectedId === project.id
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/55 hover:text-foreground",
                      project.isArchived && "opacity-60",
                      project.isFinished && "opacity-70"
                    )}
                    onClick={() => onSelect(project.id)}
                  >
                    <motion.span
                      layout
                      transition={layoutTransition}
                      className={cn(
                        "flex shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-background/45 text-muted-foreground shadow-xs",
                        isCollapsed ? "size-7 rounded-xl" : "mt-0.5 size-6 min-[1200px]:size-7 min-[1200px]:rounded-xl"
                      )}
                      style={subject ? {
                        backgroundColor: subject.color + "14",
                        color: subject.color,
                      } : undefined}
                    >
                      <ProjectIcon className={cn(isCollapsed ? "size-4" : "size-3.5")} aria-hidden="true" />
                    </motion.span>
                    <CollapsibleBlock show={!isCollapsed} className="flex-1" reduceMotion={reduceMotion}>
                        <div className="flex w-full min-w-0 items-center gap-1.5">
                          <p className="w-0 min-w-0 flex-1 truncate text-sm font-medium">{project.name}</p>
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
                          <div className="mt-1 flex max-w-full flex-wrap items-center gap-1 overflow-hidden">
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
                    </CollapsibleBlock>
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                      <motion.div
                        className="absolute right-2 top-1/2 -translate-y-1/2 shrink-0"
                        initial={{ opacity: 0, x: reduceMotion ? 0 : 4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: reduceMotion ? 0 : 3 }}
                        transition={reduceMotion ? { duration: 0 } : SIDEBAR_FADE_TRANSITION}
                      >
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
                      </motion.div>
                    )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <p className={cn(
              "text-sm text-muted-foreground text-center leading-relaxed",
              isCollapsed ? "py-4 px-2" : "py-12 px-4"
            )}>
              {isCollapsed ? (
                <span className="text-micro">No projects</span>
              ) : filterMode === "archived"
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

      <div className={cn(
        "border-t border-sidebar-border/70",
        isCollapsed ? "px-2 py-2" : "px-3 py-2"
      )}>
        <motion.button
          layout
          onClick={onToggleCollapse}
          whileHover={hoverLift}
          whileTap={tapPress}
          transition={pressTransition}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground w-full"
          )}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <>
              <PanelLeftClose className="h-3.5 w-3.5" />
              Collapse
            </>
          )}
        </motion.button>
      </div>

      <StudyTimer isCollapsed={isCollapsed} onExpand={onToggleCollapse} />
    </motion.aside>
  )
}
