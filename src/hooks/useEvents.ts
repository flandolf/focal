import { useState, useEffect, useCallback, useRef } from "react"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"
import type { CalendarEvent, EventType } from "@/lib/types"
import { generateId } from "@/lib/utils"

function getEventEndTime(event: Pick<CalendarEvent, "startTime" | "endTime">): number {
  const value = event.endTime ?? event.startTime
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

function eventHasPassed(event: Pick<CalendarEvent, "startTime" | "endTime">, now = Date.now()): boolean {
  return getEventEndTime(event) < now
}

function markPastEventsFinished(events: CalendarEvent[], now = Date.now()): CalendarEvent[] {
  let changed = false
  const finishedAt = new Date(now).toISOString()
  const updated = events.map((event) => {
    if (event.isFinished || !eventHasPassed(event, now)) return event
    changed = true
    return { ...event, isFinished: true, finishedAt }
  })
  return changed ? updated : events
}

function normaliseEvent(raw: unknown): CalendarEvent {
  const obj = raw as Record<string, unknown>
  const source = obj.source as Record<string, unknown> | undefined
  const eventType =
    obj.eventType === "sac" ||
    obj.eventType === "exam" ||
    obj.eventType === "assignment" ||
    obj.eventType === "event" ||
    obj.eventType === "homework" ||
    obj.eventType === "other" ||
    obj.eventType === "practice-sac"
      ? obj.eventType
      : "event"

  const event: CalendarEvent = {
    id: typeof obj.id === "string" ? obj.id : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title: typeof obj.title === "string" ? obj.title : "Untitled Event",
    description: typeof obj.description === "string" ? obj.description : undefined,
    startTime: typeof obj.startTime === "string" ? obj.startTime : new Date().toISOString(),
    endTime: typeof obj.endTime === "string" ? obj.endTime : undefined,
    eventType,
    subjectId: typeof obj.subjectId === "string" ? obj.subjectId : undefined,
    location: typeof obj.location === "string" ? obj.location : undefined,
    isFinished: typeof obj.isFinished === "boolean" ? obj.isFinished : false,
    finishedAt: typeof obj.finishedAt === "string" ? obj.finishedAt : undefined,
    source: source?.type === "notion" && typeof source.id === "string"
      ? {
        type: "notion",
        id: source.id,
        url: typeof source.url === "string" ? source.url : undefined,
        lastEditedTime: typeof source.lastEditedTime === "string" ? source.lastEditedTime : undefined,
        kind: source.kind === "event" || source.kind === "session" ? source.kind : undefined,
      }
      : undefined,
    created_at: typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
  }
  return event
}

function getEventsFilePath(baseDir: string) {
  return `${baseDir}/events.json`
}

export function useEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Ref always holds the latest events so mutation callbacks never operate on stale closures.
  const eventsRef = useRef(events)
  useEffect(() => { eventsRef.current = events })

  const loadEvents = useCallback(async () => {
    try {
      setError(null)
      const baseDir = await appDataDir()
      const filePath = getEventsFilePath(baseDir)

      if (await exists(filePath)) {
        const content = await readTextFile(filePath)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = JSON.parse(content)
        const normalised: CalendarEvent[] = Array.isArray(raw) ? raw.map(normaliseEvent) : []
        const updated = markPastEventsFinished(normalised)
        if (updated !== normalised) {
          await writeTextFile(filePath, JSON.stringify(updated, null, 2))
        }
        setEvents(updated)
      }
    } catch (e) {
      const msg = `Failed to load events: ${String(e)}`
      console.error(msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveEvents = useCallback(async (updatedEvents: CalendarEvent[]) => {
    const baseDir = await appDataDir()
    const dirExists = await exists(baseDir)
    if (!dirExists) {
      await mkdir(baseDir, { recursive: true })
    }
    const filePath = getEventsFilePath(baseDir)
    await writeTextFile(filePath, JSON.stringify(updatedEvents, null, 2))
    setEvents(updatedEvents)
  }, [])

  const addEvent = useCallback(async (data: {
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
    source?: CalendarEvent["source"]
  }) => {
    const event: CalendarEvent = {
      id: generateId(),
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      eventType: data.eventType,
      subjectId: data.subjectId,
      location: data.location,
      source: data.source,
      isFinished: eventHasPassed(data),
      finishedAt: eventHasPassed(data) ? new Date().toISOString() : undefined,
      created_at: new Date().toISOString(),
    }
    const updated = [...eventsRef.current, event]
    await saveEvents(updated)
    return event
  }, [saveEvents])

  const addEvents = useCallback(async (items: {
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
    source?: CalendarEvent["source"]
  }[]) => {
    const createdAt = new Date().toISOString()
    const newEvents: CalendarEvent[] = items.map((data) => ({
      id: generateId(),
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      eventType: data.eventType,
      subjectId: data.subjectId,
      location: data.location,
      source: data.source,
      isFinished: eventHasPassed(data),
      finishedAt: eventHasPassed(data) ? createdAt : undefined,
      created_at: createdAt,
    }))
    const updated = [...eventsRef.current, ...newEvents]
    await saveEvents(updated)
    return newEvents
  }, [saveEvents])

  const updateEvent = useCallback(async (
    id: string,
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
  ) => {
    const updated = markPastEventsFinished(eventsRef.current.map((event) =>
      event.id === id ? { ...event, ...updates } : event
    ))
    await saveEvents(updated)
  }, [saveEvents])

  const updateEvents = useCallback(async (items: {
    id: string
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
  }[]) => {
    const updateMap = new Map(items.map((item) => [item.id, item.updates]))
    const updated = markPastEventsFinished(eventsRef.current.map((event) => {
      const updates = updateMap.get(event.id)
      return updates ? { ...event, ...updates } : event
    }))
    await saveEvents(updated)
  }, [saveEvents])

  const deleteEvent = useCallback(async (id: string) => {
    const updated = eventsRef.current.filter((event) => event.id !== id)
    await saveEvents(updated)
  }, [saveEvents])

  const restoreEvent = useCallback(async (event: CalendarEvent) => {
    const exists = eventsRef.current.some((e) => e.id === event.id)
    if (exists) return
    const updated = [...eventsRef.current, event]
    await saveEvents(updated)
  }, [saveEvents])

  const deleteEvents = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids)
    const updated = eventsRef.current.filter((event) => !idSet.has(event.id))
    await saveEvents(updated)
  }, [saveEvents])

  const restoreEvents = useCallback(async (eventsToRestore: CalendarEvent[]) => {
    const existingIds = new Set(eventsRef.current.map((e) => e.id))
    const newEvents = eventsToRestore.filter((e) => !existingIds.has(e.id))
    if (newEvents.length === 0) return
    const updated = [...eventsRef.current, ...newEvents]
    await saveEvents(updated)
  }, [saveEvents])

  const updateAndDeleteEvents = useCallback(async (
    items: {
      id: string
      updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
    }[],
    ids: string[],
  ) => {
    const updateMap = new Map(items.map((item) => [item.id, item.updates]))
    const deleteSet = new Set(ids)
    const updated = markPastEventsFinished(eventsRef.current
      .filter((event) => !deleteSet.has(event.id))
      .map((event) => {
        const updates = updateMap.get(event.id)
        return updates ? { ...event, ...updates } : event
      }))
    await saveEvents(updated)
  }, [saveEvents])

  const syncEvents = useCallback(async (
    itemsToCreate: Omit<CalendarEvent, "id" | "created_at">[],
    itemsToUpdate: {
      id: string
      updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
    }[],
  ) => {
    const updateMap = new Map(itemsToUpdate.map((item) => [item.id, item.updates]))
    const createdAt = new Date().toISOString()
    const newEvents: CalendarEvent[] = itemsToCreate.map((data) => ({
      id: generateId(),
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      eventType: data.eventType,
      subjectId: data.subjectId,
      location: data.location,
      source: data.source,
      isFinished: eventHasPassed(data),
      finishedAt: eventHasPassed(data) ? createdAt : undefined,
      created_at: createdAt,
    }))
    const updated = markPastEventsFinished([
      ...eventsRef.current.map((event) => {
        const updates = updateMap.get(event.id)
        return updates ? { ...event, ...updates } : event
      }),
      ...newEvents,
    ])
    await saveEvents(updated)
    return newEvents
  }, [saveEvents])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, @typescript-eslint/no-floating-promises
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    const markFinished = () => {
      setEvents((current) => {
        const updated = markPastEventsFinished(current)
        if (updated !== current) {
          void saveEvents(updated)
        }
        return updated
      })
    }

    markFinished()
    const interval = window.setInterval(markFinished, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [saveEvents])

  return {
    events,
    loading,
    error,
    addEvent,
    addEvents,
    updateEvent,
    updateEvents,
    deleteEvent,
    deleteEvents,
    restoreEvent,
    restoreEvents,
    updateAndDeleteEvents,
    syncEvents,
    refresh: loadEvents,
  }
}
