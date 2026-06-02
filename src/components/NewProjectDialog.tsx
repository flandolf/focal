import { useState } from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
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
import { VCE_SUBJECTS, type DeadlineType, type Unit, type Subject } from "@/lib/types"

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

interface NewProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    name: string
    description?: string
    icon?: string
    deadline?: string
    subjectId?: string
    unit?: Unit
    deadlineType?: DeadlineType
    gatDate?: string
    examDate?: string
  }) => void
  customSubjects?: Subject[]
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onSubmit,
  customSubjects = [],
}: NewProjectDialogProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [icon, setIcon] = useState("📁")
  const [deadline, setDeadline] = useState<Date | undefined>(undefined)
  const [gatDate, setGatDate] = useState<Date | undefined>(undefined)
  const [examDate, setExamDate] = useState<Date | undefined>(undefined)
  const [subjectId, setSubjectId] = useState<string>("")
  const [unit, setUnit] = useState<Unit | "">("")
  const [deadlineType, setDeadlineType] = useState<DeadlineType | "">("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: String(name.trim()),
      description: description.trim() ? String(description.trim()) : undefined,
      icon: String(icon),
      deadline: deadline ? String(format(deadline, "yyyy-MM-dd")) : undefined,
      subjectId: subjectId ? String(subjectId) : undefined,
      unit: unit || undefined,
      deadlineType: deadlineType || undefined,
      gatDate: gatDate ? String(format(gatDate, "yyyy-MM-dd")) : undefined,
      examDate: examDate ? String(format(examDate, "yyyy-MM-dd")) : undefined,
    })
    setName("")
    setDescription("")
    setIcon("📁")
    setDeadline(undefined)
    setGatDate(undefined)
    setExamDate(undefined)
    setSubjectId("")
    setUnit("")
    setDeadlineType("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Assessment</DialogTitle>
          <DialogDescription>
            Create a SAC, test, exam, or assessment folder to organise your files.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g. Methods SAC 2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Optional — brief description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Assessment Type</label>
              <div className="flex gap-1.5">
                {DEADLINE_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setDeadlineType(deadlineType === type.value ? "" : type.value)}
                    className={cn(
                      "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
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
                    {deadline ? format(deadline, "MMM d") : "Pick date"}
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
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                      {gatDate ? format(gatDate, "MMM d") : "Pick date"}
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
                      {examDate ? format(examDate, "MMM d") : "Pick date"}
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
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Icon</label>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setIcon(e)}
                    className={`text-base w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                      icon === e ? "bg-accent ring-2 ring-ring" : "hover:bg-accent/50"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
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
              Create Assessment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
