export type DeadlineType = "sac" | "exam" | "assignment";

export type EventType = DeadlineType | "event" | "homework" | "other" | "practice-sac";

export type FileTag = "sac" | "notes" | "past-paper" | "exam" | "resource" | "other";

export type Unit = "1" | "2" | "3" | "4";

export type StudySessionStatus = "planned" | "in-progress" | "completed";

export type ConfidenceScore = 1 | 2 | 3 | 4 | 5;

export interface StudySession {
  id: string;
  projectId?: string;
  subjectIds: string[];
  title: string;
  description?: string;
  startTime: string; // ISO date
  endTime: string; // ISO date
  status: StudySessionStatus;
  topics?: string[]; // Topics covered in the session
  notes?: string;
  confidence?: ConfidenceScore;
  blockers?: string;
  nextAction?: string;
  activeDurations?: { start: string; end: string }[]; // For merged sessions: individual active periods within startTime-endTime span
  completedAt?: string;
  source?: {
    type: "notion";
    id: string;
    url?: string;
    lastEditedTime?: string;
    kind?: "event" | "session";
    bodyHash?: string;
  };
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  last_modified_device_id?: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO date
  endTime?: string; // ISO date
  eventType: EventType;
  subjectId?: string;
  location?: string;
  isFinished?: boolean;
  finishedAt?: string;
  source?: {
    type: "notion";
    id: string;
    url?: string;
    lastEditedTime?: string;
    kind?: "event" | "session";
    bodyHash?: string;
  };
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  last_modified_device_id?: string | null;
}

export interface Subject {
  id: string;
  name: string;
  shortCode: string;
  color: string;
  icon?: string;
}

export const VCE_SUBJECTS: Subject[] = [
  { id: "eng", name: "English", shortCode: "ENG", color: "#E11D48", icon: "📖" },
  { id: "eng-lang", name: "English Language", shortCode: "ELG", color: "#E11D48", icon: "📖" },
  { id: "lit", name: "Literature", shortCode: "LIT", color: "#E11D48", icon: "📚" },
  { id: "mm", name: "Mathematical Methods", shortCode: "MCM", color: "#2563EB", icon: "📐" },
  { id: "sm", name: "Specialist Mathematics", shortCode: "SME", color: "#2563EB", icon: "🧮" },
  { id: "gm", name: "General Mathematics", shortCode: "GMM", color: "#2563EB", icon: "📊" },
  { id: "csl", name: "Chinese Second Language", shortCode: "CSL", color: "#DC2626", icon: "🀄" },
  { id: "pe", name: "Physical Education", shortCode: "PED", color: "#16A34A", icon: "🏃" },
  { id: "chem", name: "Chemistry", shortCode: "CHE", color: "#059669", icon: "🧪" },
  { id: "phys", name: "Physics", shortCode: "PHY", color: "#7C3AED", icon: "⚛️" },
  { id: "bio", name: "Biology", shortCode: "BIO", color: "#16A34A", icon: "🧬" },
  { id: "psych", name: "Psychology", shortCode: "PSY", color: "#EA580C", icon: "🧠" },
  { id: "hist", name: "History", shortCode: "HIS", color: "#A16207", icon: "🏛️" },
  { id: "geo", name: "Geography", shortCode: "GEO", color: "#0D9488", icon: "🌍" },
  { id: "econ", name: "Economics", shortCode: "ECO", color: "#DC2626", icon: "📈" },
  { id: "bm", name: "Business Management", shortCode: "BM", color: "#4F46E5", icon: "💼" },

];

export const DEFAULT_SUBFOLDERS = ["SACs", "Notes", "Past-Papers", "Exam-Revision", "Resources"];

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  deadline?: string;
  created_at: string;
  folder_path: string;
  subjectId?: string;
  unit?: Unit;
  deadlineType?: DeadlineType;
  examDate?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  isFinished?: boolean;
  customSubfolders?: string[];
  updated_at?: string;
  deleted_at?: string | null;
  last_modified_device_id?: string | null;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: number;
  extension: string;
  tag?: FileTag; // Legacy field for backward compatibility
  tags?: FileTag[];
  subfolder?: string;
  isFavorite?: boolean;
}

export interface SearchResult {
  file: FileInfo;
  projectFolder: string;
}

// --- Timetable ---

export type TimetableDayLabel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface TimetablePeriod {
  period: string
  subject: string
  location?: string
  startTime: string // HH:mm
  endTime: string   // HH:mm
}

export interface TimetableEntry {
  dayLabel: TimetableDayLabel // 1–10
  periods: TimetablePeriod[]
}

export interface SchoolHoliday {
  name: string
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

export interface UserSettings {
  openrouter_api_key: string
  openrouter_model: string
  reasoning_effort: string
  reasoning_max_tokens: number
  reasoning_exclude: boolean
  notion_token: string
  notion_data_source_id: string
  notion_title_property: string
  notion_date_property: string
  notion_type_property: string
  notion_completed_property: string
  notion_subject_property: string
}

export interface TimetableViewSettings {
  /** Show all 10 days at once instead of 5-day blocks. */
  showAllDays: boolean
  /** Show location badges on period rows. */
  showLocations: boolean
  /** Show break entries (Recess, Lunch, etc.). */
  showBreaks: boolean
  /** Use 24-hour time format instead of 12-hour. */
  use24Hour: boolean
  /** Manual week block override (null = auto-detect from current day). */
  manualBlock: 1 | 2 | null
  /** Day labels to hide from the view display. */
  hiddenDays: number[]
}

/** Relaxed timetable config for localStorage persistence. Use TimetableEntry from types.ts for runtime access. */
export interface TimetableConfig {
  enabled: boolean
  day1Starts: string // YYYY-MM-DD — the first day of the cycle
  holidays: SchoolHoliday[]
  entries: TimetableEntry[]
  /** Manual override of the current day label (1–10). When set, takes precedence over the date-based calculation. */
  currentDayOverride?: TimetableDayLabel | null
  /** View-level display preferences. */
  viewSettings?: TimetableViewSettings
}

export type PriorityItemKind =
  | "overdue-project"
  | "upcoming-assessment"
  | "planned-session"
  | "plan-prep"
  | "weak-topic";

export type PriorityUrgency = "critical" | "high" | "medium" | "low";

export interface PriorityItem {
  id: string;
  kind: PriorityItemKind;
  title: string;
  reason: string;
  urgency: PriorityUrgency;
  subjectIds: string[];
  projectId?: string;
  eventId?: string;
  sessionId?: string;
  action: string;
}
