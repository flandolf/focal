import { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
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
import { getApiKey, getModel, getAutoRenameUseFileContent, setAutoRenameUseFileContent, getReasoningConfig } from "@/lib/settings"
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


interface StructuredRenameItem {
  original: string
  renamed: string
}

interface StructuredRenameResponse {
  renames: StructuredRenameItem[]
}

interface FileContentPreview {
  file_path: string
  content: string
}

function parseStructuredRenameResponse(content: string): StructuredRenameResponse {
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid structured rename response")
  }

  const renames = (parsed as { renames?: unknown }).renames
  if (!Array.isArray(renames)) {
    throw new Error("Structured rename response missing renames array")
  }

  const normalizedRenames = renames.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return []
    const original = (entry as { original?: unknown }).original
    const renamed = (entry as { renamed?: unknown }).renamed
    if (typeof original !== "string" || typeof renamed !== "string") return []
    return [{ original, renamed }]
  })

  if (normalizedRenames.length === 0) {
    throw new Error("Structured rename response did not contain valid rename items")
  }

  return { renames: normalizedRenames }
}

function normalizeRename(original: string, proposed: string): string {
  const sanitized = proposed.replace(/[\\/]/g, " ").replace(/\s+/g, " ").trim()
  if (!sanitized) return original

  const originalDotIndex = original.lastIndexOf(".")
  if (originalDotIndex <= 0) return sanitized

  const originalExtension = original.slice(originalDotIndex)
  const proposedDotIndex = sanitized.lastIndexOf(".")

  if (proposedDotIndex <= 0) {
    return `${sanitized}${originalExtension}`
  }

  const proposedBase = sanitized.slice(0, proposedDotIndex)
  const proposedExtension = sanitized.slice(proposedDotIndex)
  if (proposedExtension.toLowerCase() !== originalExtension.toLowerCase()) {
    return `${proposedBase}${originalExtension}`
  }

  return sanitized
}

async function getFileContentPreviews(files: FileInfo[]): Promise<Map<string, string>> {
  const previews = await invoke<FileContentPreview[]>("get_file_content_previews", {
    filePaths: files.map((file) => file.path),
    maxCharsPerFile: 1000,
  })

  return new Map(previews.map((preview) => [preview.file_path, preview.content]))
}

async function generateRenames(
  files: FileInfo[],
  apiKey: string,
  model: string,
  fileContentPreviews: Map<string, string>,
): Promise<{ original: string; renamed: string }[]> {
  const fileNames = files.map((f) => f.name)
  const renameRequestLines = files.map((file, index) => {
    const preview = fileContentPreviews.get(file.path)
    if (!preview) {
      return `${index + 1}. ${file.name}`
    }

    return `${index + 1}. ${file.name}\nContent preview:\n"""\n${preview}\n"""`
  })

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You are a file-renaming assistant for a VCE (Victorian Certificate of Education) study app. Rename files to be clean, consistent, and descriptive.

Rules:
- Filenames include extensions. Preserve each original extension exactly.
- Convert underscores, hyphens, and excessive punctuation to spaces.
- Use Title Case (capitalize each significant word).
- Remove download artifacts: leading numbers, dates, "(1)", "[Download]", "copy of", etc.
- Keep meaningful information: subject names, unit numbers, SAC numbers, topic names, and year references.
- Make names concise but descriptive — aim for 3-7 words before the extension.
- Collapse multiple spaces into one.
- Never leave a name empty or just whitespace.
- If a name is already clean, keep it as-is.
- Return one rename item for each original filename provided.
- If a file has a content preview, use it to infer a more appropriate subject/topic in the filename when helpful.`,
        },
        {
          role: "user",
          content: `Rename these files:\n${renameRequestLines.join("\n\n")}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "file_renames",
          strict: true,
          schema: {
            type: "object",
            properties: {
              renames: {
                type: "array",
                description: "One rename result for each input filename.",
                items: {
                  type: "object",
                  properties: {
                    original: {
                      type: "string",
                      description: "The original filename exactly as provided.",
                      enum: fileNames,
                    },
                    renamed: {
                      type: "string",
                      description: "The cleaned filename, keeping the same extension.",
                    },
                  },
                  required: ["original", "renamed"],
                  additionalProperties: false,
                },
              },
            },
            required: ["renames"],
            additionalProperties: false,
          },
        },
      },
      provider: {
        require_parameters: true,
      },
      temperature: 0.2,
      max_tokens: 2048,
      ...getReasoningConfig(),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${text}`)
  }

  const data: unknown = await response.json()
  const content = (
    data as { choices?: { message?: { content?: string } }[] }
  ).choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("No structured content in OpenRouter response")
  }

  const parsedResponse = parseStructuredRenameResponse(content)
  const mapping = new Map(
    parsedResponse.renames.map((entry) => [entry.original, normalizeRename(entry.original, entry.renamed)]),
  )

  return fileNames.map((original) => ({
    original,
    renamed: mapping.get(original) ?? original,
  }))
}
export function AutoRenameButton({ files, onApplyRenames }: AutoRenameButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [entries, setEntries] = useState<RenameEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [useFileContent, setUseFileContent] = useState(() => getAutoRenameUseFileContent())
  const apiKeyMissing = !getApiKey()
  const handleOpen = useCallback(() => {
    setEntries(files.map((f) => ({ file: f, newName: f.name, approved: true })))
    setUseFileContent(getAutoRenameUseFileContent())
    setError(null)
    setOpen(true)
  }, [files])


  const handleGenerate = useCallback(async () => {
    const key = getApiKey()
    if (!key) {
      setError("OpenRouter API key not configured. Set it in Settings.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const fileContentPreviews = useFileContent ? await getFileContentPreviews(files) : new Map<string, string>()
      const results = await generateRenames(files, key, getModel(), fileContentPreviews)
      const newEntries: RenameEntry[] = results.map((r) => {
        const file = files.find((f) => f.name === r.original)!
        return { file, newName: r.renamed, approved: r.renamed !== r.original }
      })
      setEntries(newEntries)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [files, useFileContent])

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
        <DialogContent className="flex h-[min(86dvh,44rem)] w-[calc(100vw-1rem)] max-w-3xl overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-3xl">
          <div className="border-b px-5 pb-4 pt-5">
            <DialogHeader>
              <DialogTitle>Auto Rename Files</DialogTitle>
              <DialogDescription>
                Use AI to clean up and standardize file names for this assessment.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
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

            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
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

            <div className="flex items-center gap-2">
              <Button
                onClick={handleGenerate}
                disabled={loading || apiKeyMissing}
                className="gap-1.5"
                size="sm"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {loading ? "Generating..." : "Generate Renames"}
              </Button>
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

            {entries.length > 0 && (
              <ScrollArea className="flex-1 border rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/30">
                  {entries.map((entry, i) => {
                    const isChanged = entry.newName !== entry.file.name
                    return (
                      <div
                        key={entry.file.path}
                        className={cn(
                          "flex items-center gap-2.5 bg-background px-3 py-2",
                          !isChanged && "opacity-40"
                        )}
                      >
                        <FileTypeIcon extension={entry.file.extension} className="size-7 rounded-md shrink-0" iconClassName="size-3.5" />
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
            <DialogFooter className="m-0 shrink-0 rounded-none px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleApply}
                disabled={approvedCount === 0 || applying}
                className="gap-1.5"
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
