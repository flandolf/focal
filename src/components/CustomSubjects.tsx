import { useState } from "react"
import { Plus, X, Palette, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { VCE_SUBJECTS } from "@/lib/types"
import type { Subject } from "@/lib/types"
import { cn } from "@/lib/utils"

const PRESET_COLORS = [
  "#E11D48", "#DC2626", "#EA580C", "#D97706",
  "#059669", "#16A34A", "#0D9488", "#2563EB",
  "#4F46E5", "#7C3AED", "#9333EA", "#DB2777",
  "#6B7280", "#1F2937",
]

interface CustomSubjectsProps {
  customSubjects: Subject[]
  onSave: (subjects: Subject[]) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CustomSubjects({
  customSubjects,
  onSave,
  open,
  onOpenChange,
}: CustomSubjectsProps) {
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    shortCode: "",
    color: "#2563EB",
    icon: "📘",
  })

  const handleAdd = () => {
    if (!formData.name.trim() || !formData.shortCode.trim()) return
    const newSubject: Subject = {
      id: `custom-${Date.now()}`,
      name: formData.name.trim(),
      shortCode: formData.shortCode.trim().toUpperCase(),
      color: formData.color,
      icon: formData.icon || "📘",
    }
    const updated = [...customSubjects, newSubject]
    onSave(updated)
    setFormData({ name: "", shortCode: "", color: "#2563EB", icon: "📘" })
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    onSave(customSubjects.filter((s) => s.id !== id))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Subjects</DialogTitle>
          <DialogDescription>
            Manage your subjects. Built-in VCE subjects cannot be modified.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[58vh] pr-4">
          <div className="grid gap-0.5 py-1">
            <div className="mb-1 px-1 text-micro font-semibold uppercase tracking-normal text-muted-foreground">
              Built-in VCE Subjects
            </div>
            {VCE_SUBJECTS.map((subject) => (
              <div
                key={subject.id}
                className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2"
              >
                <span className="text-base">{subject.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{subject.name}</p>
                </div>
                <div
                  className="h-5 w-5 rounded-full border"
                  style={{ backgroundColor: subject.color }}
                />
                <span className="text-xs font-mono text-muted-foreground">
                  {subject.shortCode}
                </span>
              </div>
            ))}
            {customSubjects.length > 0 && (
              <>
                <div className="mb-1 mt-3 px-1 text-micro font-semibold uppercase tracking-normal text-muted-foreground">
                  Custom Subjects
                </div>
                {customSubjects.map((subject) => (
                  <div
                    key={subject.id}
                    className="group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50"
                  >
                    <span className="text-base">{subject.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{subject.name}</p>
                    </div>
                    <div
                      className="h-5 w-5 rounded-full border"
                      style={{ backgroundColor: subject.color }}
                    />
                    <span className="text-xs font-mono text-muted-foreground">
                      {subject.shortCode}
                    </span>
                    <Button
                      type="button"
                      onClick={() => handleDelete(subject.id)}
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Delete ${subject.name}`}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        </ScrollArea>

        {showForm ? (
          <div className="grid gap-3 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium mb-1.5 block">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Art"
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">Code</label>
                <Input
                  value={formData.shortCode}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, shortCode: e.target.value }))
                  }
                  placeholder="e.g. ART"
                  maxLength={5}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">Icon</label>
              <Input
                value={formData.icon}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, icon: e.target.value }))
                }
                placeholder="📘"
                maxLength={4}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-2 flex items-center gap-1.5">
                <Palette className="h-3 w-3" />
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <Button
                    type="button"
                    key={c}
                    onClick={() => setFormData((f) => ({ ...f, color: c }))}
                    variant="outline"
                    size="icon"
                    className={cn("rounded-full", formData.color === c && "ring-2 ring-ring")}
                    style={{ backgroundColor: c }}
                    aria-label={`Use ${c}`}
                    aria-pressed={formData.color === c}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} size="sm" className="gap-1.5">
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => setShowForm(true)}
            variant="outline"
            size="sm"
            className="w-full gap-1.5 mt-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Custom Subject
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
