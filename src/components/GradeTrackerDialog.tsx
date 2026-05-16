import { useState } from "react"
import { format } from "date-fns"
import { Plus, Trash2, CalendarIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import type { Project, GradeType, GradeEntry } from "@/lib/types"

const GRADE_TYPES: { value: GradeType; label: string; color: string }[] = [
  { value: "sac", label: "SAC", color: "#EA580C" },
  { value: "exam", label: "Exam", color: "#DC2626" },
  { value: "assignment", label: "Assignment", color: "#2563EB" },
  { value: "practice", label: "Practice", color: "#059669" },
]

interface GradeTrackerDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  grades: GradeEntry[]
  onAddGrade: (projectId: string, title: string, score: number, maxScore: number, weight: number, type: GradeType, date?: string, notes?: string) => Promise<void>
  onDeleteGrade: (id: string) => void
  getWeightedScore: (projectId: string, type?: GradeType) => number
}

export function GradeTrackerDialog({ project, open, onOpenChange, grades, onAddGrade, onDeleteGrade, getWeightedScore }: GradeTrackerDialogProps) {
  const projectGrades = grades.filter((g) => g.projectId === project.id)
  const overallScore = getWeightedScore(project.id)
  const sacScore = getWeightedScore(project.id, "sac")
  const examScore = getWeightedScore(project.id, "exam")

  const [title, setTitle] = useState("")
  const [score, setScore] = useState("")
  const [maxScore, setMaxScore] = useState("100")
  const [weight, setWeight] = useState("")
  const [gradeType, setGradeType] = useState<GradeType>("sac")
  const [gradeDate, setGradeDate] = useState<Date | undefined>(new Date())
  const [gradeNotes, setGradeNotes] = useState("")

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !score) return
    await onAddGrade(
      project.id,
      title.trim(),
      parseInt(score),
      parseInt(maxScore) || 100,
      parseInt(weight) || 0,
      gradeType,
      gradeDate ? format(gradeDate, "yyyy-MM-dd") : undefined,
      gradeNotes.trim() || undefined,
    )
    setTitle("")
    setScore("")
    setMaxScore("100")
    setWeight("")
    setGradeNotes("")
    setGradeDate(new Date())
  }

  const sortedGrades = [...projectGrades].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  const sacEntries = sortedGrades.filter((g) => g.type === "sac")
  const examEntries = sortedGrades.filter((g) => g.type === "exam")
  const otherEntries = sortedGrades.filter((g) => g.type !== "sac" && g.type !== "exam")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Grade Tracker</DialogTitle>
          <DialogDescription>
            Track your SAC, exam, and assignment scores for {project.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Overall</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5">{overallScore}%</p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">SACs</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5 text-orange-600 dark:text-orange-400">
                {sacScore}%
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Exams</p>
              <p className="text-xl font-semibold tabular-nums mt-0.5 text-red-600 dark:text-red-400">
                {examScore}%
              </p>
            </div>
          </div>

          <form onSubmit={handleAdd} className="space-y-3 border rounded-lg p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Title</label>
                <Input
                  placeholder="e.g. Unit 3 SAC 1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Type</label>
                <div className="flex gap-1">
                  {GRADE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setGradeType(gradeType === t.value ? "sac" : t.value)}
                      className={cn(
                        "flex-1 py-1.5 text-[10px] rounded-md font-medium transition-colors",
                        gradeType === t.value
                          ? "bg-accent ring-2 ring-ring"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Score</label>
                <Input
                  type="number"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="85"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Max</label>
                <Input
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Weight %</label>
                <Input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="25"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-8 text-xs",
                        !gradeDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {gradeDate ? format(gradeDate, "MMM d") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={gradeDate} onSelect={setGradeDate} autoFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium">Notes</label>
                <Input
                  value={gradeNotes}
                  onChange={(e) => setGradeNotes(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Optional"
                />
              </div>
            </div>

            <Button type="submit" size="sm" className="w-full gap-1.5" disabled={!title.trim() || !score}>
              <Plus className="h-3.5 w-3.5" />
              Add Grade
            </Button>
          </form>

          <ScrollArea className="h-48">
            <div className="space-y-3">
              {sacEntries.length > 0 && (
                <GradeSection title="SACs" entries={sacEntries} accentColor="#EA580C" onDelete={onDeleteGrade} />
              )}
              {examEntries.length > 0 && (
                <GradeSection title="Exams" entries={examEntries} accentColor="#DC2626" onDelete={onDeleteGrade} />
              )}
              {otherEntries.length > 0 && (
                <GradeSection title="Other" entries={otherEntries} accentColor="#6B7280" onDelete={onDeleteGrade} />
              )}
              {projectGrades.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No grades recorded yet. Add your first assessment above.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GradeSection({ title, entries, accentColor, onDelete }: {
  title: string
  entries: GradeEntry[]
  accentColor: string
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
      {entries.map((g) => {
        const pct = Math.round((g.score / g.maxScore) * 1000) / 10
        return (
          <div
            key={g.id}
            className="group flex items-center gap-2 px-2 py-1.5 rounded border border-border hover:bg-accent/30 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">{g.title}</span>
                {g.weight > 0 && (
                  <span className="text-[10px] text-muted-foreground">({g.weight}%)</span>
                )}
              </div>
              {g.notes && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{g.notes}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="text-xs font-mono tabular-nums"
                style={{ color: accentColor }}
              >
                {g.score}/{g.maxScore}
              </span>
              <div
                className="w-8 h-1.5 rounded-full bg-muted overflow-hidden"
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: accentColor,
                    opacity: pct >= 80 ? 1 : pct >= 60 ? 0.7 : 0.5,
                  }}
                />
              </div>
              <span className="text-xs font-mono tabular-nums font-medium w-9 text-right">
                {pct}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => onDelete(g.id)}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
