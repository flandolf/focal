import { motion, AnimatePresence, useReducedMotion } from"framer-motion"
import { useId } from"react"
import { ChevronRight, Target } from"lucide-react"
import { getSubjectById, cn } from"@/lib/utils"
import { getUrgencyLabel, getUrgencyClassName } from"@/lib/planning"
import { staggerContainer, staggerItem, REDUCED_TRANSITION, hoverNudgeRight } from"@/lib/motion"
import type { PriorityItem } from"@/lib/types"

interface StudyPrioritiesProps {
 items: PriorityItem[]
 isOpen: boolean
 onToggle: () => void
 onSelectItem: (item: PriorityItem) => void
}

export function StudyPriorities({
 items,
 isOpen,
 onToggle,
 onSelectItem,
}: StudyPrioritiesProps) {
 const reduceMotion = useReducedMotion() === true
 const contentId = useId()
 return (
 <div>
 <button
 type="button"
 onClick={onToggle}
 aria-expanded={isOpen}
 aria-controls={contentId}
 className="flex w-full items-center justify-between gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
 >
 <h3 className="flex items-center gap-2 font-heading text-sm font-semibold">
 <Target className="h-3.5 w-3.5 text-muted-foreground" />
 Study Priorities
 </h3>
 <div className="flex items-center gap-2">
 <span className="text-micro leading-3 text-muted-foreground tabular-nums">{items.length}/7</span>
 <motion.span
 animate={reduceMotion ? undefined : { rotate: isOpen ? 90 : 0 }}
 transition={reduceMotion ? REDUCED_TRANSITION : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
 className="inline-flex"
 >
 <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
 </motion.span>
 </div>
 </button>
 <AnimatePresence initial={false}>
 {isOpen && (
 <motion.div
 key="priorities-body"
 id={contentId}
 initial={reduceMotion ? false : { height: 0, opacity: 0 }}
 animate={reduceMotion ? { height:"auto", opacity: 1 } : { height:"auto", opacity: 1, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
 exit={reduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
 className="overflow-hidden"
 >
 <div className="mt-2.5">
 {items.length === 0 ? (
 <p className="text-xs text-muted-foreground">
 No urgent study actions. Add an assessment, plan a session, or review a completed one to sharpen the queue.
 </p>
 ) : (
 <motion.div
 className="space-y-1"
 variants={staggerContainer(0.04, 0.05)}
 initial={reduceMotion ? false :"initial"}
 animate={reduceMotion ? undefined :"animate"}
 >
 {items.map((item) => {
 const subjectLabels = item.subjectIds
 .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
 .slice(0, 2)
 return (
 <motion.button
 key={item.id}
 variants={staggerItem}
 whileHover={reduceMotion ? undefined : hoverNudgeRight(reduceMotion)}
 whileTap={reduceMotion ? undefined : { scale: 0.98 }}
 type="button"
 onClick={() => onSelectItem(item)}
 className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="truncate text-xs font-medium">{item.title}</p>
 <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.reason}</p>
 </div>
 <span className={cn("shrink-0 rounded p-1 text-xs font-medium leading-3", getUrgencyClassName(item.urgency))}>
 {getUrgencyLabel(item.urgency)}
 </span>
 </div>
 <div className="mt-1.5 flex items-center gap-1">
 <span className="text-micro font-medium text-primary">{item.action}</span>
 {subjectLabels.map((label) => (
 <span key={label} className="rounded bg-muted/70 px-1 py-0 text-micro leading-3 text-muted-foreground">
 {label}
 </span>
 ))}
 </div>
 </motion.button>
 )
 })}
 </motion.div>
 )}
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 )
}
