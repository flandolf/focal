import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { motion, useReducedMotion } from "framer-motion"

import { cn } from "@/lib/utils"
import { CheckIcon } from "lucide-react"

const CHECK_TICK_TRANSITION = {
  type: "spring" as const,
  stiffness: 620,
  damping: 22,
  mass: 0.55,
}

const CHECK_ROOT_TAP = { scale: 0.88 }

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  const reduceMotion = useReducedMotion() === true
  const motionTransition = reduceMotion ? { duration: 0 } : CHECK_TICK_TRANSITION
  const tapMotion = reduceMotion ? undefined : CHECK_ROOT_TAP

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      asChild
      {...props}
    >
      <motion.button
        type="button"
        role="checkbox"
        whileTap={tapMotion}
        transition={{ type: "spring", stiffness: 560, damping: 28, mass: 0.5 }}
        data-slot="checkbox"
        className={cn(
          // ponytail: --color-primary cascades theme-aware via CSS vars, so the explicit `dark:data-checked:bg-primary` was redundant. Restore one only if the var cascade ever stops theme-switching.
          'peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground',
          className
        )}
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          asChild
        >
          <motion.span
            initial={reduceMotion ? false : { scale: 0, opacity: 0, rotate: -18 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={reduceMotion ? { scale: 0, opacity: 0 } : { scale: 0, opacity: 0, rotate: 18 }}
            transition={motionTransition}
            className="grid place-content-center text-current [&>svg]:size-3.5"
          >
            <CheckIcon className="stroke-[3]" />
          </motion.span>
        </CheckboxPrimitive.Indicator>
      </motion.button>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
