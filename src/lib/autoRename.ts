import { invoke } from "@tauri-apps/api/core"
import type { FileInfo } from "@/lib/types"
import { getReasoningConfig } from "@/lib/settings"
import { getActiveProvider } from "@/lib/providers"
import { VCE_JSON_FORMAT_GUARD, VCE_SYSTEM_PREAMBLE } from "@/lib/aiAssistant"

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

const RENAME_SYSTEM_PROMPT = `${VCE_SYSTEM_PREAMBLE}

You rename student files in a VCE study app. Make filenames clean, consistent, and descriptive.

Rules:
- Filenames include extensions. Preserve the original extension exactly.
- Convert underscores, hyphens, and excessive punctuation to spaces. Use Title Case (capitalise each significant word).
- Strip download artefacts: leading numbers, dates, "(1)", "[Download]", "copy of", etc.
- Keep meaningful information: subject names, unit numbers, SAC numbers, topic names, and year references.
- Aim for 3-7 words before the extension. If the name is already short and clean, do not artificially pad it.
- Collapse multiple spaces into one. Never leave a name empty or whitespace-only.
- When a content preview is provided, USE it to infer a more appropriate subject or topic in the filename.
- Return one rename item for each original filename provided.

${VCE_JSON_FORMAT_GUARD}`

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
  model: string,
  fileContentPreviews: Map<string, string>,
  signal?: AbortSignal,
): Promise<{ original: string; renamed: string }[]> {
  const provider = getActiveProvider()
  if (!provider.isConfigured()) {
    throw new Error(`${provider.displayName} is not configured. Set it up in Settings.`)
  }

  const fileNames = files.map((f) => f.name)
  const renameRequestLines = files.map((file, index) => {
    const preview = fileContentPreviews.get(file.path)
    if (!preview) {
      return `${index + 1}. ${file.name}`
    }

    return `${index + 1}. ${file.name}\nContent preview:\n"""\n${preview}\n"""`
  })

  const schema = {
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
  } as const

  const reasoning = getReasoningConfig().reasoning ?? undefined

  const result = await provider.chatCompletion({
    model,
    messages: [
      { role: "system", content: RENAME_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Rename these files:\n${renameRequestLines.join("\n\n")}`,
      },
    ],
    jsonSchema: { name: "file_renames", strict: true, schema },
    temperature: 0.2,
    maxTokens: 2048,
    reasoning,
    ...(signal ? { signal } : {}),
  })

  const parsedResponse = parseStructuredRenameResponse(result.content)
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
