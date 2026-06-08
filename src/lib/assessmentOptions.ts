import type { DeadlineType, Unit } from "@/lib/types"

export const ASSESSMENT_ICONS = [
  "📁", "📂", "🗂️", "📄", "📝", "✏️", "🎨", "📊",
  "📈", "🗓️", "📅", "✅", "🔥", "⭐", "💡", "🚀",
  "🎯", "📋", "📌", "🔖", "🏗️", "🧩", "🎮", "🖥️",
  "📱", "🌐", "📚", "🎓", "🏆", "🎵", "🎬", "📸",
] as const

export const ASSESSMENT_TYPES: { value: DeadlineType; label: string; icon: string }[] = [
  { value: "sac", label: "SAC", icon: "📝" },
  { value: "exam", label: "Exam", icon: "📅" },
  { value: "assignment", label: "Assignment", icon: "📋" },
]

export const VCE_UNITS: { value: Unit; label: string }[] = [
  { value: "1", label: "Unit 1" },
  { value: "2", label: "Unit 2" },
  { value: "3", label: "Unit 3" },
  { value: "4", label: "Unit 4" },
]
