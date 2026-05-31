export type DeadlineType = "sac" | "exam" | "assignment" | "gat";

export type EventType = DeadlineType | "event";

export type FileTag = "sac" | "notes" | "past-paper" | "exam" | "resource" | "other";

export type Unit = "1" | "2" | "3" | "4";

export type StudySessionStatus = "planned" | "in-progress" | "completed";

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
  created_at: string;
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
  created_at: string;
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
  { id: "mm", name: "Maths Methods", shortCode: "MCM", color: "#2563EB", icon: "📐" },
  { id: "sm", name: "Specialist Maths", shortCode: "SME", color: "#2563EB", icon: "🧮" },
  { id: "fm", name: "Further Maths", shortCode: "FME", color: "#2563EB", icon: "📊" },
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

export const SUBJECT_FOLDER_TEMPLATES: Record<string, string[]> = {
  "eng": ["Essays", "Texts", "Writing Practice", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "eng-lang": ["Language Analysis", "Written & Spoken", "SACs", "Notes", "Vocabulary", "Past-Papers", "Exam-Revision"],
  "lit": ["Primary Texts", "Critical Analysis", "Essay Plans", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "mm": ["Unit 1 Notes", "Unit 2 Notes", "Formulas", "Practice Problems", "SACs", "Past-Papers", "Exam-Revision"],
  "sm": ["Unit 3 Notes", "Unit 4 Notes", "Proofs", "Challenge Problems", "SACs", "Past-Papers", "Exam-Revision"],
  "fm": ["Statistics", "Financial Math", "Practice Sets", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "chem": ["Experiment Reports", "Equations", "Electron Configurations", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "phys": ["Experiment Reports", "Formulas", "Problem Sets", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "bio": ["Practicals", "Diagrams", "Key Concepts", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "psych": ["Research Studies", "Theories", "Case Studies", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "hist": ["Primary Sources", "Essay Plans", "Timelines", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "geo": ["Case Studies", "Fieldwork", "Maps & Diagrams", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "econ": ["Case Studies", "Data & Graphs", "Models", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
  "bm": ["Reports", "Case Studies", "Strategies", "SACs", "Notes", "Past-Papers", "Exam-Revision"],
};

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
  gatDate?: string;
  examDate?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  isFinished?: boolean;
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
