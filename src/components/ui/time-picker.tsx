import { useId } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Clock8Icon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface TimePickerProps extends Omit<React.ComponentProps<"input">, "type"> {
  label?: string
  showIcon?: boolean
  wrapperClassName?: string
}

function TimePicker({ label, showIcon = true, wrapperClassName, className, id, ...props }: TimePickerProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  const input = (
    <div className="relative">
      {showIcon && (
        <div className="text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3 peer-disabled:opacity-50">
          <Clock8Icon className="size-4" />
          <span className="sr-only">Clock</span>
        </div>
      )}
      <Input
        type="time"
        id={inputId}
        step="1"
        className={cn(
          "peer bg-background appearance-none",
          showIcon && "pl-9",
          "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none",
          className
        )}
        {...props}
      />
    </div>
  )

  if (!label) {
    return input
  }

  return (
    <div className={cn("flex w-full flex-col gap-2", wrapperClassName)}>
      <Label htmlFor={inputId}>{label}</Label>
      {input}
    </div>
  )
}

export default TimePicker
