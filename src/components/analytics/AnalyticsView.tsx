import { useState, useMemo, useCallback, memo } from"react"
import type { ReactNode } from"react"
import { motion, AnimatePresence, useReducedMotion } from"framer-motion"
import { ScrollArea, ScrollBar } from"@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
 getAnalyticsData,
 getConsistencyForTimeTrends,
 getStudyPeriodComparison,
 type AnalyticsRange,
 type ConsistencyDay,
 type SubjectMinutes,
 type StudyTimePoint,
 type TimeOfDayBucket,
} from"@/lib/analytics"
import type { CalendarEvent, PriorityItem, Project, StudySession } from"@/lib/types"
import { cn, getSubjectById } from"@/lib/utils"
import { getPriorityItems, readFocusPriorities } from "@/lib/studyPriority"
import { ArrowRight, Download, Play, Target } from "lucide-react"
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
 events: CalendarEvent[]
 onNewSession: () => void
 onSelectProject: (projectId: string) => void
 onStartFocus: (item: PriorityItem) => void
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

function formatDay(date: string) {
 return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
 weekday:"short",
 month:"short",
 day:"numeric",
 })
}

function formatHour(hour: number) {
 return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
 hour:"numeric",
 minute:"2-digit",
 })
}

function formatComparison(
 comparison: ReturnType<typeof getStudyPeriodComparison>,
 range: AnalyticsRange,
 filterActive: boolean,
) {
 const filtered = filterActive ?" · filtered" :""
 if (comparison == null) return filterActive ?"filtered" : undefined
 if (comparison.previousMinutes === 0) {
 return comparison.currentMinutes > 0 ? `new vs previous ${range}d${filtered}` : `no change${filtered}`
 }
 const change = comparison.changePercent ?? 0
 return `${change > 0 ?"+" :""}${change}% vs previous ${range}d${filtered}`
}

function getHighlights(
 breakdown: SubjectMinutes[],
 days: ConsistencyDay[],
 timeOfDay: TimeOfDayBucket[],
) {
 const bestDay = days.reduce<ConsistencyDay | null>(
 (best, day) => day.minutes > (best?.minutes ?? 0) ? day : best,
 null,
 )
 const peakHour = timeOfDay.reduce<TimeOfDayBucket | null>(
 (best, bucket) => bucket.minutes > (best?.minutes ?? 0) ? bucket : best,
 null,
 )
 return {
 bestDay: bestDay && bestDay.minutes > 0 ? bestDay : null,
 peakHour: peakHour && peakHour.minutes > 0 ? peakHour : null,
 topSubjectId: breakdown[0]?.subjectId ?? null,
 }
}

function exportAnalyticsCsv(points: StudyTimePoint[], range: AnalyticsRange) {
 const rows = ["date,subject,minutes,hours"]
 for (const point of points) {
 const subject = getSubjectById(point.subjectId)?.name ??"Unassigned"
 rows.push([
 point.date,
 csvEscape(subject),
 point.minutes,
 Math.round((point.minutes / 60) * 100) / 100,
 ].join(","))
 }
 const blob = new Blob(["\uFEFF", rows.join("\n")], { type:"text/csv;charset=utf-8" })
 const url = URL.createObjectURL(blob)
 const anchor = document.createElement("a")
 anchor.href = url
 anchor.download = `focal-analytics-${range === 0 ?"all" : `${range}d`}-${new Date().toISOString().slice(0, 10)}.csv`
 document.body.appendChild(anchor)
 anchor.click()
 anchor.remove()
 URL.revokeObjectURL(url)
}

