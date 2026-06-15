import type { LucideIcon } from "lucide-react"
import {
  BookOpen, Languages, Library, Calculator, ChartNoAxesColumn,
  FlaskConical, Atom, Dna, Brain, Landmark, Map, TrendingUp,
  BriefcaseBusiness, Folder,
} from "lucide-react"
import { toast } from "sonner"
import { cn, getErrorMessage as _getErrorMessage } from "@/lib/utils"

// TODO: Remove this shim after a Vite dev-server restart (cached modules still import from here).
export const getErrorMessage = _getErrorMessage

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

export const SEGMENTED_BUTTON_CLASS = "rounded-md px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
const SEGMENTED_ACTIVE_CLASS = "bg-background text-foreground font-medium shadow-sm"
const SEGMENTED_IDLE_CLASS = "text-muted-foreground hover:bg-background/40 hover:text-foreground"

export function getSegmentedButtonClassName(selected: boolean, className?: string) {
  return cn(
    SEGMENTED_BUTTON_CLASS,
    selected ? SEGMENTED_ACTIVE_CLASS : SEGMENTED_IDLE_CLASS,
    className,
  )
}

export const POPOVER_ITEM_BUTTON_CLASS = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"

export function notifyProjectActionError(message: string, error: unknown) {
  toast.error(`${message}: ${getErrorMessage(error)}`)
}

