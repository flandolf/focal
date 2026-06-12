import { useState, useEffect, useCallback, useRef } from "react"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"

interface PersistedDataOptions<T> {
  fileName: string
  normalize: (raw: unknown) => T
  onLoad?: (data: T[]) => T[]
}

interface PersistedDataResult<T> {
  data: T[]
  loading: boolean
  error: string | null
  save: (updated: T[]) => Promise<void>
  refresh: () => Promise<void>
}

export function usePersistedData<T>({
  fileName,
  normalize,
  onLoad,
}: PersistedDataOptions<T>): PersistedDataResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Refs for callbacks so changes don't trigger re-fetches.
  const normalizeRef = useRef(normalize)
  const onLoadRef = useRef(onLoad)
  useEffect(() => { normalizeRef.current = normalize })
  useEffect(() => { onLoadRef.current = onLoad })

  const getFilePath = useCallback(async () => {
    const baseDir = await appDataDir()
    return `${baseDir}/${fileName}`
  }, [fileName])

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const filePath = await getFilePath()
      if (await exists(filePath)) {
        const content = await readTextFile(filePath)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = JSON.parse(content)
        let normalised: T[] = Array.isArray(raw) ? raw.map(normalizeRef.current) : []
        if (onLoadRef.current) {
          normalised = onLoadRef.current(normalised)
        }
        setData(normalised)
      }
    } catch (e) {
      const msg = `Failed to load ${fileName}: ${String(e)}`
      console.error(msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [getFilePath, fileName])

  const save = useCallback(async (updated: T[]) => {
    const baseDir = await appDataDir()
    const dirExists = await exists(baseDir)
    if (!dirExists) {
      await mkdir(baseDir, { recursive: true })
    }
    const filePath = await getFilePath()
    await writeTextFile(filePath, JSON.stringify(updated, null, 2))
    setData(updated)
  }, [getFilePath])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, @typescript-eslint/no-floating-promises
    refresh()
  }, [refresh])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ fileName?: string }>).detail
      if (detail?.fileName === fileName) {
        void refresh()
      }
    }
    window.addEventListener("focal-sync-data-changed", handler)
    return () => window.removeEventListener("focal-sync-data-changed", handler)
  }, [fileName, refresh])

  return { data, loading, error, save, refresh }
}
