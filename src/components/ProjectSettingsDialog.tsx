import { useState, useEffect } from "react"
import { format } from "date-fns"
import { CalendarIcon, Star, Archive, CheckCircle2 } from "lucide-react"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { VCE_SUBJECTS, type Project, type DeadlineType, type Unit, type Subject } from "@/lib/types"

const EMOJIS = [
  "📁", "📂", "🗂️", "📄", "📝", "✏️", "🎨", "📊",
  "📈", "🗓️", "📅", "✅", "🔥", "⭐", "💡", "🚀",
  "🎯", "📋", "📌", "🔖", "🏗️", "🧩", "🎮", "🖥️",
  "📱", "🌐", "📚", "🎓", "🏆", "🎵", "🎬", "📸",
]

const DEADLINE_TYPES: { value: DeadlineType; label: string; icon: string }[] = [
  { value: "sac", label: "SAC", icon: "📝" },
  { value: "exam", label: "Exam", icon: "📅" },
  { value: "assignment", label: "Assignment", icon: "📋" },
  { value: "gat", label: "GAT", icon: "🎯" },
]

const UNITS: { value: Unit; label: string }[] = [
  { value: "1", label: "Unit 1" },
  { value: "2", label: "Unit 2" },
  { value: "3", label: "Unit 3" },
  { value: "4", label: "Unit 4" },
]

interface ProjectSettingsDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (id: string, data: {
    name: string
    description?: string
    icon?: string
    deadline?: string
    subjectId?: string
    unit?: Unit
    deadlineType?: DeadlineType
    gatDate?: string
    examDate?: string
    isFavorite?: boolean
    isArchived?: boolean
    isFinished?: boolean
  }) => void
  customSubjects?: Subject[]
}

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  onSubmit,
  customSubjects = [],
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? "")
  const [icon, setIcon] = useState(project.icon ?? "📁")
  const [deadline, setDeadline] = useState<Date | undefined>(
    project.deadline ? new Date(project.deadline) : undefined
  )
  const [gatDate, setGatDate] = useState<Date | undefined>(
    project.gatDate ? new Date(project.gatDate) : undefined
  )
  const [examDate, setExamDate] = useState<Date | undefined>(
    project.examDate ? new Date(project.examDate) : undefined
  )
  const [subjectId, setSubjectId] = useState(project.subjectId ?? "")
  const [unit, setUnit] = useState<Unit | "">(project.unit ?? "")
  const [deadlineType, setDeadlineType] = useState<DeadlineType | "">(project.deadlineType ?? "")
  const [isFavorite, setIsFavorite] = useState(project.isFavorite ?? false)
  const [isArchived, setIsArchived] = useState(project.isArchived ?? false)
  const [isFinished, setIsFinished] = useState(project.isFinished ?? false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(project.name)
     
    setDescription(project.description ?? "")
     
    setIcon(project.icon ?? "📁")
     
    setDeadline(project.deadline ? new Date(project.deadline) : undefined)
     
    setGatDate(project.gatDate ? new Date(project.gatDate) : undefined)
     
    setExamDate(project.examDate ? new Date(project.examDate) : undefined)
     
    setSubjectId(project.subjectId ?? "")
     
    setUnit(project.unit ?? "")
     
    setDeadlineType(project.deadlineType ?? "")
    setIsFavorite(project.isFavorite ?? false)
    setIsArchived(project.isArchived ?? false)
    setIsFinished(project.isFinished ?? false)
  }, [project])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(String(project.id), {
      name: String(name.trim()),
      description: description.trim() ? String(description.trim()) : undefined,
      icon: String(icon),
      deadline: deadline ? String(format(deadline, "yyyy-MM-dd")) : undefined,
      subjectId: subjectId ? String(subjectId) : undefined,
      unit: unit || undefined,
      deadlineType: deadlineType || undefined,
      gatDate: gatDate ? String(format(gatDate, "yyyy-MM-dd")) : undefined,
      examDate: examDate ? String(format(examDate, "yyyy-MM-dd")) : undefined,
      isFavorite,
      isArchived,
      isFinished,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Assessment Details</DialogTitle>
          <DialogDescription>
            Edit the subject, date, files label, and status for this assessment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Brief description of the assessment"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subject</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  <option value="">No subject</option>
                  {VCE_SUBJECTS.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.icon} {subject.name}
                    </option>
                  ))}
                  {customSubjects.length > 0 && (
                    <option disabled>──────────</option>
                  )}
                  {customSubjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.icon} {subject.name} (custom)
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Unit</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Unit | "")}
                >
                  <option value="">None</option>
                  {UNITS.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Assessment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {DEADLINE_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setDeadlineType(deadlineType === type.value ? "" : type.value)}
                      className={cn(
                        "py-2 rounded-lg text-sm font-medium transition-colors",
                        deadlineType === type.value
                          ? "bg-accent ring-2 ring-ring"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {type.icon} {type.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Assessment Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !deadline && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {deadline ? format(deadline, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={deadline}
                      onSelect={setDeadline}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
                {deadline && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto px-2 py-1 text-xs text-muted-foreground"
                    onClick={() => setDeadline(undefined)}
                  >
                    Clear deadline
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">GAT Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !gatDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {gatDate ? format(gatDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={gatDate}
                      onSelect={setGatDate}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
                {gatDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto px-2 py-1 text-xs text-muted-foreground"
                    onClick={() => setGatDate(undefined)}
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Exam Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !examDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {examDate ? format(examDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={examDate}
                      onSelect={setExamDate}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
                {examDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-auto px-2 py-1 text-xs text-muted-foreground"
                    onClick={() => setExamDate(undefined)}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setIcon(e)}
                    className={`text-base w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                      icon === e ? "bg-accent ring-2 ring-ring" : "hover:bg-accent/50"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFavorite(!isFavorite)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm border transition-colors ${
                  isFavorite
                    ? "bg-yellow-50 border-yellow-300 text-yellow-700 dark:bg-yellow-950/20 dark:border-yellow-700 dark:text-yellow-400"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-yellow-400")} />
                Favorite
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFinished(!isFinished)
                  if (!isFinished) setIsArchived(false)
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm border transition-colors ${
                  isFinished
                    ? "bg-green-50 border-green-300 text-green-700 dark:bg-green-950/20 dark:border-green-700 dark:text-green-400"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <CheckCircle2 className={cn("h-3.5 w-3.5", isFinished && "text-green-500")} />
                Finished
              </button>
              <button
                type="button"
                onClick={() => setIsArchived(!isArchived)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm border transition-colors ${
                  isArchived
                    ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <Archive className="h-3.5 w-3.5" />
                Archived
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
