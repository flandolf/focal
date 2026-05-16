import { useState, useEffect } from "react"
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
import type { Project } from "@/lib/types"

const EMOJIS = [
  "📁", "📂", "🗂️", "📄", "📝", "✏️", "🎨", "📊",
  "📈", "🗓️", "📅", "✅", "🔥", "⭐", "💡", "🚀",
  "🎯", "📋", "📌", "🔖", "🏗️", "🧩", "🎮", "🖥️",
  "📱", "🌐", "📚", "🎓", "🏆", "🎵", "🎬", "📸",
]

interface ProjectSettingsDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (id: string, name: string, description?: string, icon?: string, deadline?: string) => void
}

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  onSubmit,
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description || "")
  const [icon, setIcon] = useState(project.icon || "📁")
  const [deadline, setDeadline] = useState<Date | undefined>(
    project.deadline ? new Date(project.deadline) : undefined
  )

  useEffect(() => {
    setName(project.name)
    setDescription(project.description || "")
    setIcon(project.icon || "📁")
    setDeadline(project.deadline ? new Date(project.deadline) : undefined)
  }, [project])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(
      project.id,
      name.trim(),
      description.trim() || undefined,
      icon,
      deadline ? format(deadline, "yyyy-MM-dd") : undefined,
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            Edit project details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Icon</label>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-0.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setIcon(e)}
                    className={`text-lg w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
                      icon === e ? "bg-accent ring-2 ring-ring" : "hover:bg-accent/50"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
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
                placeholder="Brief description of the project"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Deadline</label>
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
