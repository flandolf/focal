/**
 * Shared motion design tokens and variants.
 *
 * Centralizes timing, easing, and reusable variant objects so animations feel
 * cohesive across the app. Honors `prefers-reduced-motion` via framer-motion's
 * `useReducedMotion` + a `MOTION_REDUCED_*` constant for plain CSS consumers.
 *
 * Design constraints (from .impeccable.md):
 *  - "precision tool" aesthetic — restrained, purposeful motion
 *  - one well-orchestrated experience beats scattered animations
 *  - ease out with exponential curves; no bounce / elastic
 *  - GPU-accelerated: transform + opacity only
 */
import type { Transition, Variants } from "framer-motion"

/** Primary ease curve — refines material deceleration, no overshoot. */
export const MOTION_EASE = [0.16, 1, 0.3, 1] as const
/** Slightly snappier sibling for tighter feedback (tooltips, toggles). */
export const MOTION_EASE_SNAPPY = [0.22, 1, 0.36, 1] as const

/** Duration tokens (seconds — framer-motion units). */
export const MOTION_DURATION = {
  instant: 0.08,
  fast: 0.15,
  normal: 0.22,
  medium: 0.32,
  slow: 0.48,
  page: 0.6,
} as const

/** Standard transitions for common purposes. */
export const TRANSITION = {
  /** For hover/tap micro-interactions — snappy spring. */
  press: { type: "spring", stiffness: 520, damping: 34, mass: 0.65 } as Transition,
  /** For state changes (hover, focus, toggle). */
  state: { duration: MOTION_DURATION.fast, ease: MOTION_EASE_SNAPPY } as Transition,
  /** For layout shifts (sidebar collapse, content resize). */
  layout: { duration: MOTION_DURATION.normal, ease: MOTION_EASE } as Transition,
  /** For view/page enter/exit. */
  view: { duration: MOTION_DURATION.normal, ease: MOTION_EASE } as Transition,
  /** For entrance choreography (list stagger). */
  entrance: { duration: MOTION_DURATION.medium, ease: MOTION_EASE } as Transition,
  /** For exit (faster than entrance per design rules). */
  exit: { duration: MOTION_DURATION.fast, ease: MOTION_EASE_SNAPPY } as Transition,
} as const

/** Disabled (no-motion) transitions for prefers-reduced-motion users. */
export const REDUCED_TRANSITION = { duration: 0 } as const
export const REDUCED_HOVER = undefined
export const REDUCED_TAP = undefined

/* ------------------------------ Variants ------------------------------ */

/** Page/view entrance. Fade + tiny rise. */
export const viewEnter: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: TRANSITION.view },
  exit: { opacity: 0, y: -4, transition: TRANSITION.exit },
}

/** Container that staggers child entrance. */
export const staggerContainer = (stagger = 0.04, delayChildren = 0.05): Variants => ({
  initial: {},
  animate: {
    transition: {
      staggerChildren: stagger,
      delayChildren,
    },
  },
  exit: {
    transition: {
      staggerChildren: stagger * 0.5,
      staggerDirection: -1,
    },
  },
})

/** Item that fades + slides up on entrance (stagger child). */
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: TRANSITION.entrance },
  exit: { opacity: 0, y: -4, transition: TRANSITION.exit },
}

/** Item that fades + slides in from the side. */
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0, transition: TRANSITION.entrance },
  exit: { opacity: 0, x: 4, transition: TRANSITION.exit },
}

export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0, transition: TRANSITION.entrance },
  exit: { opacity: 0, x: -4, transition: TRANSITION.exit },
}

/** Scale-in entrance (dialogs, popovers). */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: TRANSITION.entrance },
  exit: { opacity: 0, scale: 0.98, transition: TRANSITION.exit },
}

/** Popover-style entrance (slight scale + rise). */
export const popIn: Variants = {
  initial: { opacity: 0, y: -4, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: TRANSITION.state },
  exit: { opacity: 0, y: -2, scale: 0.98, transition: TRANSITION.exit },
}

/** Slide-down entrance (toasts from bottom, dropdowns from top). */
export const slideDown: Variants = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0, transition: TRANSITION.entrance },
  exit: { opacity: 0, y: -4, transition: TRANSITION.exit },
}

/**
 * HomeView mount entrance — single subtle fade + 4px rise. Stays under
 * PRODUCT.md's "Faster ingress, no gratuitous animations" ceiling (~250ms via
 * TRANSITION.view). Reduced-motion users bypass these variants at the call
 * site by passing `initial={false}` so the mount renders paint-ready.
 *
 * Goal: orient the user to the calendar immediately on view. The visual work
 * is carried by the state-conditional halos on Overdue / current period /
 * selection toolbar — not by this single mount.
 */
export const homeEnter: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: TRANSITION.view },
}

/* -------------------------- Hover / Tap props -------------------------- */

/** Pressable element feel — subtle lift on hover, gentle press on tap. */
export const pressable = (reduceMotion: boolean | null) => ({
  whileHover: reduceMotion ? undefined : { scale: 1.02 },
  whileTap: reduceMotion ? undefined : { scale: 0.97 },
  transition: reduceMotion ? REDUCED_TRANSITION : TRANSITION.press,
})

/** Subtle hover lift (no scale change) for cards. */
export const hoverLift = (reduceMotion: boolean | null) =>
  reduceMotion
    ? undefined
    : { y: -2, transition: { duration: MOTION_DURATION.normal, ease: MOTION_EASE } }

/** Stronger hover lift for prominent cards. */
export const hoverLiftStrong = (reduceMotion: boolean | null) =>
  reduceMotion
    ? undefined
    : { y: -4, transition: { duration: MOTION_DURATION.normal, ease: MOTION_EASE } }

/** Slide-right hover for list items (icon/text nudge). */
export const hoverNudgeRight = (reduceMotion: boolean | null) =>
  reduceMotion
    ? undefined
    : { x: 2, transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE_SNAPPY } }

/** Subtle upward hover (default -1px) for dense rows. */
export const hoverNudgeUp = (reduceMotion: boolean | null, distance = 1) =>
  reduceMotion
    ? undefined
    : { y: -distance, transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASE_SNAPPY } }

/* ----------------------------- CSS helpers ----------------------------- */

/** Inline `prefers-reduced-motion` guard for non-framer consumers. */
export const REDUCED_MOTION_CSS =
  "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}}"
