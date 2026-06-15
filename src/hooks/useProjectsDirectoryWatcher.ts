import { useEffect, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { watch } from "@tauri-apps/plugin-fs"

export const PROJECTS_DIR_CHANGED_EVENT = "focal-projects-dir-changed"

export function useProjectsDirectoryWatcher(
  projectsRoot: string | null,
  onChange?: () => void,
) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const unwatchPromiseRef = useRef<Promise<(() => void) | undefined> | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const setup = async () => {
      try {
        const projectsDir = projectsRoot ?? await invoke<string>("get_projects_directory")
        if (!projectsDir) return
        unwatchPromiseRef.current = watch(
          projectsDir,
          () => {
            if (timeout) {
              clearTimeout(timeout)
            }
            timeout = setTimeout(() => {
              timeout = null
              if (!cancelled) {
                onChangeRef.current?.()
                window.dispatchEvent(new CustomEvent(PROJECTS_DIR_CHANGED_EVENT))
              }
            }, 200)
          },
          { recursive: true },
        )
        const unwatch = await unwatchPromiseRef.current
        if (cancelled) {
          unwatch?.()
        }
      } catch (e) {
        console.error("Failed to watch projects directory:", e)
      }
    }

    void setup()

    return () => {
      cancelled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      if (unwatchPromiseRef.current) {
        unwatchPromiseRef.current.then((unwatch) => unwatch?.()).catch(() => {})
      }
    }
  }, [projectsRoot])
}
