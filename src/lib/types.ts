export type DeadlineType = "sac" | "exam" | "assignment" | "gat";

export type FileTag = "sac" | "notes" | "past-paper" | "exam" | "resource" | "other";

export type Unit = "1" | "2" | "3" | "4";

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
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: number;
  extension: string;
  tag?: FileTag;
  subfolder?: string;
}