function csvEscape(value: string) {
 return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

const AnalyticsViewInner = memo(function AnalyticsViewInner({
 sessions,
 projects,
 events,
 onNewSession,
 onSelectProject,
 onStartFocus,
}: AnalyticsViewProps) {
 const reduceMotion = useReducedMotion() === true
 const [range, setRange] = useState<AnalyticsRange>(30)
 const [selectedSubjects, setSelectedSubjects] = useState<Set<string> | null>(null)
 const focusPriorities = useMemo(readFocusPriorities, [])
 const decisions = useMemo(
 () => getPriorityItems({
 projects,
 sessions,
 events,
 subjectOrder: focusPriorities.subjectOrder,
 pinnedEventIds: focusPriorities.pinnedEventIds,
 }).filter((item) => item.kind === "weak-topic" || item.kind === "overdue-project" || item.kind === "plan-prep").slice(0, 3),
 [events, focusPriorities.pinnedEventIds, focusPriorities.subjectOrder, projects, sessions],
 )

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
 () => selectedSubjects == null
 ? new Set(allSubjectIds)
 : new Set(allSubjectIds.filter((subjectId) => selectedSubjects.has(subjectId))),
 [selectedSubjects, allSubjectIds],
 )

 const selectionState:"all" |"partial" = !isFilterActive || activeSet.size === allSubjectIds.length
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
 (p) => activeSet.has(p.subjectId ??"_unassigned"),
 )
 : data.timeTrends,
 [data.timeTrends, activeSet, isFilterActive],
 )
 const filteredConsistency = useMemo(
 () => isFilterActive
 ? getConsistencyForTimeTrends(data.consistency.days, filteredTimeTrends)
 : data.consistency,
 [data.consistency, filteredTimeTrends, isFilterActive],
 )
 const filteredTimeOfDay = useMemo(() => {
 if (!isFilterActive) return data.timeOfDay
 const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: 0 }))
 for (const bucket of data.timeOfDayBySubject) {
 if (activeSet.has(bucket.subjectId)) buckets[bucket.hour].minutes += bucket.minutes
 }
 return buckets
 }, [activeSet, data.timeOfDay, data.timeOfDayBySubject, isFilterActive])

 const filteredTotalMinutes = useMemo(
 () => filteredBreakdown.reduce((s, d) => s + d.minutes, 0),
 [filteredBreakdown],
 )
 const filteredDailyAverage = useMemo(
 () =>
 filteredConsistency.days.length > 0
 ? Math.round(filteredTotalMinutes / filteredConsistency.days.length)
 : 0,
 [filteredTotalMinutes, filteredConsistency.days.length],
 )
 const periodComparison = useMemo(
 () => getStudyPeriodComparison(sessions, projects, range, isFilterActive ? activeSet : undefined),
 [activeSet, isFilterActive, projects, range, sessions],
 )
 const highlights = useMemo(
 () => getHighlights(filteredBreakdown, filteredConsistency.days, filteredTimeOfDay),
 [filteredBreakdown, filteredConsistency.days, filteredTimeOfDay],
 )

 const handleExport = useCallback(() => {
 exportAnalyticsCsv(filteredTimeTrends, range)
 }, [filteredTimeTrends, range])

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
 return (
 <ScrollArea className="h-full">
 <div className="space-y-5 px-6 py-5 min-[1200px]:px-8 min-[1200px]:py-6">
 <div className="border-b border-border/70 pb-4">
 <h1 className="text-xl font-semibold tracking-tight">Review</h1>
 <p className="mt-1 text-sm text-muted-foreground">Study patterns, follow-through, and the decisions that matter next.</p>
 </div>
 <ReviewDecisions items={decisions} onNewSession={onNewSession} onSelectProject={onSelectProject} onStartFocus={onStartFocus} />
 <div className="h-72 rounded-lg border"><EmptyAnalytics onNewSession={onNewSession} /></div>
 </div>
 </ScrollArea>
 )
 }

 return (
 <ScrollArea className="h-full">
 <motion.div
 className="px-6 py-5 min-[1200px]:px-8 min-[1200px]:py-6"
 initial={reduceMotion ? false : { opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 transition={reduceMotion ? REDUCED_TRANSITION : TRANSITION.view}
 >
 <motion.div
 className="space-y-5"
 variants={staggerContainer(0.06, 0.05)}
 initial={reduceMotion ? false :"initial"}
 animate={reduceMotion ? undefined :"animate"}
 >
 {/* Header row */}
 <motion.div
 variants={staggerItem}
 className="flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4"
 >
 <div>
 <h1 className="text-xl font-semibold tracking-tight">Review</h1>
 <p className="mt-1 text-sm text-muted-foreground">Study patterns, follow-through, and the decisions that matter next.</p>
 </div>
 <div className="flex items-center gap-2">
 <Button
 type="button"
 size="sm"
 variant="outline"
 onClick={handleExport}
 disabled={filteredTimeTrends.length === 0}
 >
 <Download /> Export CSV
 </Button>
 <RangeToggle value={range} onChange={setRange} reduceMotion={reduceMotion} />
 </div>
 </motion.div>
 <motion.div variants={staggerItem}>
 <ReviewDecisions items={decisions} onNewSession={onNewSession} onSelectProject={onSelectProject} onStartFocus={onStartFocus} />
 </motion.div>
 <motion.div variants={staggerItem}>
 <KpiStrip
 totalMinutes={filteredTotalMinutes}
 dailyAverage={filteredDailyAverage}
 daysStudied={filteredConsistency.stats.totalStudyDays}
 totalDays={filteredConsistency.days.length}
 currentStreak={filteredConsistency.stats.currentStreak}
 longestStreak={filteredConsistency.stats.longestStreak}
 comparison={periodComparison}
 range={range}
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

 <motion.div variants={staggerItem}>
 <AnalyticsHighlights {...highlights} />
 </motion.div>

 {/* Chart grid: crossfade on range change, cards stagger on mount */}
 <motion.div variants={staggerItem} className="relative">
 <AnimatePresence mode="wait">
 <motion.div
 key={range}
 initial={reduceMotion ? false : { opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 transition={reduceMotion ? REDUCED_TRANSITION : { duration: MOTION_DURATION.fast, ease: MOTION_EASE }}
 >
 <motion.div
 variants={staggerContainer(0.05, 0)}
 initial={reduceMotion ? false :"initial"}
 animate={reduceMotion ? undefined :"animate"}
 className="grid grid-cols-1 gap-x-7 gap-y-6 min-[900px]:grid-cols-2"
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
 className="relative"
 >
 <TimeOfDayChart data={filteredTimeOfDay} />
 </motion.div>
 <motion.div variants={staggerItem} className="relative">
 <EfficiencyChart data={filteredEfficiency} />
 </motion.div>
 <motion.div
 variants={staggerItem}
 className="relative min-[900px]:col-span-2"
 >
 <ConsistencyHeatmap
 days={filteredConsistency.days}
 stats={filteredConsistency.stats}
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

function ReviewDecisions({
 items,
 onNewSession,
 onSelectProject,
 onStartFocus,
}: {
 items: PriorityItem[]
 onNewSession: () => void
 onSelectProject: (projectId: string) => void
 onStartFocus: (item: PriorityItem) => void
}) {
 return (
 <section className="border-t border-border/70 pt-5">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div>
 <h3 className="flex items-center gap-2 text-sm font-semibold"><Target className="size-4 text-primary" />Decide what changes next</h3>
 <p className="mt-1 text-sm text-muted-foreground">These are the gaps your calendar and reflections say need a decision.</p>
 </div>
 <Button size="sm" variant="outline" onClick={() => onNewSession()}>Plan a recovery session</Button>
 </div>
 <div className="mt-3 grid divide-y divide-border/50 border-y border-border/60 min-[900px]:grid-cols-3 min-[900px]:divide-x min-[900px]:divide-y-0">
 {items.length > 0 ? items.map((item) => (
 <div key={item.id} className="flex min-w-0 items-center gap-2 p-3">
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-medium">{item.title}</p>
 <p className="line-clamp-2 text-sm text-muted-foreground">{item.reason}</p>
 </div>
 {item.projectId && <Button variant="ghost" size="icon-sm" onClick={() => onSelectProject(item.projectId!)} aria-label={`Open ${item.title}`}><ArrowRight /></Button>}
 <Button variant="outline" size="icon-sm" disabled={item.subjectIds.length === 0} onClick={() => onStartFocus(item)} aria-label={`Start focus for ${item.title}`}><Play /></Button>
 </div>
 )) : <p className="text-sm text-muted-foreground">Nothing is overdue or flagged by a low-confidence reflection.</p>}
 </div>
 </section>
 )
}

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
 <div className="flex gap-0.5 rounded-md border border-border/70 bg-background/55 p-0.5">
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
 longestStreak,
 comparison,
 range,
 filterActive,
 reduceMotion,
}: {
 totalMinutes: number
 dailyAverage: number
 daysStudied: number
 totalDays: number
 currentStreak: number
 longestStreak: number
 comparison: ReturnType<typeof getStudyPeriodComparison>
 range: AnalyticsRange
 filterActive: boolean
 reduceMotion: boolean
}) {
 return (
 <div className="grid grid-cols-2 divide-x divide-y divide-border/50 border-y border-border/60 sm:grid-cols-4 sm:divide-y-0">
 <KpiCard
 label="Total time"
 value={formatMinutesShort(totalMinutes)}
 sub={formatComparison(comparison, range, filterActive)}
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
 sub={`best ${longestStreak}d`}
 reduceMotion={reduceMotion}
 />
 </div>
 )
}

function AnalyticsHighlights({
 bestDay,
 peakHour,
 topSubjectId,
}: {
 bestDay: { date: string; minutes: number } | null
 peakHour: { hour: number; minutes: number } | null
 topSubjectId: string | null
}) {
 const topSubject = topSubjectId ? getSubjectById(topSubjectId) : null
 return (
 <section className="border-t border-border/70 pt-5">
 <h3 className="text-sm font-semibold">Highlights</h3>
 <div className="mt-3 grid divide-y divide-border/50 border-y border-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
 <Highlight label="Most productive day" value={bestDay ? formatDay(bestDay.date) : "No study yet"} detail={bestDay ? formatMinutesLong(bestDay.minutes) : undefined} />
 <Highlight label="Peak study hour" value={peakHour ? formatHour(peakHour.hour) : "No pattern yet"} detail={peakHour ? formatMinutesLong(peakHour.minutes) : undefined} />
 <Highlight label="Most studied subject" value={topSubject?.name ?? (topSubjectId ? "Unassigned" : "No subject yet")} />
 </div>
 </section>
 )
}

function Highlight({ label, value, detail }: { label: string; value: string; detail?: string }) {
 return (
 <div className="px-3 py-2.5">
 <p className="text-caption text-muted-foreground">{label}</p>
 <p className="mt-1 truncate text-sm font-medium">{value}</p>
 {detail ? <p className="text-caption tabular-nums text-muted-foreground">{detail}</p> : null}
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
 className="relative px-4 py-3 transition-colors hover:bg-accent/20"
 >
 <div className="text-2xl font-semibold tabular-nums leading-tight">
 {value}
 </div>
 <div className="mt-1 text-caption text-muted-foreground">
 {label}
 {sub ? (
 <span className="text-muted-foreground/70"> · {sub}</span>
 ) : null}
 </div>
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
 <ScrollArea className="w-full whitespace-nowrap">
 <div className="flex items-center gap-1.5 py-1">
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
 <ScrollBar orientation="horizontal" />
 </ScrollArea>
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
