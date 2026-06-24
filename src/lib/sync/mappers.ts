/**
 * Bidirectional mappers between local domain objects and Supabase row shapes.
 * Each sync table has a `toRow` (local → remote) and `fromRow` (remote → local)
 * pair. Also contains small type guards and ISO-date helpers used by the sync
 * engine.
 */
import { parseCalendarEventSource, parseNotionSource } from "@/lib/utils"
import type { CalendarEvent, ConfidenceScore, EventType, Project, StudySession, StudySessionStatus, Subject, TimetableConfig, TimetableDayLabel, Unit, UserSettings } from "@/lib/types"
import type {
  CustomSubjectRow,
  EventRow,
  HiddenSubjectRow,
  LocalEvent,
  LocalProject,
  LocalStudySession,
  ProjectRow,
  StudySessionRow,
  TimetableConfigRow,
  UserSettingsRow,
} from "@/lib/sync/types"

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function ensureUpdatedAt<T extends { created_at: string; updated_at?: string }>(item: T): T & { updated_at: string } {
  return { ...item, updated_at: item.updated_at ?? item.created_at ?? new Date().toISOString() }
}

export function compareIso(a?: string | null, b?: string | null): number {
  const aMs = a ? new Date(a).getTime() : 0
  const bMs = b ? new Date(b).getTime() : 0
  return (Number.isFinite(aMs) ? aMs : 0) - (Number.isFinite(bMs) ? bMs : 0)
}

export function projectToRow(project: Project, userId: string, deviceId: string): ProjectRow {
  const synced = ensureUpdatedAt(project)
  return {
    id: synced.id,
    user_id: userId,
    name: synced.name,
    description: synced.description ?? null,
    icon: synced.icon ?? null,
    deadline: synced.deadline ?? null,
    folder_path: synced.folder_path,
    subject_id: synced.subjectId ?? null,
    unit: synced.unit ?? null,
    deadline_type: synced.deadlineType ?? null,
    exam_date: synced.examDate ?? null,
    is_favorite: synced.isFavorite ?? false,
    is_archived: synced.isArchived ?? false,
    is_finished: synced.isFinished ?? false,
    custom_subfolders: synced.customSubfolders ?? null,
    created_at: synced.created_at,
    updated_at: synced.updated_at,
    deleted_at: synced.deleted_at ?? null,
    last_modified_device_id: deviceId,
  }
}

export function rowToProject(row: ProjectRow): LocalProject {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    deadline: row.deadline ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    last_modified_device_id: row.last_modified_device_id,
    folder_path: row.folder_path,
    subjectId: row.subject_id ?? undefined,
    unit: isUnit(row.unit) ? row.unit : undefined,
    deadlineType: row.deadline_type === "sac" || row.deadline_type === "exam" || row.deadline_type === "assignment" ? row.deadline_type : undefined,
    examDate: row.exam_date ?? undefined,
    isFavorite: row.is_favorite,
    isArchived: row.is_archived,
    isFinished: row.is_finished,
    customSubfolders: Array.isArray(row.custom_subfolders) ? row.custom_subfolders : undefined,
  }
}

export function eventToRow(event: CalendarEvent, userId: string, deviceId: string): EventRow {
  const synced = ensureUpdatedAt(event)
  return {
    id: synced.id,
    user_id: userId,
    title: synced.title,
    description: synced.description ?? null,
    start_time: synced.startTime,
    end_time: synced.endTime ?? null,
    event_type: synced.eventType,
    subject_id: synced.subjectId ?? null,
    location: synced.location ?? null,
    is_finished: synced.isFinished ?? false,
    finished_at: synced.finishedAt ?? null,
    source: (synced.source ?? null) as EventRow["source"],
    created_at: synced.created_at,
    updated_at: synced.updated_at,
    deleted_at: synced.deleted_at ?? null,
    last_modified_device_id: deviceId,
  }
}

export function rowToEvent(row: EventRow): LocalEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    eventType: isEventType(row.event_type) ? row.event_type : "event",
    subjectId: row.subject_id ?? undefined,
    location: row.location ?? undefined,
    isFinished: row.is_finished,
    finishedAt: row.finished_at ?? undefined,
    source: parseCalendarEventSource(row.source),
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    last_modified_device_id: row.last_modified_device_id,
  }
}

export function sessionToRow(session: StudySession, userId: string, deviceId: string): StudySessionRow {
  const synced = ensureUpdatedAt(session)
  return {
    id: synced.id,
    user_id: userId,
    project_id: synced.projectId ?? null,
    subject_ids: synced.subjectIds,
    title: synced.title,
    description: synced.description ?? null,
    start_time: synced.startTime,
    end_time: synced.endTime,
    status: synced.status,
    topics: synced.topics ?? null,
    notes: synced.notes ?? null,
    confidence: synced.confidence ?? null,
    blockers: synced.blockers ?? null,
    next_action: synced.nextAction ?? null,
    active_durations: synced.activeDurations ?? null,
    completed_at: synced.completedAt ?? null,
    source: (synced.source ?? null) as StudySessionRow["source"],
    created_at: synced.created_at,
    updated_at: synced.updated_at,
    deleted_at: synced.deleted_at ?? null,
    last_modified_device_id: deviceId,
  }
}

