import { useState, useMemo } from "react"
import { Bookmark, Trash2, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getSubjectById } from "@/lib/utils"
import { getDeadlineTypeInfo } from "@/lib/utils"
import type { ProjectTemplate, Subject } from "@/lib/types"

interface ProjectTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: ProjectTemplate[]
  onSaveAsTemplate: (projectId: string | null, name: string) => void
  onLoadTemplate: (templateId: string) => Promise<void>
  onDeleteTemplate: (templateId: string) => void
  /** If provided, shows "Save as template" mode for this project */
  projectIdForSave?: string | null
  projectNameForSave?: string
}

export function ProjectTemplateDialog({
  open,
  onOpenChange,
  templates,
  onSaveAsTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  projectIdForSave,
  projectNameForSave,
}: ProjectTemplateDialogProps) {
  const [saveName, setSaveName] = useState(projectNameForSave ?? "")
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const isSaving = Boolean(projectIdForSave)

  const handleSave = () => {
    const name = saveName.trim()
    if (!name) return
    onSaveAsTemplate(projectIdForSave ?? null, name)
    onOpenChange(false)
  }

  const handleLoad = async (templateId: string) => {
    setLoadingId(templateId)
    try {
      await onLoadTemplate(templateId)
      onOpenChange(false)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isSaving ? "Save as Template" : "Assessment Templates"}</DialogTitle>
          <DialogDescription>
            {isSaving
              ? "Save this assessment's configuration as a reusable template."
              : "Create a new assessment from a saved template."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4 py-1">
          {isSaving && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-sm font-medium">Template name</label>
                <Input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. English SAC Template"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      handleSave()
                    }
                  }}
                />
              </div>
              <Button
                onClick={handleSave}
                disabled={!saveName.trim()}
                size="sm"
                className="btn-glow-primary"
              >
                Save
              </Button>
            </div>
          )}

          {templates.length === 0 && !isSaving && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No templates yet. Open an assessment and use "Save as Template" to create one.
            </p>
          )}

          {templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((template) => {
                const subject = template.subjectId ? getSubjectById(template.subjectId) : undefined
                const deadlineInfo = getDeadlineTypeInfo(template.deadlineType)
                return (
                  <div
                    key={template.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/45 p-3"
                  >
                    <span className="text-lg shrink-0">{template.icon ?? "📁"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{template.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {subject && (
                          <span
                            className="rounded-md px-1.5 py-0.5 text-micro font-medium"
                            style={{ backgroundColor: subject.color + "14", color: subject.color }}
                          >
                            {subject.icon} {subject.shortCode}
                          </span>
                        )}
                        {template.unit && (
                          <span className="text-micro text-muted-foreground">Unit {template.unit}</span>
                        )}
                        {template.deadlineType && (
                          <span className="text-micro" style={{ color: deadlineInfo.color }}>
                            {deadlineInfo.icon} {deadlineInfo.label}
                          </span>
                        )}
                        {template.checklist && template.checklist.length > 0 && (
                          <span className="text-micro text-muted-foreground/60">
                            {template.checklist.length} task{template.checklist.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleLoad(template.id)}
                        disabled={loadingId === template.id}
                        className="h-7 gap-1 rounded-lg text-xs"
                      >
                        {loadingId === template.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Bookmark className="h-3 w-3" />
                        )}
                        Use
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDeleteTemplate(template.id)}
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
