import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Link2, Plus, X, ChevronDown, ChevronRight, ExternalLink, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { staggerContainer, staggerItem } from "@/lib/motion"
import { getSubjectById } from "@/lib/utils"
import type { Project } from "@/lib/types"

interface ProjectDependenciesPanelProps {
  project: Project
  availableProjects: Project[]
  onAddDependency: (dependsOnId: string) => void
  onRemoveDependency: (dependsOnId: string) => void
  onOpenProject: (projectId: string) => void
}

export function ProjectDependenciesPanel({
  project,
  availableProjects,
  onAddDependency,
  onRemoveDependency,
  onOpenProject,
}: ProjectDependenciesPanelProps) {
  const [expanded, setExpanded] = useState((project.dependsOn?.length ?? 0) > 0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [query, setQuery] = useState("")
  const panelVariants = useMemo(() => staggerContainer(0.05, 0.03), [])

  const dependencies = useMemo(() => {
    return (project.dependsOn ?? [])
      .map((id) => availableProjects.find((p) => p.id === id))
      .filter((p): p is Project => Boolean(p))
  }, [project.dependsOn, availableProjects])

  const addableProjects = useMemo(() => {
    const dependsOnSet = new Set(project.dependsOn ?? [])
    return availableProjects
      .filter((p) => p.id !== project.id && !dependsOnSet.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [availableProjects, project.id, project.dependsOn])

  const filteredAddable = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return addableProjects
    return addableProjects.filter((p) => p.name.toLowerCase().includes(q))
  }, [addableProjects, query])

  const unfinishedCount = useMemo(
    () => dependencies.filter((d) => !d.isFinished && !d.isArchived).length,
    [dependencies]
  )

  const handlePickerChange = (open: boolean) => {
    setPickerOpen(open)
    if (!open) setQuery("")
  }

  const handleSelect = (id: string) => {
    onAddDependency(id)
    setPickerOpen(false)
    setQuery("")
  }

  return (
    <motion.div
      className="border-b border-border/70"
      variants={panelVariants}
      initial="initial"
      animate="animate"
    >
      <div className="px-5 py-2 min-[1200px]:px-8 min-[1200px]:py-3">
        <motion.div variants={staggerItem}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Link2 className="h-3.5 w-3.5" />
            Dependencies
            {dependencies.length > 0 && (
              <span className="text-micro tabular-nums text-muted-foreground/60">
                {dependencies.length}
              </span>
            )}
            {unfinishedCount > 0 && (
              <span
                className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-micro font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10"
                title={`${unfinishedCount} unfinished ${unfinishedCount === 1 ? "dependency" : "dependencies"}`}
              >
                <AlertTriangle className="h-3 w-3" />
                {unfinishedCount} blocking
              </span>
            )}
          </button>
          {expanded && (
            <div className="mt-1.5 space-y-1 px-1">
              {dependencies.length === 0 && (
                <p className="py-2 text-sm text-muted-foreground/60">
                  No dependencies. Link other assessments that must be done first.
                </p>
              )}
              {dependencies.map((dep) => {
                const subject = dep.subjectId ? getSubjectById(dep.subjectId) : undefined
                const statusLabel = dep.isFinished
                  ? "Finished"
                  : dep.isArchived
                    ? "Archived"
                    : null
                return (
                  <div
                    key={dep.id}
                    className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-base shrink-0">{dep.icon ?? "📁"}</span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenProject(dep.id)}
                        className="flex w-full items-center gap-1.5 text-sm font-medium text-left hover:text-primary transition-colors"
                      >
                        <span className="truncate">{dep.name}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </button>
                      {(subject ?? statusLabel) && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {subject && (
                            <span
                              className="rounded-md px-1.5 py-0.5 text-micro font-medium"
                              style={{ backgroundColor: subject.color + "14", color: subject.color }}
                            >
                              {subject.icon} {subject.shortCode}
                            </span>
                          )}
                          {statusLabel && (
                            <span
                              className={
                                "rounded-md px-1.5 py-0.5 text-micro font-medium " +
                                (dep.isFinished
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                  : "bg-muted-foreground/10 text-muted-foreground/70")
                              }
                            >
                              {statusLabel}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveDependency(dep.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-all hover:text-destructive hover:bg-destructive/10 group-hover:opacity-100"
                      aria-label={`Remove dependency ${dep.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}

              {project.dependsOn && project.dependsOn.length !== dependencies.length && (
                <p className="text-micro text-muted-foreground/50">
                  {project.dependsOn.length - dependencies.length} linked
                  assessment{project.dependsOn.length - dependencies.length === 1 ? "" : "s"} not found
                  (deleted) — remove to clear.
                </p>
              )}

              <Popover open={pickerOpen} onOpenChange={handlePickerChange}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={addableProjects.length === 0}
                    className="h-7 gap-1 rounded-lg text-xs mt-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add dependency
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                  {addableProjects.length === 0 ? (
                    <p className="py-3 px-2 text-sm text-muted-foreground/60 text-center">
                      No other assessments to link.
                    </p>
                  ) : (
                    <>
                      <Input
                        placeholder="Search assessments…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="h-8 text-sm mb-2"
                        autoFocus
                      />
                      <div className="max-h-64 overflow-y-auto -mx-1">
                        {filteredAddable.length === 0 ? (
                          <p className="py-3 px-2 text-sm text-muted-foreground/60 text-center">
                            No matches
                          </p>
                        ) : (
                          filteredAddable.map((p) => {
                            const subject = p.subjectId ? getSubjectById(p.subjectId) : undefined
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => handleSelect(p.id)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60 transition-colors"
                              >
                                <span className="text-base shrink-0">{p.icon ?? "📁"}</span>
                                <span className="truncate flex-1">{p.name}</span>
                                {subject && (
                                  <span
                                    className="rounded-md px-1.5 py-0.5 text-micro font-medium shrink-0"
                                    style={{ backgroundColor: subject.color + "14", color: subject.color }}
                                  >
                                    {subject.shortCode}
                                  </span>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}
