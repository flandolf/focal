import { useState, useEffect, useCallback } from "react"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"
import type { CalendarEvent, EventType } from "@/lib/types"

function normaliseEvent(raw: unknown): CalendarEvent {
  const obj = raw as Record<string, unknown>
  const eventType =
    obj.eventType === "sac" ||
    obj.eventType === "exam" ||
    obj.eventType === "assignment" ||
    obj.eventType === "gat" ||
    obj.eventType === "event"
      ? obj.eventType
      : "event"

  return {
    id: typeof obj.id === "string" ? obj.id : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    title: typeof obj.title === "string" ? obj.title : "Untitled Event",
    description: typeof obj.description === "string" ? obj.description : undefined,
    startTime: typeof obj.startTime === "string" ? obj.startTime : new Date().toISOString(),
    endTime: typeof obj.endTime === "string" ? obj.endTime : undefined,
    eventType,
    subjectId: typeof obj.subjectId === "string" ? obj.subjectId : undefined,
    location: typeof obj.location === "string" ? obj.location : undefined,
    created_at: typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
  }
}

function getEventsFilePath(baseDir: string) {
  return `${baseDir}/events.json`
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setEvents(normalised)
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
      created_at: new Date().toISOString(),
    }
    const updated = [...events, event]
    await saveEvents(updated)
    return event
  }, [events, saveEvents])

  const addEvents = useCallback(async (items: {
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
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
      created_at: createdAt,
    }))
    const updated = [...events, ...newEvents]
    await saveEvents(updated)
    return newEvents
  }, [events, saveEvents])

  const updateEvent = useCallback(async (
    id: string,
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
  ) => {
    const updated = events.map((event) =>
      event.id === id ? { ...event, ...updates } : event
    )
    await saveEvents(updated)
  }, [events, saveEvents])

  const deleteEvent = useCallback(async (id: string) => {
    const updated = events.filter((event) => event.id !== id)
    await saveEvents(updated)
  }, [events, saveEvents])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, @typescript-eslint/no-floating-promises
    loadEvents()
  }, [loadEvents])

  return {
    events,
    loading,
    error,
    addEvent,
    addEvents,
    updateEvent,
    deleteEvent,
    refresh: loadEvents,
  }
}
