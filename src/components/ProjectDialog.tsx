import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AssessmentForm, type AssessmentFormValues } from "@/components/AssessmentForm"
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
  onSubmitEdit?: (id: string, data: AssessmentFormValues) => void
  customSubjects?: Subject[]
  availableSubjects?: Subject[]
}

export function ProjectDialog({
  project,
  open,
  onOpenChange,
  onSubmit,
  onSubmitEdit,
  customSubjects = [],
  availableSubjects,
}: ProjectDialogProps) {
  const isEditMode = Boolean(project)
  const existingProject = isEditMode ? project! : null

  const handleSubmit = (values: AssessmentFormValues) => {
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
      </DialogContent>
    </Dialog>
  )
}