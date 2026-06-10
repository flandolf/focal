import { invoke } from "@tauri-apps/api/core"
import type { FileInfo } from "@/lib/types"
import { getReasoningConfig } from "@/lib/settings"

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

const RENAME_SYSTEM_PROMPT = `You are a file-renaming assistant for a VCE (Victorian Certificate of Education) study app. Rename files to be clean, consistent, and descriptive.

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
- If a file has a content preview, use it to infer a more appropriate subject/topic in the filename when helpful.`

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

export function normalizeRename(original: string, proposed: string): string {
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

export async function getFileContentPreviews(
  files: FileInfo[],
  maxCharsPerFile = 1000,
): Promise<Map<string, string>> {
  if (files.length === 0) return new Map()
  const previews = await invoke<FileContentPreview[]>("get_file_content_previews", {
    filePaths: files.map((file) => file.path),
    maxCharsPerFile,
  })

  return new Map(previews.map((preview) => [preview.file_path, preview.content]))
}

export async function generateRenames(
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
        { role: "system", content: RENAME_SYSTEM_PROMPT },
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

export async function loadProjectFiles(projectFolderPath: string): Promise<FileInfo[]> {
  return await invoke<FileInfo[]>("get_project_files", {
    projectName: projectFolderPath,
    recursive: true,
  })
}
