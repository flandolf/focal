import { useState, type FormEvent } from "react"
import { format } from "date-fns"
import { Archive, CheckCircle2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogBody, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  ChoiceGrid,
  DatePickerField,
  EmojiPicker,
  FormField,
  SelectField,
  ToggleChip,
} from "@/components/ui/form-controls"
import { ASSESSMENT_ICONS, ASSESSMENT_TYPES, VCE_UNITS } from "@/lib/assessmentOptions"
import { VCE_SUBJECTS, type DeadlineType, type Subject, type Unit } from "@/lib/types"
import { cn, getSubjectById } from "@/lib/utils"

export interface AssessmentFormValues {
  name: string
  description?: string
  icon?: string
  deadline?: string
  subjectId?: string
  unit?: Unit
  deadlineType?: DeadlineType
  examDate?: string
  isFavorite?: boolean
  isArchived?: boolean
  isFinished?: boolean
}

interface AssessmentFormInitialValues {
  name?: string
  description?: string
  icon?: string
  deadline?: string
  subjectId?: string
  unit?: Unit
  deadlineType?: DeadlineType
  examDate?: string
  isFavorite?: boolean
  isArchived?: boolean
  isFinished?: boolean
}

interface AssessmentFormProps {
  customSubjects?: Subject[]
  availableSubjects?: Subject[]
  initialValues?: AssessmentFormInitialValues
  submitLabel: string
  onCancel: () => void
  onSubmit: (values: AssessmentFormValues) => void
  showStatusControls?: boolean
}

function parseOptionalDate(value?: string) {
  return value ? new Date(value) : undefined
}

function AssessmentForm({
  customSubjects = [],
  availableSubjects,
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
  showStatusControls = false,
}: AssessmentFormProps) {
  const [name, setName] = useState(initialValues?.name ?? "")
  const [description, setDescription] = useState(initialValues?.description ?? "")
  const [icon, setIcon] = useState(initialValues?.icon ?? "📁")
  const [deadline, setDeadline] = useState<Date | undefined>(() => parseOptionalDate(initialValues?.deadline))
  const [examDate, setExamDate] = useState<Date | undefined>(() => parseOptionalDate(initialValues?.examDate))
  const [subjectId, setSubjectId] = useState(initialValues?.subjectId ?? "")
  const [unit, setUnit] = useState<Unit | "">(initialValues?.unit ?? "")
  const [deadlineType, setDeadlineType] = useState<DeadlineType | "">(initialValues?.deadlineType ?? "")
  const [isFavorite, setIsFavorite] = useState(initialValues?.isFavorite ?? false)
  const [isArchived, setIsArchived] = useState(initialValues?.isArchived ?? false)
  const [isFinished, setIsFinished] = useState(initialValues?.isFinished ?? false)
  const baseSubjects = availableSubjects ?? [...VCE_SUBJECTS, ...customSubjects]
  const initialSubject = getSubjectById(initialValues?.subjectId)
  const subjects = initialSubject && !baseSubjects.some((subject) => subject.id === initialSubject.id)
    ? [initialSubject, ...baseSubjects]
    : baseSubjects

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return

    onSubmit({
      name: name.trim(),
      description: description.trim() ? description.trim() : undefined,
      icon,
      deadline: deadline ? format(deadline, "yyyy-MM-dd") : undefined,
      subjectId: subjectId || undefined,
      unit: unit || undefined,
      deadlineType: deadlineType || undefined,
      examDate: examDate ? format(examDate, "yyyy-MM-dd") : undefined,
      isFavorite,
      isArchived,
      isFinished,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
      <DialogBody className="grid max-h-[min(68vh,38rem)] gap-5 py-1 pr-1">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name">
            <Input
              placeholder="e.g. Methods SAC 2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Description">
            <Input
              placeholder="Optional — brief description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Subject"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
          >
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.icon} {subject.name}{customSubjects.some((item) => item.id === subject.id) ? " (custom)" : ""}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit | "")}
          >
            <option value="">None</option>
            {VCE_UNITS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className={cn("grid gap-4", showStatusControls ? "sm:grid-cols-2" : "grid-cols-1")}>
          <FormField label="Assessment Type">
            <ChoiceGrid
              options={ASSESSMENT_TYPES.map((type) => ({
                value: type.value,
                label: type.label,
                icon: type.icon,
              }))}
              value={deadlineType}
              onChange={setDeadlineType}
              className={showStatusControls ? "grid-cols-2" : "grid-cols-4"}
            />
          </FormField>
          {showStatusControls && (
            <DatePickerField
              label="Assessment Date"
              date={deadline}
              onDateChange={setDeadline}
              placeholder="Pick a date"
              formatPattern="PPP"
              clearLabel="Clear deadline"
            />
          )}
        </div>

        {!showStatusControls && (
          <DatePickerField
            label="Assessment Date"
            date={deadline}
            onDateChange={setDeadline}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <DatePickerField
            label="Exam Date"
            date={examDate}
            onDateChange={setExamDate}
            placeholder={showStatusControls ? "Pick a date" : "Pick date"}
            formatPattern={showStatusControls ? "PPP" : "MMM d"}
            clearLabel={showStatusControls ? "Clear" : undefined}
          />
        </div>

        <EmojiPicker
          label="Icon"
          options={ASSESSMENT_ICONS}
          value={icon}
          onChange={setIcon}
        />

        {showStatusControls && (
          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip
              active={isFavorite}
              onToggle={() => setIsFavorite((current) => !current)}
              icon={<Star className={cn("h-3.5 w-3.5", isFavorite && "fill-yellow-400")} />}
              activeClassName="border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-400"
            >
              Favorite
            </ToggleChip>
            <ToggleChip
              active={isFinished}
              onToggle={() => {
                setIsFinished((current) => !current)
                if (!isFinished) setIsArchived(false)
              }}
              icon={<CheckCircle2 className={cn("h-3.5 w-3.5", isFinished && "text-green-500")} />}
              activeClassName="border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/20 dark:text-green-400"
            >
              Finished
            </ToggleChip>
            <ToggleChip
              active={isArchived}
              onToggle={() => setIsArchived((current) => !current)}
              icon={<Archive className="h-3.5 w-3.5" />}
              activeClassName="border-muted-foreground/30 bg-muted text-muted-foreground"
            >
              Archived
            </ToggleChip>
          </div>
        )}
      </DialogBody>

      <DialogFooter className="mt-5">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim()}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

export { AssessmentForm }
