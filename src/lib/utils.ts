import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Project, DeadlineType, EventType, StudySession, Subject } from "@/lib/types"
import { VCE_SUBJECTS } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getSubjectById(id?: string): Subject | undefined {
  if (!id) return undefined
  const builtin = VCE_SUBJECTS.find((s) => s.id === id)
  if (builtin) return builtin
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("focal-custom-subjects")
    if (stored) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const customs: Subject[] = JSON.parse(stored)
        const found = customs.find((s) => s.id === id)
        if (found) return found
      } catch {
        // ignore
      }
    }
  }
  return undefined
}

export function getDeadlineTypeInfo(type?: DeadlineType): { icon: string; label: string; color: string } {
  switch (type) {
    case "gat":
      return { icon: "🎯", label: "GAT", color: "#9333EA" }
    case "sac":
      return { icon: "📝", label: "SAC", color: "#EA580C" }
    case "exam":
      return { icon: "📅", label: "Exam", color: "#DC2626" }
    case "assignment":
      return { icon: "📋", label: "Assignment", color: "#2563EB" }
    default:
      return { icon: "📌", label: "Deadline", color: "#6B7280" }
  }
}

export function getEventTypeInfo(type?: EventType): { icon: string; label: string; color: string } {
  if (type === "event") {
    return { icon: "📍", label: "Event", color: "#0D9488" }
  }
  return getDeadlineTypeInfo(type)
}

export function getSessionSubjectIds(session: StudySession, project?: Project): string[] {
  if (session.subjectIds.length > 0) return session.subjectIds
  return project?.subjectId ? [project.subjectId] : []
}

export function formatDeadline(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

  if (days < 0) return "Overdue"
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days <= 7) return `${days} days`
  return date.toLocaleDateString()
}

export function isOverdue(dateString: string): boolean {
  const date = new Date(dateString)
  const now = new Date()
  return date.getTime() < now.getTime()
}

const DEADLINE_TYPE_PRIORITY: Record<DeadlineType, number> = {
  gat: 0,
  sac: 1,
  exam: 2,
  assignment: 3,
}

export function sortProjectsByDeadline(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const now = Date.now()
    
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    
    const dateA = new Date(a.deadline).getTime()
    const dateB = new Date(b.deadline).getTime()
    
    const aOverdue = dateA < now
    const bOverdue = dateB < now
    
    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1
    
    const typeA = a.deadlineType ? DEADLINE_TYPE_PRIORITY[a.deadlineType] ?? 4 : 4
    const typeB = b.deadlineType ? DEADLINE_TYPE_PRIORITY[b.deadlineType] ?? 4 : 4
    
    if (typeA !== typeB) return typeA - typeB
    
    return dateA - dateB
  })
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function sanitiseFolderName(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim()
}
