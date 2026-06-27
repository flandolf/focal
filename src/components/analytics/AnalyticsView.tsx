import { useState, useMemo, useCallback, memo } from"react"
import type { ReactNode } from"react"
import { motion, AnimatePresence, useReducedMotion } from"framer-motion"
import { ScrollArea } from"@/components/ui/scroll-area"
import { Card } from"@/components/ui/card"
import { getAnalyticsData, type AnalyticsRange } from"@/lib/analytics"
import type { Project, StudySession } from"@/lib/types"
import { cn, getSubjectById } from"@/lib/utils"
import { getSubjectColor } from"@/lib/chartTheme"
import {
 MOTION_DURATION,
 MOTION_EASE,
 TRANSITION,
 REDUCED_TRANSITION,
 hoverLift,
 staggerContainer,
 staggerItem,
} from"@/lib/motion"
import { StudyTimeTrendChart } from"./StudyTimeTrendChart"
import { SubjectBreakdownChart } from"./SubjectBreakdownChart"
import { SubjectCompletionChart } from"./SubjectCompletionChart"
import { EfficiencyChart } from"./EfficiencyChart"
import { ConsistencyHeatmap } from"./ConsistencyHeatmap"
import { TimeOfDayChart } from"./TimeOfDayChart"
import { EmptyAnalytics } from"./EmptyAnalytics"

interface AnalyticsViewProps {
 sessions: StudySession[]
 projects: Project[]
 onNewSession: () => void
}

const RANGE_OPTIONS: { value: AnalyticsRange; label: string }[] = [
 { value: 7, label:"7d" },
 { value: 30, label:"30d" },
 { value: 90, label:"3mo" },
 { value: 365, label:"1yr" },
 { value: 0, label:"All" },
]

function formatMinutesShort(m: number) {
 if (m < 60) return `${m}m`
 return `${Math.round((m / 60) * 10) / 10}h`
}