export function rowToSession(row: StudySessionRow): LocalStudySession {
  return {
    id: row.id,
    projectId: row.project_id ?? undefined,
    subjectIds: row.subject_ids,
    title: row.title,
    description: row.description ?? undefined,
    startTime: row.start_time,
    endTime: row.end_time,
    status: isStudySessionStatus(row.status) ? row.status : "planned",
    topics: Array.isArray(row.topics) ? row.topics.filter((topic): topic is string => typeof topic === "string") : undefined,
    notes: row.notes ?? undefined,
    confidence: isConfidenceScore(row.confidence) ? row.confidence : undefined,
    blockers: row.blockers ?? undefined,
    nextAction: row.next_action ?? undefined,
    activeDurations: isActiveDurations(row.active_durations) ? row.active_durations : undefined,
    completedAt: row.completed_at ?? undefined,
    source: parseNotionSource(row.source),
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    last_modified_device_id: row.last_modified_device_id,
  }
}

export function subjectToRow(subject: Subject, userId: string, deviceId: string): Omit<CustomSubjectRow, "id"> & { id?: string } {
  const now = new Date().toISOString()
  return {
    user_id: userId,
    subject_key: subject.id,
    name: subject.name,
    short_code: subject.shortCode,
    color: subject.color,
    icon: subject.icon ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    last_modified_device_id: deviceId,
  }
}

export function rowToSubject(row: CustomSubjectRow): Subject {
  return {
    id: row.subject_key,
    name: row.name,
    shortCode: row.short_code,
    color: row.color,
    icon: row.icon ?? undefined,
  }
}

export function hiddenSubjectToRow(subjectId: string, userId: string, deviceId: string): Omit<HiddenSubjectRow, "id"> & { id?: string } {
  const now = new Date().toISOString()
  return {
    user_id: userId,
    subject_id: subjectId,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    last_modified_device_id: deviceId,
  }
}

export function timetableConfigToRow(config: TimetableConfig, userId: string, deviceId: string): TimetableConfigRow {
  const now = new Date().toISOString()
  return {
    id: userId,
    user_id: userId,
    config,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    last_modified_device_id: deviceId,
  }
}

export function rowToTimetableConfig(row: TimetableConfigRow): TimetableConfig {
  const cycleLength =
    typeof row.config.cycleLength === "number" && row.config.cycleLength >= 1 && row.config.cycleLength <= 60
      ? row.config.cycleLength
      : 10
  return {
    enabled: row.config.enabled,
    day1Starts: row.config.day1Starts,
    holidays: Array.isArray(row.config.holidays) ? row.config.holidays : [],
    entries: Array.isArray(row.config.entries) ? row.config.entries : [],
    cycleLength,
    dayToWeekday: Array.isArray(row.config.dayToWeekday) ? row.config.dayToWeekday : undefined,
    weekendTimetables: row.config.weekendTimetables === true,
    currentDayOverride: isDayLabelInRange(row.config.currentDayOverride, cycleLength)
      ? row.config.currentDayOverride
      : null,
  }
}

export function userSettingsToRow(settings: UserSettings, userId: string, deviceId: string): UserSettingsRow {
  const now = new Date().toISOString()
  return {
    id: userId,
    user_id: userId,
    settings,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    last_modified_device_id: deviceId,
  }
}

export function rowToUserSettings(row: UserSettingsRow): UserSettings {
  return {
    openrouter_api_key: row.settings.openrouter_api_key ?? "",
    openrouter_model: row.settings.openrouter_model ?? "openai/gpt-4o-mini",
    reasoning_effort: row.settings.reasoning_effort ?? "medium",
    reasoning_max_tokens: row.settings.reasoning_max_tokens ?? 8000,
    reasoning_exclude: row.settings.reasoning_exclude ?? false,
    notion_token: row.settings.notion_token ?? "",
    notion_data_source_id: row.settings.notion_data_source_id ?? "",
    notion_title_property: row.settings.notion_title_property ?? "Name",
    notion_date_property: row.settings.notion_date_property ?? "Date",
    notion_type_property: row.settings.notion_type_property ?? "Type",
    notion_completed_property: row.settings.notion_completed_property ?? "Complete",
    notion_subject_property: row.settings.notion_subject_property ?? "Subject",
    provider: row.settings.provider,
    ollama_base_url: row.settings.ollama_base_url,
    ollama_model: row.settings.ollama_model,
    assistant_personality: row.settings.assistant_personality,
    assistant_custom_instructions: row.settings.assistant_custom_instructions,
    study_planning_preferences: row.settings.study_planning_preferences,
  }
}

function isUnit(value: unknown): value is Unit {
  return value === "1" || value === "2" || value === "3" || value === "4"
}

function isEventType(value: unknown): value is EventType {
  return value === "sac" || value === "exam" || value === "assignment" || value === "event" || value === "homework" || value === "other" || value === "practice-sac"
}

function isStudySessionStatus(value: unknown): value is StudySessionStatus {
  return value === "planned" || value === "in-progress" || value === "completed"
}

function isConfidenceScore(value: unknown): value is ConfidenceScore {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

function isDayLabelInRange(value: unknown, cycleLength: number): value is TimetableDayLabel {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= cycleLength
}

function isActiveDurations(value: unknown): value is { start: string; end: string }[] {
  return Array.isArray(value) && value.every((item) => {
    const record = item as Record<string, unknown>
    return typeof record.start === "string" && typeof record.end === "string"
  })
}

