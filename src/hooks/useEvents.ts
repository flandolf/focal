import { useCallback, useEffect } from "react"
import type { CalendarEvent, EventType } from "@/lib/types"
import { generateId } from "@/lib/utils"
import { usePersistedData } from "@/lib/hooks/usePersistedData"
import { useLatestRef } from "@/lib/hooks/useLatestRef"
import { recordLocalSoftDelete, recordLocalUpsert } from "@/lib/sync/engine"

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
        bodyHash: typeof source.bodyHash === "string" ? source.bodyHash : undefined,
      }
      : undefined,
    created_at: typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
    deleted_at: typeof obj.deleted_at === "string" ? obj.deleted_at : null,
    last_modified_device_id: typeof obj.last_modified_device_id === "string" ? obj.last_modified_device_id : null,
  }
  return event
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
