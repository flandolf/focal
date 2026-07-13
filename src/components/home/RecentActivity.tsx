import { format } from"date-fns"
import { useId } from"react"
import { motion, AnimatePresence, useReducedMotion } from"framer-motion"
import { ChevronRight, Activity } from"lucide-react"
import { staggerContainer, staggerItem, REDUCED_TRANSITION, hoverNudgeRight } from"@/lib/motion"
import type { StudySession, CalendarEvent } from"@/lib/types"

interface ActivityItem {
 id: string
 title: string
 subtitle: string
 timestamp: string
 kind:"session" |"event"
 session?: StudySession
 event?: CalendarEvent
}

function getRelativeTime(timestamp: string): string {
 const now = Date.now()
 const then = new Date(timestamp).getTime()
 if (Number.isNaN(then)) return""
 const diffMs = now - then
 if (diffMs < 0) return"just now"
 const minutes = Math.floor(diffMs / (1000 * 60))
 if (minutes < 1) return"just now"
 if (minutes < 60) return `${minutes}m ago`
 const hours = Math.floor(minutes / 60)
 if (hours < 24) return `${hours}h ago`
 const days = Math.floor(hours / 24)
 if (days === 1) return"yesterday"
 if (days < 7) return `${days}d ago`
 return format(new Date(timestamp),"MMM d")
}

interface RecentActivityProps {
 items: ActivityItem[]
 isOpen: boolean
 onToggle: () => void
 onSelectSession: (session: StudySession) => void
 onSelectEvent: (event: CalendarEvent) => void
}

export function RecentActivity({
 items,
 isOpen,
 onToggle,
 onSelectSession,
 onSelectEvent,
}: RecentActivityProps) {
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
 <Activity className="h-3.5 w-3.5 text-muted-foreground" />
 Recent Activity
 </h3>
 <motion.span
 animate={reduceMotion ? undefined : { rotate: isOpen ? 90 : 0 }}
 transition={reduceMotion ? REDUCED_TRANSITION : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
 className="inline-flex"
 >
 <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
 </motion.span>
 </button>
 <AnimatePresence initial={false}>
 {isOpen && (
 <motion.div
 key="recent-activity-body"
 id={contentId}
 initial={reduceMotion ? false : { height: 0, opacity: 0 }}
 animate={reduceMotion ? { height:"auto", opacity: 1 } : { height:"auto", opacity: 1, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } }}
 exit={reduceMotion ? { height: 0, opacity: 0 } : { height: 0, opacity: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } }}
 className="overflow-hidden"
 >
 <motion.div
 className="mt-2.5 space-y-1"
 variants={staggerContainer(0.04, 0.05)}
 initial={reduceMotion ? false :"initial"}
 animate={reduceMotion ? undefined :"animate"}
 >
 {items.length === 0 ? (
 <p className="text-xs text-muted-foreground">
 Completed sessions and finished events will appear here.
 </p>
 ) : (
 items.map((item) => (
 <motion.button
 key={`${item.kind}-${item.id}`}
 variants={staggerItem}
 whileHover={reduceMotion ? undefined : hoverNudgeRight(reduceMotion)}
 whileTap={reduceMotion ? undefined : { scale: 0.98 }}
 type="button"
 onClick={() => item.session ? onSelectSession(item.session) : item.event ? onSelectEvent(item.event) : undefined}
 className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
 >
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <p className="truncate text-xs font-medium">{item.title}</p>
 <p className="mt-0.5 truncate text-micro text-muted-foreground">{item.subtitle}</p>
 </div>
 <span className="shrink-0 text-micro leading-3 text-muted-foreground tabular-nums">
 {getRelativeTime(item.timestamp)}
 </span>
 </div>
 </motion.button>
 ))
 )}
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 )
}
