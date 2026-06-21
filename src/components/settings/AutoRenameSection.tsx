import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  Wand2,
  Loader2,
  Check,
  X,
  AlertCircle,
  Brain,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react"
import { motion, useReducedMotion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import { FileTypeIcon } from "@/components/FileTypeIcon"
import type { Project, FileInfo } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  getAutoRenameUseFileContent,
  setAutoRenameUseFileContent,
} from "@/lib/settings"
import {
  getActiveProvider,
  getEffectiveModel,
} from "@/lib/providers"
import {
  generateRenames,
  getFileContentPreviews,
  loadProjectFiles,
  normalizeRename,
} from "@/lib/autoRename"
import { describeAiError } from "@/lib/aiAssistant"
import {
  SETTINGS_SECTION_CLASS,
  SETTINGS_CHECKBOX_CLASS,
} from "./constants"
import {
  TRANSITION,
  REDUCED_TRANSITION,
  staggerContainer,
  staggerItem,
} from "@/lib/motion"

interface RenameEntry {
  project: Project
  file: FileInfo
  newName: string
  approved: boolean
  error?: string
}

interface AutoRenameSectionProps {
  projects: Project[]
  onFilesChanged?: () => void
}

function prettyModelName(modelId: string): string {
  if (!modelId) return "No model selected"
  const slashIndex = modelId.lastIndexOf("/")
  if (slashIndex === -1) return modelId
  return modelId.slice(slashIndex + 1)
}

