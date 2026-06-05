import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const selectClassName = "flex h-10 w-full rounded-lg border border-input bg-background/65 px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

interface FormFieldProps extends ComponentProps<"div"> {
  label: string
  hint?: string
  labelAccessory?: ReactNode
  labelClassName?: string
  children: ReactNode
}

function FormField({ label, hint, labelAccessory, labelClassName, className, children, ...props }: FormFieldProps) {
  const labelElement = <label className={cn("text-control font-medium text-muted-foreground", labelClassName)}>{label}</label>

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      {labelAccessory ? (
        <div className="flex items-center justify-between gap-3">
          {labelElement}
          {labelAccessory}
        </div>
      ) : labelElement}
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface SelectFieldProps extends Omit<ComponentProps<"select">, "children"> {
  label: string
  hint?: string
  labelClassName?: string
  children: ReactNode
}

function SelectField({ label, hint, labelClassName, className, children, ...props }: SelectFieldProps) {
  return (
    <FormField label={label} hint={hint} labelClassName={labelClassName}>
      <select className={cn(selectClassName, className)} {...props}>
        {children}
      </select>
    </FormField>
  )
}

interface DatePickerFieldProps {
  label: string
  date?: Date
  onDateChange: (date: Date | undefined) => void
  placeholder?: string
  formatPattern?: string
  clearLabel?: string
  buttonClassName?: string
  labelClassName?: string
}

function DatePickerField({
  label,
  date,
  onDateChange,
  placeholder = "Pick date",
  formatPattern = "MMM d",
  clearLabel,
  buttonClassName,
  labelClassName,
}: DatePickerFieldProps) {
  return (
    <FormField label={label} labelClassName={labelClassName}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-10 w-full justify-start rounded-lg bg-background/65 text-left font-normal",
              !date && "text-muted-foreground",
              buttonClassName
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, formatPattern) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onDateChange}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {date && clearLabel && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 justify-self-start px-2 text-xs text-muted-foreground"
          onClick={() => onDateChange(undefined)}
        >
          {clearLabel}
        </Button>
      )}
    </FormField>
  )
}

interface ChoiceOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface ChoiceGridProps<T extends string> {
  options: ChoiceOption<T>[]
  value: T | ""
  onChange: (value: T | "") => void
  className?: string
}

function ChoiceGrid<T extends string>({ options, value, onChange, className }: ChoiceGridProps<T>) {
  return (
    <div className={cn("grid gap-2", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(value === option.value ? "" : option.value)}
          className={cn(
            "min-h-10 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option.value
              ? "border-primary/35 bg-primary/10 text-primary"
              : "border-border/70 bg-background/45 text-muted-foreground hover:bg-accent/45 hover:text-foreground"
          )}
          aria-pressed={value === option.value}
        >
          {option.icon} {option.label}
        </button>
      ))}
    </div>
  )
}

interface EmojiPickerProps<T extends string> {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
}

function EmojiPicker<T extends string>({ label, options, value, onChange }: EmojiPickerProps<T>) {
  return (
    <FormField label={label}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              value === option
                ? "border-primary/35 bg-primary/10 ring-2 ring-ring/45"
                : "border-transparent hover:bg-accent/50"
            )}
            aria-pressed={value === option}
          >
            {option}
          </button>
        ))}
      </div>
    </FormField>
  )
}

interface ToggleChipProps {
  active: boolean
  onToggle: () => void
  icon?: ReactNode
  children: ReactNode
  activeClassName?: string
}

function ToggleChip({ active, onToggle, icon, children, activeClassName }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? activeClassName
          : "border-border text-muted-foreground hover:bg-accent/50"
      )}
    >
      {icon}
      {children}
    </button>
  )
}

interface FormSectionProps extends ComponentProps<"section"> {
  title: string
  icon?: ReactNode
  children: ReactNode
}

function FormSection({ title, icon, className, children, ...props }: FormSectionProps) {
  return (
    <section className={cn("grid gap-3", className)} {...props}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

export { ChoiceGrid, DatePickerField, EmojiPicker, FormField, FormSection, SelectField, ToggleChip }
