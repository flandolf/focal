import type { LucideIcon } from "lucide-react"
import {
  BookOpen, Languages, Library, Calculator, ChartNoAxesColumn,
  FlaskConical, Atom, Dna, Brain, Landmark, Map, TrendingUp,
  BriefcaseBusiness, Folder,
} from "lucide-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/utils"

export const PROJECT_ICONS: Record<string, LucideIcon> = {
  eng: BookOpen,
  "eng-lang": Languages,
  lit: Library,
  mm: Calculator,
  sm: Calculator,
  gm: ChartNoAxesColumn,
  chem: FlaskConical,
  phys: Atom,
  bio: Dna,
  psych: Brain,
  hist: Landmark,
  geo: Map,
  econ: TrendingUp,
  bm: BriefcaseBusiness,
}

export function getProjectIcon(subjectId?: string): LucideIcon {
  if (subjectId && PROJECT_ICONS[subjectId]) return PROJECT_ICONS[subjectId]
  return Folder
}

export function notifyProjectActionError(message: string, error: unknown) {
  toast.error(`${message}: ${getErrorMessage(error)}`)
}