function formatMinutesLong(m: number) {
 if (m === 0) return"0m"
 if (m < 60) return `${m}m`
 const h = Math.floor(m / 60)
 const rem = m % 60
 return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

const AnalyticsViewInner = memo(function AnalyticsViewInner({ sessions, projects, onNewSession }: AnalyticsViewProps) {
 const reduceMotion = useReducedMotion() === true
 const [range, setRange] = useState<AnalyticsRange>(30)
 const [selectedSubjects, setSelectedSubjects] = useState<Set<string> | null>(null)

 const data = useMemo(
 () => getAnalyticsData(sessions, projects, range),
 [sessions, projects, range],
 )

 const allSubjectIds = useMemo(
 () => Array.from(new Set(data.subjectBreakdown.map((d) => d.subjectId))),
 [data.subjectBreakdown],
 )

 const isFilterActive = selectedSubjects !== null
 const activeSet = useMemo(
 () => selectedSubjects ?? new Set(allSubjectIds),
 [selectedSubjects, allSubjectIds],
 )

 const selectionState:"all" |"partial" = !isFilterActive || selectedSubjects.size === allSubjectIds.length
 ?"all"
 :"partial"

 const filteredBreakdown = useMemo(
 () =>
 isFilterActive
 ? data.subjectBreakdown.filter((d) => activeSet.has(d.subjectId))
 : data.subjectBreakdown,
 [data.subjectBreakdown, activeSet, isFilterActive],
 )
 const filteredCompletion = useMemo(
 () =>
 isFilterActive
 ? data.subjectCompletion.filter((d) => activeSet.has(d.subjectId))
 : data.subjectCompletion,
 [data.subjectCompletion, activeSet, isFilterActive],
 )
 const filteredEfficiency = useMemo(
 () =>
 isFilterActive
 ? data.efficiency.filter((d) => activeSet.has(d.subjectId))
 : data.efficiency,
 [data.efficiency, activeSet, isFilterActive],
 )
 const filteredTimeTrends = useMemo(
 () =>
 isFilterActive
 ? data.timeTrends.filter(
 (p) => p.subjectId == null || activeSet.has(p.subjectId),
 )
 : data.timeTrends,
 [data.timeTrends, activeSet, isFilterActive],
 )

 const filteredTotalMinutes = useMemo(
 () => filteredBreakdown.reduce((s, d) => s + d.minutes, 0),
 [filteredBreakdown],
 )
 const filteredDailyAverage = useMemo(
 () =>
 data.consistency.days.length > 0
 ? Math.round(filteredTotalMinutes / data.consistency.days.length)
 : 0,
 [filteredTotalMinutes, data.consistency.days.length],
 )

 const handleToggleSubject = useCallback(
 (sid: string) => {
 setSelectedSubjects((prev) => {
 const base = prev ?? new Set(allSubjectIds)
 const next = new Set(base)
 if (next.has(sid)) next.delete(sid)
 else next.add(sid)
 return next
 })
 },
 [allSubjectIds],
 )

 if (!data.hasData) {
 return <EmptyAnalytics onNewSession={onNewSession} />
 }

 const unfiltered = isFilterActive && selectedSubjects.size > 0

 return (
 <ScrollArea className="h-full">
 <motion.div
 className="px-6 py-5 min-[1200px]:px-8 min-[1200px]:py-6"
 initial={{ opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 transition={TRANSITION.view}
 >
 <motion.div
 className="space-y-5"
 variants={staggerContainer(0.06, 0.05)}
 initial="initial"
 animate="animate"
 >
 {/* Header row */}
 <motion.div
 variants={staggerItem}
 className="flex items-center justify-between"
 >
 <h2 className="font-heading text-lg font-semibold">Analytics</h2>
 <RangeToggle value={range} onChange={setRange} reduceMotion={reduceMotion} />
 </motion.div>              <motion.div variants={staggerItem}>
 <KpiStrip
 totalMinutes={filteredTotalMinutes}
 dailyAverage={filteredDailyAverage}
 daysStudied={data.consistency.stats.totalStudyDays}
 totalDays={data.consistency.days.length}
 currentStreak={data.consistency.stats.currentStreak}
 filterActive={isFilterActive}
 reduceMotion={reduceMotion}
 />
 </motion.div>

 {/* Subject filter chips */}
 {allSubjectIds.length > 0 && (
 <motion.div variants={staggerItem}>
 <SubjectFilterChips
 subjectIds={allSubjectIds}
 activeIds={activeSet}
 selectionState={selectionState}
 onToggle={handleToggleSubject}
 onSelectAll={() => setSelectedSubjects(null)}
 reduceMotion={reduceMotion}
 />
 </motion.div>
 )}

 {/* Chart grid: crossfade on range change, cards stagger on mount */}
 <motion.div variants={staggerItem} className="relative">
 <AnimatePresence mode="wait">
 <motion.div
 key={range}
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 transition={{ duration: MOTION_DURATION.fast, ease: MOTION_EASE }}
 >
 <motion.div
 variants={staggerContainer(0.05, 0)}
 initial="initial"
 animate="animate"
 className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2"
 >
 <motion.div
 variants={staggerItem}
 className="relative min-[900px]:col-span-2"
 >
 <StudyTimeTrendChart data={filteredTimeTrends} />
 </motion.div>
 <motion.div variants={staggerItem} className="relative">
 <SubjectBreakdownChart data={filteredBreakdown} />
 </motion.div>
 <motion.div variants={staggerItem} className="relative">
 <SubjectCompletionChart data={filteredCompletion} />
 </motion.div>
 <motion.div
 variants={staggerItem}
 className={cn("relative", unfiltered &&"opacity-65")}
 >
 <TimeOfDayChart data={data.timeOfDay} />
 </motion.div>
 <motion.div variants={staggerItem} className="relative">
 <EfficiencyChart data={filteredEfficiency} />
 </motion.div>
 <motion.div
 variants={staggerItem}
 className="relative min-[900px]:col-span-2"
 >
 <ConsistencyHeatmap
 days={data.consistency.days}
 stats={data.consistency.stats}
 />
 </motion.div>
 </motion.div>
 </motion.div>
 </AnimatePresence>
 </motion.div>
 </motion.div>
 </motion.div>
 </ScrollArea>
 )
})

export const AnalyticsView = AnalyticsViewInner

/* ----------------------------- Sub-components ----------------------------- */

function RangeToggle({
 value,
 onChange,
 reduceMotion,
}: {
 value: AnalyticsRange
 onChange: (v: AnalyticsRange) => void
 reduceMotion: boolean
}) {
 return (
 <div className="flex gap-0.5 rounded-xl border border-border/70 bg-background/55 p-0.5">
 {RANGE_OPTIONS.map((opt) => {
 const isActive = value === opt.value
 return (
 <motion.button
 key={opt.value}
 type="button"
 onClick={() => onChange(opt.value)}
 whileHover={reduceMotion ? undefined : { y: -1 }}
 whileTap={reduceMotion ? undefined : { scale: 0.96 }}
 transition={
 reduceMotion
 ? REDUCED_TRANSITION
 : { type:"spring", stiffness: 520, damping: 34, mass: 0.65 }
 }
 className={cn(
"rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
 isActive
 ?"bg-background text-foreground shadow-sm"
 :"text-muted-foreground hover:text-foreground",
 )}
 aria-pressed={isActive}
 >
 {opt.label}
 </motion.button>
 )
 })}
 </div>
 )
}

function KpiStrip({
 totalMinutes,
 dailyAverage,
 daysStudied,
 totalDays,
 currentStreak,
 filterActive,
 reduceMotion,
}: {
 totalMinutes: number
 dailyAverage: number
 daysStudied: number
 totalDays: number
 currentStreak: number
 filterActive: boolean
 reduceMotion: boolean
}) {
 return (
 <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
 <KpiCard
 label="Total time"
 value={formatMinutesShort(totalMinutes)}
 sub={filterActive ?"filtered" : undefined}
 reduceMotion={reduceMotion}
 />
 <KpiCard
 label="Daily average"
 value={formatMinutesLong(dailyAverage)}
 sub={filterActive ?"filtered" : undefined}
 reduceMotion={reduceMotion}
 />
 <KpiCard
 label="Days studied"
 value={`${daysStudied} / ${totalDays}`}
 reduceMotion={reduceMotion}
 />
 <KpiCard
 label="Current streak"
 value={`${currentStreak}d`}
 reduceMotion={reduceMotion}
 />
 </div>
 )
}

function KpiCard({
 label,
 value,
 sub,
 reduceMotion,
}: {
 label: string
 value: string
 sub?: string
 reduceMotion: boolean
}) {
 return (
 <motion.div
 whileHover={hoverLift(reduceMotion)}
 className="relative rounded-2xl"
 >
 <Card className="rounded-2xl bg-background/48 border-border/70 px-4 py-3 backdrop-blur shadow-sm">
 <div className="text-2xl font-semibold tabular-nums leading-tight">
 {value}
 </div>
 <div className="mt-1 text-caption text-muted-foreground">
 {label}
 {sub ? (
 <span className="text-muted-foreground/70"> · {sub}</span>
 ) : null}
 </div>
 </Card>
 </motion.div>
 )
}

function SubjectFilterChips({
 subjectIds,
 activeIds,
 selectionState,
 onToggle,
 onSelectAll,
 reduceMotion,
}: {
 subjectIds: string[]
 activeIds: Set<string>
 selectionState:"all" |"partial"
 onToggle: (sid: string) => void
 onSelectAll: () => void
 reduceMotion: boolean
}) {
 return (
 <div className="flex items-center gap-1.5 overflow-x-auto py-1">
 <FilterChip
 onClick={onSelectAll}
 active={selectionState ==="all"}
 reduceMotion={reduceMotion}
 >
 All
 </FilterChip>
 <div className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />
 {subjectIds.map((sid) => {
 const subject = getSubjectById(sid)
 const color = getSubjectColor(sid)
 const isActive = activeIds.has(sid)
 return (
 <FilterChip
 key={sid}
 onClick={() => onToggle(sid)}
 active={isActive}
 reduceMotion={reduceMotion}
 color={color}
 >
 {subject?.name ??"Unassigned"}
 </FilterChip>
 )
 })}
 </div>
 )
}

function FilterChip({
 onClick,
 active,
 reduceMotion,
 color,
 children,
}: {
 onClick: () => void
 active: boolean
 reduceMotion: boolean
 color?: string
 children: ReactNode
}) {
 return (
 <motion.button
 type="button"
 onClick={onClick}
 aria-pressed={active}
 whileHover={reduceMotion ? undefined : { y: -1 }}
 whileTap={reduceMotion ? undefined : { scale: 0.96 }}
 transition={
 reduceMotion
 ? REDUCED_TRANSITION
 : { type:"spring", stiffness: 520, damping: 34, mass: 0.65 }
 }
 className={cn(
"inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors",
 active
 ?"border-foreground/25 bg-background/70 text-foreground"
 :"border-border/60 bg-background/30 text-muted-foreground hover:text-foreground",
 )}
 >
 {color ? (
 <span
 className="h-2 w-2 rounded-full"
 style={{ backgroundColor: color, opacity: active ? 1 : 0.35 }}
 />
 ) : null}
 {children}
 </motion.button>
 )
}
