import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getTimetableConfig } from "@/lib/settings"
import { setCachedPreference } from "@/lib/storage/preferences"
import { recordLocalSoftDelete, recordLocalUpsert } from "@/lib/sync/engine"
import { VCE_SUBJECTS, type Subject } from "@/lib/types"

const CUSTOM_SUBJECTS_KEY = "focal-custom-subjects"
const HIDDEN_SUBJECTS_KEY = "focal-hidden-subjects"

function readArray<T>(key: string, isItem: (value: unknown) => value is T): T[] {
  if (typeof window === "undefined") return []
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(parsed) ? parsed.filter(isItem) : []
  } catch {
    return []
  }
}

function isSubject(value: unknown): value is Subject {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.id === "string"
    && typeof record.name === "string"
    && typeof record.shortCode === "string"
    && typeof record.color === "string"
    && (record.icon === undefined || typeof record.icon === "string")
}

const readCustomSubjects = () => readArray(CUSTOM_SUBJECTS_KEY, isSubject)
const readHiddenSubjectIds = () => readArray(HIDDEN_SUBJECTS_KEY, (value): value is string => typeof value === "string")

export function useSyncedPreferences() {
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(readCustomSubjects)
  const [hiddenSubjectIds, setHiddenSubjectIds] = useState<string[]>(readHiddenSubjectIds)
  const [timetableConfig, setTimetableConfig] = useState(getTimetableConfig)
  const suppressCustomSync = useRef(false)
  const suppressHiddenSync = useRef(false)
  const suppressTimetableSync = useRef(false)

  const allSubjects = useMemo(() => [...VCE_SUBJECTS, ...customSubjects], [customSubjects])
  const availableSubjects = useMemo(
    () => allSubjects.filter((subject) => !hiddenSubjectIds.includes(subject.id)),
    [allSubjects, hiddenSubjectIds],
  )

  useEffect(() => setCachedPreference(CUSTOM_SUBJECTS_KEY, JSON.stringify(customSubjects), true), [customSubjects])
  useEffect(() => setCachedPreference(HIDDEN_SUBJECTS_KEY, JSON.stringify(hiddenSubjectIds), true), [hiddenSubjectIds])

  useEffect(() => {
    const onTimetableChanged = () => setTimetableConfig(getTimetableConfig())
    const onSyncChanged = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table
      if (table === "custom_subjects") {
        suppressCustomSync.current = true
        setCustomSubjects(readCustomSubjects())
      } else if (table === "hidden_subjects") {
        suppressHiddenSync.current = true
        setHiddenSubjectIds(readHiddenSubjectIds())
      } else if (table === "timetable_config") {
        suppressTimetableSync.current = true
        setTimetableConfig(getTimetableConfig())
      }
    }
    window.addEventListener("focal-timetable-updated", onTimetableChanged)
    window.addEventListener("focal-sync-data-changed", onSyncChanged)
    return () => {
      window.removeEventListener("focal-timetable-updated", onTimetableChanged)
      window.removeEventListener("focal-sync-data-changed", onSyncChanged)
    }
  }, [])

  const previousCustomIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    const previous = previousCustomIds.current
    const current = new Set(customSubjects.map((subject) => subject.id))
    previousCustomIds.current = current
    if (suppressCustomSync.current) {
      suppressCustomSync.current = false
      return
    }
    if (!previous) return
    customSubjects.forEach((subject) => void recordLocalUpsert("custom_subjects", subject))
    previous.forEach((id) => {
      if (!current.has(id)) void recordLocalSoftDelete("custom_subjects", id)
    })
  }, [customSubjects])

  const previousHiddenIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    const previous = previousHiddenIds.current
    const current = new Set(hiddenSubjectIds)
    previousHiddenIds.current = current
    if (suppressHiddenSync.current) {
      suppressHiddenSync.current = false
      return
    }
    if (!previous) return
    hiddenSubjectIds.forEach((id) => void recordLocalUpsert("hidden_subjects", id))
    previous.forEach((id) => {
      if (!current.has(id)) void recordLocalSoftDelete("hidden_subjects", id)
    })
  }, [hiddenSubjectIds])

  const timetableReady = useRef(false)
  useEffect(() => {
    if (!timetableReady.current) {
      timetableReady.current = true
      return
    }
    if (suppressTimetableSync.current) {
      suppressTimetableSync.current = false
      return
    }
    void recordLocalUpsert("timetable_config", timetableConfig)
  }, [timetableConfig])

  const toggleSubjectVisibility = useCallback((subjectId: string) => {
    setHiddenSubjectIds((current) => current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId])
  }, [])

  const showAllSubjects = useCallback(() => setHiddenSubjectIds([]), [])

  return {
    allSubjects,
    availableSubjects,
    customSubjects,
    hiddenSubjectIds,
    timetableConfig,
    setCustomSubjects,
    toggleSubjectVisibility,
    showAllSubjects,
  }
}
