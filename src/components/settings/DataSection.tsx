import { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { FolderInput, Database, Palette, Loader2, FileBox, ArrowUpRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface DataSectionProps {
  onOpenExport?: () => void
  onOpenSubjects?: () => void
}

interface Action {
  id: "import" | "export" | "subjects"
  title: string
  description: string
  icon: LucideIcon
  onSelect: () => void
  external?: boolean
}

export function DataSection({ onOpenExport, onOpenSubjects }: DataSectionProps) {
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ name: string; error?: string } | null>(null)

  const handleImportFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    setImporting(true)
    setImportResult(null)
    try {
      const name = await invoke<string>("import_folder_to_projects", { folderPath: selected })
      setImportResult({ name })
    } catch (e) {
      setImportResult({ name: selected.split("/").pop() ?? "Folder", error: String(e) })
    } finally {
      setImporting(false)
    }
  }, [])

  const actions: Action[] = [
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
  if (onOpenSubjects) {
    actions.push({
      id: "subjects",
      title: "Manage subjects",
      description: "Create, recolor, and remove your custom subjects.",
      icon: Palette,
      onSelect: onOpenSubjects,
    })
  }

  return (
    <section className="rounded-xl border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
      <div>
        <h2 className="text-sm font-medium">Data</h2>
        <p className="mt-1 text-caption text-muted-foreground/70 text-wrap-balance">
          Move your files in and out of Focal, or customise the subjects that show up in pickers.
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {actions.map((action) => {
          const Icon = action.icon
          const isImporting = action.id === "import" && importing
          const isImportResult = action.id === "import" && importResult
          return (
            <button
              key={action.id}
              type="button"
              onClick={action.onSelect}
              disabled={isImporting}
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
                  isImporting
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary",
                )}
              >
                {isImporting ? (
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
                </div>
                <p className="mt-0.5 text-caption text-muted-foreground/75 text-wrap-balance">
                  {action.description}
                </p>
                {isImportResult && (
                  <p
                    className={cn(
                      "mt-1.5 text-caption",
                      importResult.error
                        ? "text-destructive"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {importResult.error
                      ? `Import failed: ${importResult.error}`
                      : `Imported "${importResult.name}" successfully`}
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
