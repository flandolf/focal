import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Project } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export function sortProjectsByDeadline(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0
    if (!a.deadline) return 1
    if (!b.deadline) return -1
    
    const dateA = new Date(a.deadline).getTime()
    const dateB = new Date(b.deadline).getTime()
    
    const now = Date.now()
    const aOverdue = dateA < now
    const bOverdue = dateB < now
    
    if (aOverdue && !bOverdue) return -1
    if (!aOverdue && bOverdue) return 1
    
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