import { useState, useCallback } from "react"
import { VCE_SUBJECTS, type Subject, type Unit } from "@/lib/types"
import { getSubjectById } from "@/lib/utils"

export interface AssessmentFormValues {
  name: string
  description?: string
  icon?: string
  subjectId?: string
  unit?: Unit
  isFavorite?: boolean
  isArchived?: boolean
  isFinished?: boolean
}

export interface AssessmentFormInitialValues {
  name?: string
  description?: string
  icon?: string
  subjectId?: string
  unit?: Unit
  isFavorite?: boolean
  isArchived?: boolean
  isFinished?: boolean
}

export interface UseAssessmentFormOptions {
  customSubjects: Subject[]
  availableSubjects?: Subject[]
  initialValues?: AssessmentFormInitialValues
  onSubmit: (values: AssessmentFormValues) => void
}

export function useAssessmentForm({
  customSubjects,
  availableSubjects,
  initialValues,
  onSubmit,
}: UseAssessmentFormOptions) {
  const [name, setName] = useState(initialValues?.name ?? "")
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [icon, setIcon] = useState(initialValues?.icon ?? "📁")
  const [subjectId, setSubjectId] = useState(initialValues?.subjectId ?? "")
  const [unit, setUnit] = useState<Unit | "">(initialValues?.unit ?? "")
  const [isFavorite, setIsFavorite] = useState(initialValues?.isFavorite ?? false)
  const [isArchived, setIsArchived] = useState(initialValues?.isArchived ?? false)
  const [isFinished, setIsFinished] = useState(initialValues?.isFinished ?? false)

  const baseSubjects = availableSubjects ?? [...VCE_SUBJECTS, ...customSubjects]
  const initialSubject = getSubjectById(initialValues?.subjectId)
  const subjects = initialSubject && !baseSubjects.some((s) => s.id === initialSubject.id)
    ? [initialSubject, ...baseSubjects]
    : baseSubjects

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return

    onSubmit({
      name: name.trim(),
      description: description.trim() ? description.trim() : undefined,
      icon,
      subjectId: subjectId || undefined,
      unit: unit || undefined,
      isFavorite,
      isArchived,
      isFinished,
    })
  }, [name, description, icon, subjectId, unit, isFavorite, isArchived, isFinished, onSubmit])

  return {
    // State
    name, setName,
    description, setDescription,
    icon, setIcon,
    subjectId, setSubjectId,
    unit, setUnit,
    isFavorite, setIsFavorite,
    isArchived, setIsArchived,
    isFinished, setIsFinished,
    // Derived
    subjects,
    customSubjects,
    // Actions
    handleSubmit,
    canSave: name.trim().length > 0,
  }
}
