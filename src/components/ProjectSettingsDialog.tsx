import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AssessmentForm } from "@/components/AssessmentForm"
import type { Project, Subject } from "@/lib/types"

interface ProjectSettingsDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (id: string, data: {
    name: string
    description?: string
    icon?: string
    subjectId?: string
    unit?: string
    isFavorite?: boolean
    isArchived?: boolean
    isFinished?: boolean
  }) => void
  customSubjects?: Subject[]
  availableSubjects?: Subject[]
}

export function ProjectSettingsDialog({
  project,
  open,
  onOpenChange,
  onSubmit,
  customSubjects = [],
  availableSubjects,
}: ProjectSettingsDialogProps) {
  const handleSubmit = (values: {
    name: string
    description?: string
    icon?: string
    subjectId?: string
    unit?: string
    isFavorite?: boolean
    isArchived?: boolean
    isFinished?: boolean
  }) => {
    onSubmit(project.id, values)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assessment Details</DialogTitle>
          <DialogDescription>
            Edit the subject, date, files label, and status for this assessment.
          </DialogDescription>
        </DialogHeader>
        <AssessmentForm
          key={`${project.id}-${open ? "open" : "closed"}`}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          initialValues={{
            name: project.name,
            description: project.description,
            icon: project.icon,
            subjectId: project.subjectId,
            unit: project.unit,
            isFavorite: project.isFavorite,
            isArchived: project.isArchived,
            isFinished: project.isFinished,
          }}
          submitLabel="Save"
          showStatusControls
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
