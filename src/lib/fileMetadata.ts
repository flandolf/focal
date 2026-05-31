import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs"
import type { FileTag } from "@/lib/types"

export interface FileMeta {
  tags?: FileTag[]
  isFavorite?: boolean
}

type MetadataMap = Record<string, FileMeta>

let _cache: MetadataMap | null = null
let _cacheKey = ""

async function getMetadataPath(): Promise<string> {
  const base = await appDataDir()
  return `${base}focal_file_metadata.json`
}

export async function loadFileMetadata(): Promise<MetadataMap> {
  const path = await getMetadataPath()
  if (_cache && _cacheKey === path) return _cache

  try {
    if (await exists(path)) {
      const raw = await readTextFile(path)
      _cache = JSON.parse(raw) as MetadataMap
    } else {
      _cache = {}
    }
  } catch {
    _cache = {}
  }
  _cacheKey = path
  return _cache
}

async function saveFileMetadata(meta: MetadataMap): Promise<void> {
  const path = await getMetadataPath()
  await writeTextFile(path, JSON.stringify(meta, null, 2))
  _cache = meta
}

export async function setFileTags(
  filePaths: string[],
  tags: FileTag[],
): Promise<void> {
  const meta = await loadFileMetadata()
  for (const fp of filePaths) {
    const existing = meta[fp] ?? {}
    meta[fp] = { ...existing, tags: tags.length > 0 ? [...tags] : undefined }
  }
  await saveFileMetadata(meta)
}

export async function addFileTags(
  filePaths: string[],
  tags: FileTag[],
): Promise<void> {
  const meta = await loadFileMetadata()
  for (const fp of filePaths) {
    const existing = meta[fp] ?? {}
    const currentTags = new Set(existing.tags ?? [])
    for (const t of tags) currentTags.add(t)
    meta[fp] = { ...existing, tags: [...currentTags] }
  }
  await saveFileMetadata(meta)
}

export async function removeFileTag(
  filePath: string,
  tag: FileTag,
): Promise<void> {
  const meta = await loadFileMetadata()
  const existing = meta[filePath]
  if (!existing?.tags) return
  const next = existing.tags.filter((t) => t !== tag)
  meta[filePath] = { ...existing, tags: next.length > 0 ? next : undefined }
  await saveFileMetadata(meta)
}

export async function toggleFileFavorite(filePath: string): Promise<boolean> {
  const meta = await loadFileMetadata()
  const existing = meta[filePath] ?? {}
  const next = !existing.isFavorite
  meta[filePath] = { ...existing, isFavorite: next }
  await saveFileMetadata(meta)
  return next
}

/** Merge metadata into FileInfo objects — mutates in place for perf. */
export async function mergeMetadata<T extends { path: string; tag?: FileTag; tags?: FileTag[]; isFavorite?: boolean }>(
  files: T[],
): Promise<T[]> {
  if (files.length === 0) return files
  const meta = await loadFileMetadata()
  for (const f of files) {
    const m = meta[f.path]
    if (m) {
      f.tag = undefined
      f.tags = m.tags
      f.isFavorite = m.isFavorite
    } else {
      f.tags = undefined
      f.isFavorite = undefined
    }
  }
  return files
}

/** Clear metadata entries for deleted paths (garbage collection). */
export async function purgeMetadata(filePaths: string[]): Promise<void> {
  const meta = await loadFileMetadata()
  let changed = false
  for (const fp of filePaths) {
    if (meta[fp] !== undefined) {
      delete meta[fp]
      changed = true
    }
  }
  if (changed) await saveFileMetadata(meta)
}
