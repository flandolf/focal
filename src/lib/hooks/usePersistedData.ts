import { useState, useEffect, useCallback, useRef } from "react"
import { readPersistedArray, writePersistedArray } from "@/lib/storage/database"
import type { CoreDataFile } from "@/lib/storage/records"

/**
 * Generic hook for reading/writing a JSON array from the Tauri app-data directory.
 * Normalises each raw row on load, applies an optional post-load filter, and
 * listens to `focal-sync-data-changed` events so external sync writes are reflected
 * in React state without reloading the page.
 */
interface PersistedDataOptions<T> {
  fileName: CoreDataFile
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

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const raw = await readPersistedArray(fileName)
      let normalised = raw.map(normalizeRef.current)
      if (onLoadRef.current) {
        normalised = onLoadRef.current(normalised)
      }
      setData(normalised)
    } catch (e) {
      const msg = `Failed to load ${fileName}: ${String(e)}`
      console.error(msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [fileName])

  const save = useCallback(async (updated: T[]) => {
    await writePersistedArray(fileName, updated)
    setData(updated)
  }, [fileName])

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
