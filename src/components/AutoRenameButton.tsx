import { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Wand2, Loader2, X, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { FileInfo } from "@/lib/types"
import { getApiKey, getModel, getAutoRenameUseFileContent, setAutoRenameUseFileContent } from "@/lib/settings"
interface RenameEntry {
  file: FileInfo
  newName: string
  approved: boolean
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
      prev.map((e, i) => (i === index ? { ...e, approved: !e.approved } : e)),
    )
  }, [])

  const handleApply = useCallback(async () => {
    const toApply = entries
      .filter((e) => e.approved && e.newName !== e.file.name)
      .map((e) => ({ filePath: e.file.path, newName: e.newName }))
    if (toApply.length === 0) return
    await onApplyRenames(toApply)
    setOpen(false)
  }, [entries, onApplyRenames])

  const changedCount = entries.filter((e) => e.newName !== e.file.name).length
  const approvedCount = entries.filter((e) => e.approved && e.newName !== e.file.name).length

  if (files.length === 0) return null

  return (
    <>
      <Button
        onClick={handleOpen}
        size="sm"
        className="fixed bottom-6 right-6 z-40 shadow-lg gap-1.5 rounded-full px-4 h-10 bg-primary hover:bg-primary/90"
      >
        <Wand2 className="h-4 w-4" />
        <span className="text-sm font-medium">Auto Rename</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Auto Rename Files</DialogTitle>
            <DialogDescription>
              Use AI to clean up and standardize file names across your project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            {apiKeyMissing && (
              <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                OpenRouter API key not configured. Go to{" "}
                <span className="font-medium">Settings</span> in the sidebar to set it up.
              </p>
            )}

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
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
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {changedCount} change{changedCount !== 1 ? "s" : ""} suggested
                    {approvedCount !== changedCount
                      ? ` · ${approvedCount} approved`
                      : ""}
                  </span>
                  {changedCount > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setEntries((prev) =>
                            prev.map((e) => ({ ...e, approved: true })),
                          )
                        }
                        className="hover:text-foreground"
                      >
                        Approve all
                      </button>
                      <button
                        onClick={() =>
                          setEntries((prev) =>
                            prev.map((e) => ({
                              ...e,
                              approved: e.newName === e.file.name,
                            })),
                          )
                        }
                        className="hover:text-foreground"
                      >
                        Reject all
                      </button>
                    </div>
                  )}
                </div>

                <ScrollArea className="flex-1 border rounded-lg">
                  <div className="divide-y">
                    {entries.map((entry, i) => {
                      const isChanged = entry.newName !== entry.file.name
                      return (
                        <div
                          key={entry.file.path}
                          className={`flex items-center gap-3 px-3 py-2.5 text-sm ${
                            !isChanged ? "opacity-40" : ""
                          }`}
                        >
                          <button
                            onClick={() => isChanged && toggleApproved(i)}
                            disabled={!isChanged}
                            className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              !isChanged
                                ? "border-muted-foreground/20 cursor-default"
                                : entry.approved
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : "border-muted-foreground/30 hover:border-muted-foreground"
                            }`}
                          >
                            {entry.approved && isChanged && (
                              <Check className="h-3 w-3" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-caption text-muted-foreground/50 truncate line-through">
                              {entry.file.name}
                            </p>
                            <p className="text-sm font-medium truncate">
                              {entry.newName}
                            </p>
                          </div>
                          {isChanged && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEntries((prev) =>
                                  prev.map((e, idx) =>
                                    idx === i
                                      ? { ...e, newName: e.file.name, approved: false }
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

                <Button
                  onClick={handleApply}
                  disabled={approvedCount === 0}
                  className="gap-1.5"
                  size="sm"
                >
                  <Check className="h-4 w-4" />
                  Apply {approvedCount} Rename{approvedCount !== 1 ? "s" : ""}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
