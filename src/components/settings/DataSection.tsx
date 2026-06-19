import { useState, useCallback, useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { listen } from "@tauri-apps/api/event"
import { FolderInput, Database, Loader2, FileBox, ArrowUpRight, FolderOpen, RotateCcw, ScanSearch, Link, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getProjectsRootPath, setProjectsRootPath } from "@/lib/settings"
import { toast } from "sonner"

interface DataSectionProps {
  onOpenExport?: () => void
  onProjectsRootChanged?: () => void
  onScanAndImportProjects?: () => Promise<{ created: string[]; skipped: string[]; failed: string[] }>
  onLinkFolderAsProject?: (folderPath: string) => Promise<unknown>
}

interface Action {
  id: "import" | "export" | "scan" | "link"
  title: string
  description: string
  icon: LucideIcon
  onSelect: () => void
  external?: boolean
}

export function DataSection({ onOpenExport, onProjectsRootChanged, onScanAndImportProjects, onLinkFolderAsProject }: DataSectionProps) {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ name: string; error?: string } | null>(null)
  const [importProgress, setImportProgress] = useState<{ completed: number; total: number } | null>(null)
  const importTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkResult, setLinkResult] = useState<{ name: string; error?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ created: string[]; skipped: string[]; failed: string[] } | null>(null)
  const [projectsRoot, setProjectsRoot] = useState(() => getProjectsRootPath())
  const [defaultDir, setDefaultDir] = useState<string | null>(null)
  useEffect(() => {
    invoke<string>("get_default_documents_dir")
      .then((dir) => setDefaultDir(dir))
      .catch(() => setDefaultDir(null))
  }, [])

  const handleImportFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    setImporting(true)
    setImportResult(null)
    setImportProgress(null)
    try {
      const name = await invoke<string>("import_folder_to_project", { sourcePath: selected })
      setImportResult({ name })
    } catch (e) {
      setImportResult({ name: selected.split("/").pop() ?? "Folder", error: String(e) })
    } finally {
      setImporting(false)
      importTimeoutRef.current = setTimeout(() => setImportProgress(null), 600)
    }
  }, [])

  const handleLinkFolder = useCallback(async () => {
    if (!onLinkFolderAsProject) return
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    setLinking(true)
    setLinkResult(null)
    try {
      const project = await onLinkFolderAsProject(selected)
      const name = project && typeof project === "object" && "name" in project
        ? String(project.name)
        : selected.split("/").pop() ?? "Folder"
      setLinkResult({ name })
      toast.success(`Linked "${name}" as an assessment`)
    } catch (e) {
      setLinkResult({ name: selected.split("/").pop() ?? "Folder", error: String(e) })
      toast.error(`Failed to link folder: ${String(e)}`)
    } finally {
      setLinking(false)
    }
  }, [onLinkFolderAsProject])

  const handlePickProjectsRoot = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    try {
      await invoke("set_projects_directory", { path: selected })
      setProjectsRootPath(selected)
      setProjectsRoot(selected)
      onProjectsRootChanged?.()
      toast.success("Projects folder set")
      toast.info("Existing projects may need to be recreated if the folder structure doesn't match the new root.")
    } catch (e) {
      toast.error(`Failed to set projects folder: ${String(e)}`)
    }
  }, [onProjectsRootChanged])

  const handleResetProjectsRoot = useCallback(async () => {
    try {
      const dir = await invoke<string>("get_default_documents_dir")
      setProjectsRootPath(null)
      setProjectsRoot(null)
      await invoke("set_projects_directory", { path: dir })
      onProjectsRootChanged?.()
      toast.success("Projects folder reset to default")
    } catch (e) {
      toast.error(`Failed to reset projects folder: ${String(e)}`)
    }
  }, [onProjectsRootChanged])

  const handleScanAndImport = useCallback(async () => {
    if (!onScanAndImportProjects) return
    setScanning(true)
    setScanResult(null)
    try {
      const result = await onScanAndImportProjects()
      setScanResult(result)
      if (result.created.length > 0) {
        toast.success(`${result.created.length} project${result.created.length === 1 ? "" : "s"} imported from subfolders`)
      }
      if (result.skipped.length > 0) {
        toast.info(`${result.skipped.length} subfolder${result.skipped.length === 1 ? "" : "s"} already had projects`)
      }
      if (result.created.length === 0 && result.skipped.length === 0) {
        toast.info("No subfolders found to import")
      }
    } catch (e) {
      toast.error(`Failed to scan subfolders: ${String(e)}`)
    } finally {
      setScanning(false)
    }
  }, [onScanAndImportProjects])

  useEffect(() => {
    let cancelled = false
    const unlisten = listen<{ completed: number; total: number }>("import-progress", (event) => {
      if (!cancelled) {
        setImportProgress(event.payload)
      }
    })
    return () => {
      cancelled = true
      if (importTimeoutRef.current) {
        clearTimeout(importTimeoutRef.current)
        importTimeoutRef.current = null
      }
      unlisten.then((fn) => fn()).catch(() => {/* ignore unlisten errors */})
    }
  }, [])

  const actions: Action[] = [
    {
      id: "scan",
      title: scanning ? "Scanning…" : "Scan subfolders as projects",
      description: "Find all subfolders in the current projects directory and create a project for each one.",
      icon: ScanSearch,
      onSelect: () => { void handleScanAndImport() },
    },
    {
      id: "link",
      title: linking ? "Linking…" : "Link folder as assessment",
      description: "Link an existing OneDrive folder in-place as an assessment without copying.",
      icon: Link,
      onSelect: () => { void handleLinkFolder() },
    },
    {
      id: "import",
      title: importing ? "Importing…" : "Import folder",
      description: "Copy an existing folder from your filesystem into the projects directory.",
      icon: FolderInput,
      onSelect: () => { void handleImportFolder() },
    },
  ]
  if (onOpenExport) {
    actions.push({
      id: "export",
      title: "Export data",
      description: "Bundle your projects, events, and sessions as a single archive.",
      icon: Database,
      onSelect: onOpenExport,
    })
  }

  return (
    <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
      <div>
        <h2 className="text-sm font-medium">Data</h2>
        <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
          Move your files in and out of Focal.
        </p>
      </div>

      {/* Projects root folder setting */}
      <div className="mt-4 rounded-lg border border-border/60 bg-background/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight">Projects folder</p>
            <p className="mt-0.5 text-caption text-muted-foreground/75 text-wrap-balance">
              {projectsRoot
                ? `Using custom folder: ${projectsRoot}`
                : `Using default: ${defaultDir ?? "Documents/Projects"}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {projectsRoot && (
              <button
                type="button"
                onClick={() => { void handleResetProjectsRoot() }}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/60 bg-background/45 px-2.5 text-caption text-muted-foreground transition-colors hover:bg-background/60"
                title="Reset to default"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="max-[500px]:hidden">Reset</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => { void handlePickProjectsRoot() }}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/60 bg-primary/10 px-2.5 text-caption font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="max-[500px]:hidden">Choose</span>
            </button>
          </div>
        </div>
        <p className="mt-2 text-caption text-muted-foreground/60">
          Select a OneDrive or any synced folder so your projects stay in sync across devices.
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {actions.map((action) => {
          const Icon = action.icon
        const isLoading = (action.id === "import" && importing) || (action.id === "scan" && scanning) || (action.id === "link" && linking)
        const isImportResult = action.id === "import" && importResult
        const isLinkResult = action.id === "link" && linkResult
        const isScanResult = action.id === "scan" && scanResult
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onSelect}
              disabled={isLoading}
              className={cn(
                "group/action relative flex w-full items-start gap-3 rounded-lg border border-border/60 bg-background/30 p-3 text-left transition-colors outline-none",
                "hover:border-muted-foreground/35 hover:bg-background/45",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
                  isLoading
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary",
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium leading-tight">{action.title}</p>
                  {action.id === "import" && (
                    <FileBox className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
                  )}
                  {action.id === "link" && (
                    <Link className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
                  )}
                </div>
                <p className="mt-0.5 text-caption text-muted-foreground/75 text-wrap-balance">
                  {action.description}
                </p>
                {importProgress && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${importProgress.total === 0 ? 0 : Math.max(0, Math.min(100, (importProgress.completed / importProgress.total) * 100))}%`,
                        }}
                      />
                    </div>
                    <p className="mt-1 text-caption text-muted-foreground/70">
                      {importProgress.completed} of {importProgress.total} files copied
                    </p>
                  </div>
                )}
                {isImportResult && (
                  <p
                    className={cn(
                      "mt-1.5 text-caption",
                      importResult.error
                        ? "text-destructive"
                        : "text-success",
                    )}
                  >
                    {importResult.error
                      ? `Import failed: ${importResult.error}`
                      : `Imported "${importResult.name}" successfully`}
                  </p>
                )}
                {isLinkResult && (
                  <p
                    className={cn(
                      "mt-1.5 text-caption",
                      linkResult.error
                        ? "text-destructive"
                        : "text-success",
                    )}
                  >
                    {linkResult.error
                      ? `Link failed: ${linkResult.error}`
                      : `Linked "${linkResult.name}" as assessment`}
                  </p>
                )}
                {isScanResult && (
                  <p className="mt-1.5 text-caption text-muted-foreground/80">
                    {scanResult.created.length > 0
                      ? `Created ${scanResult.created.length} project${scanResult.created.length === 1 ? "" : "s"}. `
                      : ""}
                    {scanResult.skipped.length > 0
                      ? `Skipped ${scanResult.skipped.length} existing. `
                      : ""}
                    {scanResult.failed.length > 0
                      ? `Failed ${scanResult.failed.length}.`
                      : ""}
                  </p>
                )}
              </div>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover/action:opacity-100"
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
