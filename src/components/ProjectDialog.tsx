import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Link, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AssessmentForm } from "@/components/AssessmentForm"
import type { Project, Subject, Unit } from "@/lib/types"

interface ProjectDialogProps {
  project?: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit?: (data: {
    name: string
    description?: string
    icon?: string
    subjectId?: string
    unit?: Unit
  }) => void
  onSubmitEdit?: (id: string, data: {
    name: string
    description?: string
    icon?: string
    subjectId?: string
    unit?: Unit
    isFavorite?: boolean
    isArchived?: boolean
    isFinished?: boolean
  }) => void
  onChangeFolder?: (projectId: string) => void
  customSubjects?: Subject[]
  availableSubjects?: Subject[]
}

export function ProjectDialog({
  project,
  open,
  onOpenChange,
  onSubmit,
  onSubmitEdit,
  onChangeFolder,
  customSubjects = [],
  availableSubjects,
}: ProjectDialogProps) {
  const isEditMode = Boolean(project)
  const existingProject = isEditMode ? project! : null

  const handleSubmit = (values: {
    name: string
    description?: string
    icon?: string
    subjectId?: string
    unit?: Unit
    isFavorite?: boolean
    isArchived?: boolean
    isFinished?: boolean
  }) => {
    if (existingProject && onSubmitEdit) {
      const { id } = existingProject
      onSubmitEdit(id, values)
    } else {
      onSubmit?.(values)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Assessment Details" : "New Assessment"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Edit the subject, date, files label, and status for this assessment."
              : "Create a SAC, test, exam, or assessment folder to organise your files."}
          </DialogDescription>
        </DialogHeader>
        {existingProject?.isLinked && (
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
            <Link className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              This assessment links to a folder in another location (e.g., OneDrive). Files are not copied, and the path is synced across devices.
            </p>
          </div>
        )}
        <AssessmentForm
          key={`${isEditMode ? `edit-${existingProject?.id}` : `new-${open ? "open" : "closed"}`}`}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          initialValues={existingProject ? {
            name: existingProject.name,
            description: existingProject.description,
            icon: existingProject.icon,
            subjectId: existingProject.subjectId,
            unit: existingProject.unit,
            isFavorite: existingProject.isFavorite,
            isArchived: existingProject.isArchived,
            isFinished: existingProject.isFinished,
          } : undefined}
          submitLabel={isEditMode ? "Save" : "Create Assessment"}
          showStatusControls={isEditMode}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
        {isEditMode && existingProject && (
          <div className="mt-4 space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Folder</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-2 py-1.5 text-sm font-mono">
                {existingProject.folder_path}
              </code>
              {onChangeFolder && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 shrink-0"
                  onClick={() => onChangeFolder(existingProject.id)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Change
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
