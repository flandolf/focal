import { useCallback, useEffect } from "react"
import type { CalendarEvent, EventType } from "@/lib/types"
import { generateId, safeString, safeStringOpt, safeBool, safeDateMeta, parseNotionSource } from "@/lib/utils"
import { usePersistedData } from "@/lib/hooks/usePersistedData"
import { useLatestRef } from "@/lib/hooks/useLatestRef"
import { recordLocalSoftDelete, recordLocalUpsert } from "@/lib/sync/engine"

const VALID_EVENT_TYPES: readonly string[] = ["sac", "exam", "assignment", "event", "homework", "other", "practice-sac"]

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
  const eventType = VALID_EVENT_TYPES.includes(String(obj.eventType)) ? (obj.eventType as EventType) : "event"
  const meta = safeDateMeta(obj)
  return {
    id: safeString(obj, "id", `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
    title: safeString(obj, "title", "Untitled Event"),
    description: safeStringOpt(obj, "description"),
    startTime: safeString(obj, "startTime", new Date().toISOString()),
    endTime: safeStringOpt(obj, "endTime"),
    eventType,
    subjectId: safeStringOpt(obj, "subjectId"),
    location: safeStringOpt(obj, "location"),
    isFinished: safeBool(obj, "isFinished", false),
    finishedAt: safeStringOpt(obj, "finishedAt"),
    source: parseNotionSource(obj.source),
    ...meta,
  }
}

export function useEvents() {
  const { data: events, loading, error, save: saveEvents, refresh } = usePersistedData({
    fileName: "events.json",
    normalize: normaliseEvent,
    onLoad: (normalised) => markPastEventsFinished(normalised.filter((event) => !event.deleted_at)),
  })

  const eventsRef = useLatestRef(events)

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
    const now = new Date().toISOString()
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
      finishedAt: eventHasPassed(data) ? now : undefined,
      created_at: now,
      updated_at: now,
    }
    const updated = [...eventsRef.current, event]
    await saveEvents(updated)
    void recordLocalUpsert("events", event)
    return event
  }, [eventsRef, saveEvents])

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
      updated_at: createdAt,
    }))
    const updated = [...eventsRef.current, ...newEvents]
    await saveEvents(updated)
    newEvents.forEach((event) => void recordLocalUpsert("events", event))
    return newEvents
  }, [eventsRef, saveEvents])

  const updateEvent = useCallback(async (
    id: string,
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
  ) => {
    const updated = markPastEventsFinished(eventsRef.current.map((event) =>
      event.id === id ? { ...event, ...updates, updated_at: new Date().toISOString() } : event
    ))
    await saveEvents(updated)
    const event = updated.find((item) => item.id === id)
    if (event) void recordLocalUpsert("events", event)
  }, [eventsRef, saveEvents])

  const updateEvents = useCallback(async (items: {
    id: string
    updates: Partial<Omit<CalendarEvent, "id" | "created_at">>
  }[]) => {
    const updateMap = new Map(items.map((item) => [item.id, item.updates]))
    const updated = markPastEventsFinished(eventsRef.current.map((event) => {
      const updates = updateMap.get(event.id)
      return updates ? { ...event, ...updates, updated_at: new Date().toISOString() } : event
    }))
    await saveEvents(updated)
    items.forEach((item) => {
      const event = updated.find((candidate) => candidate.id === item.id)
      if (event) void recordLocalUpsert("events", event)
    })
  }, [eventsRef, saveEvents])

  const deleteEvent = useCallback(async (id: string) => {
    const updated = eventsRef.current.filter((event) => event.id !== id)
    await saveEvents(updated)
    void recordLocalSoftDelete("events", id)
  }, [eventsRef, saveEvents])

  const restoreEvent = useCallback(async (event: CalendarEvent) => {
    const exists = eventsRef.current.some((e) => e.id === event.id)
    if (exists) return
    const restored = { ...event, deleted_at: null, updated_at: new Date().toISOString() }
    const updated = [...eventsRef.current, restored]
    await saveEvents(updated)
    void recordLocalUpsert("events", restored)
  }, [eventsRef, saveEvents])

  const deleteEvents = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids)
    const updated = eventsRef.current.filter((event) => !idSet.has(event.id))
    await saveEvents(updated)
    ids.forEach((id) => void recordLocalSoftDelete("events", id))
  }, [eventsRef, saveEvents])

  const restoreEvents = useCallback(async (eventsToRestore: CalendarEvent[]) => {
    const existingIds = new Set(eventsRef.current.map((e) => e.id))
    const newEvents = eventsToRestore.filter((e) => !existingIds.has(e.id))
    if (newEvents.length === 0) return
    const restoredEvents = newEvents.map((event) => ({ ...event, deleted_at: null, updated_at: new Date().toISOString() }))
    const updated = [...eventsRef.current, ...restoredEvents]
    await saveEvents(updated)
    restoredEvents.forEach((event) => void recordLocalUpsert("events", event))
  }, [eventsRef, saveEvents])

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
        return updates ? { ...event, ...updates, updated_at: new Date().toISOString() } : event
      }))
    await saveEvents(updated)
    items.forEach((item) => {
      const event = updated.find((candidate) => candidate.id === item.id)
      if (event) void recordLocalUpsert("events", event)
    })
    ids.forEach((id) => void recordLocalSoftDelete("events", id))
  }, [eventsRef, saveEvents])

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
      updated_at: createdAt,
    }))
    const updated = markPastEventsFinished([
      ...eventsRef.current.map((event) => {
        const updates = updateMap.get(event.id)
        return updates ? { ...event, ...updates, updated_at: createdAt } : event
      }),
      ...newEvents,
    ])
    await saveEvents(updated)
    itemsToUpdate.forEach((item) => {
      const event = updated.find((candidate) => candidate.id === item.id)
      if (event) void recordLocalUpsert("events", event)
    })
    newEvents.forEach((event) => void recordLocalUpsert("events", event))
    return newEvents
  }, [eventsRef, saveEvents])

  useEffect(() => {
    const markFinished = () => {
      const updated = markPastEventsFinished(eventsRef.current)
      if (updated !== eventsRef.current) {
        void saveEvents(updated)
        // Sync the isFinished/finishedAt changes to the remote so other
        // devices pick up the auto-finished status.
        updated.forEach((event, i) => {
          if (event !== eventsRef.current[i]) {
            void recordLocalUpsert("events", event)
          }
        })
      }
    }

    markFinished()
    const interval = window.setInterval(markFinished, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [eventsRef, saveEvents])

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
    refresh,
  }
}