export function AutoRenameSection({ projects, onFilesChanged }: AutoRenameSectionProps) {
  const [useFileContent, setUseFileContentState] = useState(() => getAutoRenameUseFileContent())
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [entries, setEntries] = useState<RenameEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showUnchanged, setShowUnchanged] = useState(false)
  const [model, setModelState] = useState(() => getEffectiveModel())
  const generateAbortRef = useRef<AbortController | null>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const handler = () => setModelState(getEffectiveModel())
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  useEffect(() => () => generateAbortRef.current?.abort(), [])

  const providerMissing = !getActiveProvider().isConfigured()
  const hasProjects = projects.length > 0

  const handleUseFileContentChange = useCallback((checked: boolean) => {
    setUseFileContentState(checked)
    setAutoRenameUseFileContent(checked)
  }, [])

  const handleGenerate = useCallback(async () => {
    const provider = getActiveProvider()
    if (!provider.isConfigured()) {
      setError(`${provider.displayName} is not configured. Set it in the AI Model section first.`)
      return
    }
    if (!hasProjects) {
      setError("No projects available. Create an assessment first.")
      return
    }
    setLoading(true)
    setError(null)
    setEntries([])
    generateAbortRef.current = new AbortController()
    try {
      const projectsWithFiles = await Promise.all(
        projects.map(async (project) => {
          try {
            const files = await loadProjectFiles(project.folder_path)
            return { project, files }
          } catch (e) {
            console.error(`Failed to load files for project ${project.name}:`, e)
            return { project, files: [] }
          }
        })
      )

      const allFiles: { project: Project; file: FileInfo }[] = []
      for (const { project, files } of projectsWithFiles) {
        for (const file of files) {
          allFiles.push({ project, file })
        }
      }

      if (allFiles.length === 0) {
        setError("No files found across your projects.")
        return
      }

      const fileContentPreviews = useFileContent
        ? await getFileContentPreviews(allFiles.map((f) => f.file))
        : new Map<string, string>()

      const results = await generateRenames(
        allFiles.map((f) => f.file),
        getEffectiveModel(),
        fileContentPreviews,
        generateAbortRef.current.signal,
      )

      const newEntries: RenameEntry[] = results.map((result, index) => {
        const match = allFiles[index]
        return {
          project: match.project,
          file: match.file,
          newName: result.renamed,
          approved: result.renamed !== match.file.name,
        }
      })

      setEntries(newEntries)
    } catch (e) {
      const { message, cancelled } = describeAiError(e)
      if (!cancelled) setError(message)
    } finally {
      generateAbortRef.current = null
      setLoading(false)
    }
  }, [projects, useFileContent, hasProjects])

  const cancelGenerate = useCallback(() => {
    generateAbortRef.current?.abort()
  }, [])

  const handleApply = useCallback(async () => {
    const toApply = entries.flatMap((entry) => {
      if (!entry.approved) return []
      const newName = normalizeRename(entry.file.name, entry.newName)
      return newName === entry.file.name ? [] : [{ filePath: entry.file.path, newName }]
    })

    if (toApply.length === 0) return

    setApplying(true)
    setError(null)

    const failed: RenameEntry[] = []
    let successCount = 0

    for (const { filePath, newName } of toApply) {
      try {
        await invoke<string>("rename_file", { filePath, newName })
        successCount++
      } catch (e) {
        const entry = entries.find((e) => e.file.path === filePath)
        if (entry) {
          failed.push({ ...entry, error: e instanceof Error ? e.message : String(e) })
        }
      }
    }

    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.approved && entry.newName !== entry.file.name) {
          const failedEntry = failed.find((f) => f.file.path === entry.file.path)
          if (failedEntry) {
            return { ...entry, error: failedEntry.error }
          }
          return { ...entry, file: { ...entry.file, name: entry.newName, path: entry.file.path } }
        }
        return entry
      })
    )

    setApplying(false)

    if (successCount > 0) {
      toast.success(
        `Renamed ${successCount} file${successCount !== 1 ? "s" : ""}`
      )
      onFilesChanged?.()
    }
    if (failed.length > 0) {
      toast.error(
        `Failed to rename ${failed.length} file${failed.length !== 1 ? "s" : ""}`
      )
    }
  }, [entries, onFilesChanged])

  const handleReset = useCallback(() => {
    setEntries([])
    setError(null)
  }, [])

  const changedCount = useMemo(
    () => entries.filter((e) => e.newName !== e.file.name).length,
    [entries]
  )
  const approvedCount = useMemo(
    () => entries.filter((e) => e.approved && e.newName !== e.file.name).length,
    [entries]
  )

  const visibleEntries = useMemo(() => {
    if (showUnchanged) return entries
    return entries.filter((e) => e.newName !== e.file.name)
  }, [entries, showUnchanged])

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, { project: Project; entries: RenameEntry[] }>()
    for (const entry of visibleEntries) {
      const existing = groups.get(entry.project.id)
      if (existing) {
        existing.entries.push(entry)
      } else {
        groups.set(entry.project.id, { project: entry.project, entries: [entry] })
      }
    }
    return Array.from(groups.values())
  }, [visibleEntries])

  const toggleApproved = useCallback((filePath: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.file.path === filePath
          ? { ...e, approved: !e.approved, error: undefined }
          : e
      )
    )
  }, [])

  const resetEntry = useCallback((filePath: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.file.path === filePath
          ? { ...e, newName: e.file.name, approved: false, error: undefined }
          : e
      )
    )
  }, [])

  const updateEntryName = useCallback((filePath: string, newName: string) => {
    setEntries((prev) => prev.map((entry) => (
      entry.file.path === filePath
        ? { ...entry, newName, approved: newName.trim() !== entry.file.name, error: undefined }
        : entry
    )))
  }, [])

  const normalizeEntryName = useCallback((filePath: string) => {
    setEntries((prev) => prev.map((entry) => {
      if (entry.file.path !== filePath) return entry
      const newName = normalizeRename(entry.file.name, entry.newName)
      return { ...entry, newName, approved: newName !== entry.file.name, error: undefined }
    }))
  }, [])

  const approveAll = useCallback(() => {
    setEntries((prev) => prev.map((e) => ({ ...e, approved: e.newName !== e.file.name, error: undefined })))
  }, [])

  const rejectAll = useCallback(() => {
    setEntries((prev) =>
      prev.map((e) => ({
        ...e,
        approved: false,
        error: undefined,
      }))
    )
  }, [])

  const hasResults = entries.length > 0
  const motionProps = reduceMotion ? { initial: false, animate: { opacity: 1, y: 0 } } : undefined

  return (
    <div className="grid min-h-0 w-full min-w-0 grid-cols-1 gap-2 overflow-hidden">
      {/* ===== Compact Configuration Section ===== */}
      <section aria-busy={loading} className={cn(SETTINGS_SECTION_CLASS, "w-full min-w-0 overflow-hidden p-3")}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Wand2 className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-medium leading-tight">Auto Rename</h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                  Generate cleaner filenames across all projects.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={loading ? cancelGenerate : handleGenerate}
            disabled={!loading && (providerMissing || !hasProjects)}
            variant={loading ? "outline" : "default"}
            size="sm"
            className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
          >
            {loading ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {loading ? "Cancel scan" : "Preview"}
          </Button>
        </div>

        {/* Compact status row */}
        <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 text-caption max-[420px]:grid-cols-1">
          <div className="min-w-0 rounded-md border border-border/50 bg-background/25 px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground/70">
              <Brain className="h-3 w-3 shrink-0" />
              <span>Model</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-foreground" title={model}>
              {prettyModelName(model)}
            </p>
          </div>
          <div className="min-w-0 rounded-md border border-border/50 bg-background/25 px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground/70">
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  providerMissing ? "bg-amber-500" : "bg-emerald-500"
                )}
                aria-hidden="true"
              />
              <span>{getActiveProvider().displayName}</span>
            </div>
            <p
              className={cn(
                "mt-0.5 truncate text-xs font-medium",
                providerMissing
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {providerMissing ? "Not configured" : "Ready"}
            </p>
          </div>
        </div>

        {/* Compact toggle */}
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-border/50 bg-background/20 px-2.5 py-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 hover:border-muted-foreground/30">
          <input
            type="checkbox"
            checked={useFileContent}
            onChange={(e) => handleUseFileContentChange(e.target.checked)}
            className={cn(SETTINGS_CHECKBOX_CLASS, "shrink-0")}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight">Use file content previews</p>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground/65">
              Reads up to 1,000 characters per supported file and sends them to your selected AI provider.
            </p>
          </div>
        </label>

        {!hasProjects && !loading && (
          <p className="mt-2 text-xs text-muted-foreground/60">
            Create an assessment first to enable renaming.
          </p>
        )}

        {/* Banners */}
        <AnimatePresence initial={false}>
          {providerMissing && (
            <motion.div
              key="provider-missing"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={reduceMotion ? REDUCED_TRANSITION : TRANSITION.exit}
              role="status"
              className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-caption text-amber-700 dark:text-amber-300"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{`Configure ${getActiveProvider().displayName} in the AI Model section.`}</span>
            </motion.div>
          )}

          {error && (
            <motion.div
              key="error"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={reduceMotion ? REDUCED_TRANSITION : TRANSITION.exit}
              role="alert"
              className="mt-2 flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-caption text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ===== Compact Results Section ===== */}
      <AnimatePresence initial={false}>
        {hasResults && (
          <motion.section
            key="results"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
            transition={reduceMotion ? REDUCED_TRANSITION : TRANSITION.view}
            className={cn(SETTINGS_SECTION_CLASS, "flex min-h-0 w-full min-w-0 flex-col overflow-hidden p-0")}
          >
            {/* Sticky compact header */}
            <div className="border-b border-border/50 px-3 py-2">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-[420px]:grid-cols-1">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium leading-tight">Review changes</h2>
                  <p className="mt-0.5 truncate text-caption text-muted-foreground/70">
                    {entries.length} file{entries.length !== 1 ? "s" : ""} · {changedCount} suggested · {approvedCount} approved
                  </p>
                </div>

                <div
                  role="tablist"
                  aria-label="Filter files"
                  className="inline-flex w-fit shrink-0 rounded-md border border-border/60 bg-background/35 p-0.5"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!showUnchanged}
                    onClick={() => setShowUnchanged(false)}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded px-1.5 text-micro transition-colors",
                      !showUnchanged
                        ? "bg-foreground/8 font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Eye className="h-3 w-3" />
                    Changed
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={showUnchanged}
                    onClick={() => setShowUnchanged(true)}
                    className={cn(
                      "inline-flex h-6 items-center gap-1 rounded px-1.5 text-micro transition-colors",
                      showUnchanged
                        ? "bg-foreground/8 font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <EyeOff className="h-3 w-3" />
                    All
                  </button>
                </div>
              </div>

              {changedCount > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/8">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                      initial={false}
                      animate={{
                        width: `${
                          changedCount === 0
                            ? 0
                            : Math.round((approvedCount / changedCount) * 100)
                        }%`,
                      }}
                      transition={TRANSITION.state}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 text-caption">
                    <button
                      type="button"
                      onClick={approveAll}
                      className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                      Approve all
                    </button>
                    <span className="text-muted-foreground/25" aria-hidden="true">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={rejectAll}
                      className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                      Reject all
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* File list */}
            {groupedEntries.length === 0 ? (
              <div className="m-3 rounded-lg border border-border/60 bg-background/20 px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No changes suggested. All filenames look clean.
                </p>
              </div>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <motion.div
                  {...(motionProps ?? {})}
                  variants={staggerContainer(0.02, 0.02)}
                  initial="initial"
                  animate="animate"
                  className="divide-y divide-border/40"
                >
                  {groupedEntries.map(({ project, entries: projectEntries }) => (
                    <div key={project.id}>
                      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/30 bg-background/95 px-3 py-1 backdrop-blur supports-[backdrop-filter]:bg-background/75">
                        <p className="truncate text-micro font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {project.name}
                        </p>
                        <span className="shrink-0 text-micro tabular-nums text-muted-foreground/50">
                          {projectEntries.length}
                        </span>
                      </div>
                      <div className="divide-y divide-border/20">
                        {projectEntries.map((entry) => {
                          const isChanged = entry.newName !== entry.file.name
                          return (
                            <motion.div
                              key={entry.file.path}
                              variants={staggerItem}
                              className={cn(
                                "group/row grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 transition-colors hover:bg-foreground/[0.025]",
                                !isChanged && "opacity-45"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => isChanged && toggleApproved(entry.file.path)}
                                disabled={!isChanged}
                                aria-label={
                                  entry.approved ? "Disapprove rename" : "Approve rename"
                                }
                                aria-pressed={entry.approved}
                                className={cn(
                                  "flex size-4 shrink-0 items-center justify-center rounded border-2 transition-colors",
                                  !isChanged
                                    ? "cursor-default border-muted-foreground/20"
                                    : entry.approved
                                      ? "border-emerald-500 bg-emerald-500 text-white"
                                      : "border-muted-foreground/30 hover:border-muted-foreground"
                                )}
                              >
                                {entry.approved && isChanged && (
                                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                                )}
                              </button>

                              <FileTypeIcon
                                extension={entry.file.extension}
                                className="size-6 shrink-0 rounded-md"
                                iconClassName="size-3"
                              />

                              <div className="min-w-0 flex-1">
                                {isChanged ? (
                                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1.15fr)] items-center gap-1.5 max-[520px]:block">
                                    <p className="truncate text-caption leading-tight text-muted-foreground/45 line-through decoration-muted-foreground/30">
                                      {entry.file.name}
                                    </p>
                                    <span className="text-micro text-muted-foreground/35 max-[520px]:hidden">→</span>
                                    <input
                                      value={entry.newName}
                                      onChange={(event) => updateEntryName(entry.file.path, event.target.value)}
                                      onBlur={() => normalizeEntryName(entry.file.path)}
                                      onFocus={(event) => event.currentTarget.select()}
                                      aria-label={`New filename for ${entry.file.name}`}
                                      spellCheck={false}
                                      className="h-6 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-caption font-medium leading-tight text-foreground outline-none transition-colors hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/30"
                                    />
                                  </div>
                                ) : (
                                  <p className="truncate text-caption leading-tight text-muted-foreground">
                                    {entry.file.name}
                                  </p>
                                )}
                                {(entry.file.subfolder ?? entry.error) && (
                                  <p
                                    className={cn(
                                      "mt-0.5 truncate text-micro leading-tight",
                                      entry.error
                                        ? "text-destructive"
                                        : "text-muted-foreground/40"
                                    )}
                                  >
                                    {entry.error ?? `in ${entry.file.subfolder}`}
                                  </p>
                                )}
                              </div>

                              {isChanged && (
                                <button
                                  type="button"
                                  onClick={() => resetEntry(entry.file.path)}
                                  aria-label="Reset rename"
                                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </motion.div>
              </ScrollArea>
            )}

            {/* Sticky compact footer */}
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-border/50 bg-background/80 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/65 max-[420px]:grid-cols-1">
              <p className="min-w-0 truncate text-caption text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">{approvedCount}</span> of {changedCount} rename{changedCount !== 1 ? "s" : ""} approved
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReset}
                  disabled={applying}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={applying || approvedCount === 0}
                  className="h-7 gap-1.5 px-2.5 text-xs"
                  size="sm"
                >
                  {applying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {applying
                    ? "Applying"
                    : `Apply ${approvedCount}`}
                </Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  )
}
