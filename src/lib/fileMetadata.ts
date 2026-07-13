import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, exists, mkdir } from "@tauri-apps/plugin-fs"
import type { FileTag } from "@/lib/types"

export interface FileMeta {
  tags?: FileTag[]
  isFavorite?: boolean
}

export type MetadataMap = Record<string, FileMeta>

let _cache: MetadataMap | null = null
let _cacheKey = ""

function getAppDataFilePath(baseDir: string, fileName: string) {
  return `${baseDir.replace(/\/+$/, "")}/${fileName}`
}

async function getMetadataPath(): Promise<string> {
  const base = await appDataDir()
  return getAppDataFilePath(base, "focal_file_metadata.json")
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
  const base = await appDataDir()
  if (!(await exists(base))) {
    await mkdir(base, { recursive: true })
  }
  const path = getAppDataFilePath(base, "focal_file_metadata.json")
  await writeTextFile(path, JSON.stringify(meta, null, 2))
  _cache = meta
}

export async function setFileTags(
  filePaths: string[],
  tags: FileTag[],
): Promise<void> {
  const meta = { ...await loadFileMetadata() }
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
  const meta = { ...await loadFileMetadata() }
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
  const meta = { ...await loadFileMetadata() }
  const existing = meta[filePath]
  if (!existing?.tags) return
  const next = existing.tags.filter((t) => t !== tag)
  meta[filePath] = { ...existing, tags: next.length > 0 ? next : undefined }
  await saveFileMetadata(meta)
}

export async function toggleFileFavorite(filePath: string): Promise<boolean> {
  const meta = { ...await loadFileMetadata() }
  const existing = meta[filePath] ?? {}
  const next = !existing.isFavorite
  meta[filePath] = { ...existing, isFavorite: next }
  await saveFileMetadata(meta)
  return next
}

export async function moveFileMetadata(oldPath: string, newPath: string): Promise<void> {
  if (oldPath === newPath) return
  const current = await loadFileMetadata()
  const meta = relocateFileMetadata(current, oldPath, newPath)
  if (meta === current) return
  await saveFileMetadata(meta)
}

export function relocateFileMetadata(
  current: MetadataMap,
  oldPath: string,
  newPath: string,
): MetadataMap {
  const existing = current[oldPath]
  if (oldPath === newPath || !existing) return current
  const next = { ...current, [newPath]: existing }
  delete next[oldPath]
  return next
}

export async function moveFileMetadataPrefix(oldPrefix: string, newPrefix: string): Promise<void> {
  const current = await loadFileMetadata()
  const next = relocateFileMetadataPrefix(current, oldPrefix, newPrefix)
  if (next === current) return
  await saveFileMetadata(next)
}

export async function copyFileMetadataPrefix(oldPrefix: string, newPrefix: string): Promise<void> {
  const current = await loadFileMetadata()
  const next = copyFileMetadataPrefixEntries(current, oldPrefix, newPrefix)
  if (next === current) return
  await saveFileMetadata(next)
}

export function relocateFileMetadataPrefix(
  current: MetadataMap,
  oldPrefix: string,
  newPrefix: string,
): MetadataMap {
  return remapFileMetadataPrefix(current, oldPrefix, newPrefix, true)
}

export function copyFileMetadataPrefixEntries(
  current: MetadataMap,
  oldPrefix: string,
  newPrefix: string,
): MetadataMap {
  return remapFileMetadataPrefix(current, oldPrefix, newPrefix, false)
}

function remapFileMetadataPrefix(
  current: MetadataMap,
  oldPrefix: string,
  newPrefix: string,
  removeSource: boolean,
): MetadataMap {
  const oldNormalized = oldPrefix.replace(/\\/g, "/").replace(/\/+$/, "")
  const newNormalized = newPrefix.replace(/\\/g, "/").replace(/\/+$/, "")
  const caseInsensitive = /^[a-z]:/i.test(oldNormalized)
  const comparableOld = caseInsensitive ? oldNormalized.toLowerCase() : oldNormalized
  let next: MetadataMap | undefined

  for (const [path, metadata] of Object.entries(current)) {
    const normalized = path.replace(/\\/g, "/")
    const comparablePath = caseInsensitive ? normalized.toLowerCase() : normalized
    if (comparablePath !== comparableOld && !comparablePath.startsWith(`${comparableOld}/`)) continue
    const separator = newPrefix.includes("\\") ? "\\" : "/"
    const destination = `${newNormalized}${normalized.slice(oldNormalized.length)}`.replace(/\//g, separator)
    next ??= { ...current }
    if (removeSource) delete next[path]
    next[destination] = metadata
  }

  return next ?? current
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
  const meta = { ...await loadFileMetadata() }
  let changed = false
  for (const fp of filePaths) {
    if (meta[fp] !== undefined) {
      delete meta[fp]
      changed = true
    }
  }
  if (changed) await saveFileMetadata(meta)
}
