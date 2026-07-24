import { addDays, parseISO } from "date-fns"
import type { CalendarEvent, StudySession } from "@/lib/types"
import type { CreateStudySessionInput } from "@/lib/studySessions"

function shiftDate(value: string, days: number) {
  const date = parseISO(value)
  if (Number.isNaN(date.getTime())) throw new Error("Cannot repeat an item with an invalid date")
  return addDays(date, days).toISOString()
}

export function repeatCalendarEvent(
  event: CalendarEvent,
  days = 7,
): Omit<CalendarEvent, "id" | "created_at" | "updated_at" | "deleted_at" | "last_modified_device_id"> {
  return {
    title: event.title,
    description: event.description,
    startTime: shiftDate(event.startTime, days),
    endTime: event.endTime ? shiftDate(event.endTime, days) : undefined,
    eventType: event.eventType,
    subjectId: event.subjectId,
    location: event.location,
    isFinished: false,
  }
}

export function repeatStudySession(
  session: StudySession,
  days = 7,
): CreateStudySessionInput {
  const nextAction = session.reflection?.nextAction?.trim()
  return {
    projectId: session.projectId,
    subjectIds: [...session.subjectIds],
    title: nextAction?.length ? nextAction : session.title,
    description: session.description,
    topics: session.topics ? [...session.topics] : undefined,
    schedule: {
      blocks: session.schedule.blocks.map((block) => ({
        start: shiftDate(block.start, days),
        end: shiftDate(block.end, days),
      })),
    },
    execution: { state: "planned", intervals: [] },
    createdVia: "manual",
  }
}
