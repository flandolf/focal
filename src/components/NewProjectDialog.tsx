import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AssessmentForm, type AssessmentFormValues } from "@/components/AssessmentForm"
import type { DeadlineType, Subject, Unit } from "@/lib/types"

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
  availableSubjects?: Subject[]
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onSubmit,
  customSubjects = [],
  availableSubjects,
}: NewProjectDialogProps) {
  const handleSubmit = (values: AssessmentFormValues) => {
    onSubmit(values)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Assessment</DialogTitle>
          <DialogDescription>
            Create a SAC, test, exam, or assessment folder to organise your files.
          </DialogDescription>
        </DialogHeader>
        <AssessmentForm
          key={open ? "new-assessment-open" : "new-assessment-closed"}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          submitLabel="Create Assessment"
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
