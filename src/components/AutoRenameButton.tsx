import { useState, useCallback } from "react"
import { Wand2, Loader2, X, Check, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileTypeIcon } from "@/components/FileTypeIcon"
import type { FileInfo } from "@/lib/types"
import { cn } from "@/lib/utils"
import { getApiKey, getAutoRenameUseFileContent, setAutoRenameUseFileContent, getModel } from "@/lib/settings"
import { generateRenames, getFileContentPreviews } from "@/lib/autoRename"

interface RenameEntry {
  file: FileInfo
  newName: string
  approved: boolean
  error?: string
}

interface AutoRenameButtonProps {
  files: FileInfo[]
  onApplyRenames: (renames: { filePath: string; newName: string }[]) => Promise<void>
}

export function AutoRenameButton({ files, onApplyRenames }: AutoRenameButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [entries, setEntries] = useState<RenameEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [useFileContent, setUseFileContent] = useState(() => getAutoRenameUseFileContent())
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const apiKeyMissing = !getApiKey()

  const handleOpen = useCallback(() => {
    setSelectedPaths(new Set(files.map((f) => f.path)))
    setEntries([])
    setUseFileContent(getAutoRenameUseFileContent())
    setError(null)
    setOpen(true)
  }, [files])

  const toggleSelected = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedPaths(new Set(files.map((f) => f.path)))
  }, [files])

  const deselectAll = useCallback(() => {
    setSelectedPaths(new Set())
  }, [])

  const handleGenerate = useCallback(async () => {
    const key = getApiKey()
    if (!key) {
      setError("OpenRouter API key not configured. Set it in Settings.")
      return
    }
    const selectedFiles = files.filter((f) => selectedPaths.has(f.path))
    if (selectedFiles.length === 0) {
      setError("No files selected. Select at least one file to rename.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const fileContentPreviews = useFileContent ? await getFileContentPreviews(selectedFiles) : new Map<string, string>()
      const results = await generateRenames(selectedFiles, key, getModel(), fileContentPreviews)
      const newEntries: RenameEntry[] = results.map((r) => {
        const file = selectedFiles.find((f) => f.name === r.original)!
        return { file, newName: r.renamed, approved: r.renamed !== r.original }
      })
      setEntries(newEntries)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [files, selectedPaths, useFileContent])

  const toggleApproved = useCallback((index: number) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, approved: !e.approved, error: undefined } : e)),
    )
  }, [])

  const handleApply = useCallback(async () => {
    const toApply = entries
      .filter((e) => e.approved && e.newName !== e.file.name)
      .map((e) => ({ filePath: e.file.path, newName: e.newName }))
    if (toApply.length === 0) return

    setApplying(true)
    setError(null)
    const failedPaths = new Set<string>()

    try {
      await onApplyRenames(toApply)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setApplying(false)
      return
    }

    setEntries((prev) =>
      prev.map((e) => {
        if (!e.approved || e.newName === e.file.name) return e
        return { ...e, error: failedPaths.has(e.file.path) ? "Rename failed" : undefined }
      })
    )

    const anyFailed = failedPaths.size > 0
    setApplying(false)
    if (!anyFailed) {
      setOpen(false)
    }
  }, [entries, onApplyRenames])

  const changedCount = entries.filter((e) => e.newName !== e.file.name).length
  const approvedCount = entries.filter((e) => e.approved && e.newName !== e.file.name).length
  const selectedCount = selectedPaths.size

  if (files.length === 0) return null

  return (
    <>
      <Button
        onClick={handleOpen}
        size="sm"
        className="fixed bottom-6 right-6 z-40 shadow-lg gap-1.5 rounded-full px-4 h-10 bg-primary hover:bg-primary/90 text-primary-foreground"
      >
        <Wand2 className="h-4 w-4" />
        <span className="text-sm font-medium">Auto Rename</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(86dvh,44rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-3xl">
          <div className="border-b px-5 pb-4 pt-5">
            <DialogHeader>
              <DialogTitle>Auto Rename Files</DialogTitle>
              <DialogDescription>
                Use AI to clean up and standardize file names for this assessment.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
            {apiKeyMissing && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                OpenRouter API key not configured. Go to{" "}
                <span className="font-medium">Settings</span> in the sidebar to set it up.
              </p>
            )}

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex shrink-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium">Use file content context</p>
                <p className="text-caption text-muted-foreground/70">
                  Reads a short text preview to suggest more accurate names.
                </p>
              </div>
              <input
                type="checkbox"
                checked={useFileContent}
                onChange={(e) => {
                  const enabled = e.target.checked
                  setUseFileContent(enabled)
                  setAutoRenameUseFileContent(enabled)
                }}
                className="h-4 w-4 shrink-0"
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                onClick={handleGenerate}
                disabled={loading || apiKeyMissing || selectedCount === 0}
                className="gap-1.5 text-background"
                size="sm"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {loading ? "Generating..." : "Generate Renames"}
              </Button>
              {entries.length === 0 && selectedCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedCount} of {files.length} file{files.length !== 1 ? "s" : ""} selected
                </span>
              )}
              {entries.length > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {changedCount} change{changedCount !== 1 ? "s" : ""} suggested
                    {approvedCount !== changedCount ? ` · ${approvedCount} approved` : ""}
                  </span>
                  <div className="flex-1" />
                  {changedCount > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setEntries((prev) => prev.map((e) => ({ ...e, approved: true, error: undefined })))
                        }
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Approve all
                      </button>
                      <button
                        onClick={() =>
                          setEntries((prev) =>
                            prev.map((e) => ({
                              ...e,
                              approved: e.newName === e.file.name,
                              error: undefined,
                            })),
                          )
                        }
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Reject all
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* File selection list (before generation) */}
            {entries.length === 0 && (
              <>
                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={selectAll}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Select all
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Deselect all
                  </button>
                </div>
                <ScrollArea className="min-h-0 flex-1 rounded-lg border">
                  <div className="grid grid-cols-1 gap-px bg-border/30 md:grid-cols-2">
                    {files.map((file) => {
                      const isSelected = selectedPaths.has(file.path)
                      return (
                        <div
                          key={file.path}
                          className={cn(
                            "flex min-w-0 items-center gap-2.5 bg-background px-3 py-2 cursor-pointer transition-colors hover:bg-accent/30",
                            !isSelected && "opacity-40"
                          )}
                          onClick={() => toggleSelected(file.path)}
                        >
                          <FileTypeIcon
                            extension={file.extension}
                            className="size-7 shrink-0 rounded-md"
                            iconClassName="size-3.5"
                          />
                          <div
                            className={cn(
                              "shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                              isSelected
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/30"
                            )}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate leading-tight">
                              {file.name}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </>
            )}

            {/* Rename review list (after generation) */}
            {entries.length > 0 && (
              <ScrollArea className="min-h-0 flex-1 rounded-lg border">
                <div className="grid grid-cols-1 gap-px bg-border/30 md:grid-cols-2">
                  {entries.map((entry, i) => {
                    const isChanged = entry.newName !== entry.file.name
                    return (
                      <div
                        key={entry.file.path}
                        className={cn(
                          "flex min-w-0 items-center gap-2.5 bg-background px-3 py-2",
                          !isChanged && "opacity-40"
                        )}
                      >
                        <FileTypeIcon
                          extension={entry.file.extension}
                          className="size-7 shrink-0 rounded-md"
                          iconClassName="size-3.5"
                        />
                        <button
                          onClick={() => isChanged && toggleApproved(i)}
                          disabled={!isChanged}
                          className={cn(
                            "shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                            !isChanged
                              ? "border-muted-foreground/20 cursor-default"
                              : entry.approved
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-muted-foreground/30 hover:border-muted-foreground"
                          )}
                        >
                          {entry.approved && isChanged && <Check className="h-2.5 w-2.5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-caption text-muted-foreground/50 truncate line-through leading-tight">
                            {entry.file.name}
                          </p>
                          <p className="text-xs font-medium truncate leading-tight">
                            {entry.newName}
                          </p>
                          {entry.error && (
                            <p className="text-micro text-destructive mt-0.5">{entry.error}</p>
                          )}
                        </div>
                        {isChanged && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEntries((prev) =>
                                prev.map((e, idx) =>
                                  idx === i
                                    ? { ...e, newName: e.file.name, approved: false, error: undefined }
                                    : e,
                                ),
                              )
                            }}
                            className="shrink-0 p-0.5 rounded hover:bg-accent text-muted-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {entries.length > 0 && (
            <DialogFooter className="m-0 shrink-0 rounded-none border-t px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={approvedCount === 0 || applying}
                className="gap-1.5 text-background"
                size="sm"
              >
                {applying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {applying ? "Applying..." : `Apply ${approvedCount} Rename${approvedCount !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
