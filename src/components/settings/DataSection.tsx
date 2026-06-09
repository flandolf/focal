import { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { FolderInput, Database, Palette, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { SETTINGS_SECTION_CLASS } from "./constants"

interface DataSectionProps {
  onOpenExport?: () => void
  onOpenSubjects?: () => void
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

  return (
    <section className={SETTINGS_SECTION_CLASS}>
      <h2 className="text-sm font-medium">Import Folder</h2>
      <p className="mt-1 text-caption text-muted-foreground/70">
        Copy an existing folder from your filesystem into the projects directory.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleImportFolder}
        disabled={importing}
        className="mt-2 gap-1.5"
      >
        {importing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FolderInput className="h-4 w-4" />
        )}
        {importing ? "Importing..." : "Choose Folder"}
      </Button>
      {importResult && (
        <p className={cn(
          "mt-2 text-caption",
          importResult.error ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
        )}>
          {importResult.error
            ? `Import failed: ${importResult.error}`
            : `Imported "${importResult.name}" successfully`}
        </p>
      )}

      {(onOpenExport != null || onOpenSubjects != null) && (
        <div className="mt-5 border-t border-border/70 pt-5">
          <h2 className="text-sm font-medium">Data Management</h2>
          <p className="mt-1 text-caption text-muted-foreground/70">
            Manage your project data and custom subjects.
          </p>
          <div className="mt-3 flex gap-2">
            {onOpenExport && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenExport}
                className="gap-1.5"
              >
                <Database className="h-4 w-4" />
                Export
              </Button>
            )}
            {onOpenSubjects && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSubjects}
                className="gap-1.5"
              >
                <Palette className="h-4 w-4" />
                Subjects
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
