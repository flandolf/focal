import { useState, useCallback, useEffect, useMemo, useRef } from"react";
import { motion, AnimatePresence, useReducedMotion } from"framer-motion";
import ReactMarkdown from"react-markdown";
import {
 AlertCircle,
 BookOpen,
 Brain,
 Calendar,
 Check,
 CheckCircle2,
 ClipboardCopy,
 Eraser,
 Loader2,
 MessageSquareText,
 PanelRightClose,
 RefreshCw,
 Send,
 Sparkles,
 Square,
 Wand2,
 X,
} from"lucide-react";
import { Button } from"@/components/ui/button";
import { Textarea } from"@/components/ui/textarea";
import {
 Tooltip,
 TooltipContent,
 TooltipTrigger,
} from"@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from"@/components/ui/scroll-area";
import { TRANSITION, staggerContainer, staggerItem } from"@/lib/motion";
import { cn, combineDateAndTime, getLocalDateValue } from"@/lib/utils";
import { showUndoToast } from"@/lib/undoToast";
import { getAssistantPersonalityInstruction } from"@/lib/settings";
import { toast } from"sonner";
import {
 aiChatCompletion,
 aiChatCompletionResult,
 aiStructuredCompletion,
 buildUserBriefing,
 describeAiError,
 VCE_SYSTEM_PREAMBLE,
 type ChatTurn,
} from"@/lib/aiAssistant";
import {
 getActiveProvider,
 getEffectiveModel,
 type ToolCall,
 type ToolDefinition,
} from"@/lib/providers";
import type {
 Project,
 StudySession,
 CalendarEvent,
 Subject,
 EventType,
} from"@/lib/types";

const SUGGESTED_PROMPTS = [
 {
 label:"Brief the week",
 prompt:"Summarise this week's upcoming deadlines in 3 bullet points.",
 },
 {
 label:"Find a plan gap",
 prompt:
"Compare my upcoming deadlines with planned study sessions. Find the highest-risk gap and suggest one specific study block.",
 },
 {
 label:"Improve my plan",
 prompt:
"Review my next 7 days and suggest the single change that would most improve my study plan.",
 },
 {
 label:"Explain a method",
 prompt:"Explain active recall vs spaced repetition in plain English.",
 },
] as const;

const QUICK_ACTION_PROMPTS = [
 {
 label:"Plan the week",
 prompt:
"Read my current deadlines and study sessions, then propose an ordered week-by-week study plan with specific blocks. Keep it under 250 words.",
 },
 {
 label:"Brief SACs",
 prompt:
"List my next 3 SACs in date order with a one-line prep tactic for each. Use today's date as the anchor.",
 },
 {
 label:"Spot weak subjects",
 prompt:
"Which subject has the biggest gap between upcoming assessments and planned minutes? Suggest one concrete remedy.",
 },
 {
 label:"Active recall",
 prompt:
"Give me a 5-minute active-recall routine I can run before any SAC.",
 },
] as const;

const CREATION_QUICK_ACTIONS = [
 {
 label:"Schedule session",
 icon: BookOpen,
 intent:"session" as const,
 prompt:
"Suggest a study session based on my upcoming deadlines and weak subjects. Pick a sensible title, subject, start/end time (use ISO 8601), and an optional description.",
 },
 {
 label:"Add event",
 icon: Calendar,
 intent:"event" as const,
 prompt:
"Suggest a calendar event based on my upcoming deadlines. Pick a sensible title, event type, start time (use ISO 8601), optional end time, optional subject, and optional description.",
 },
] as const;

const ASSISTANT_WIDTH_KEY ="focal-ai-assistant-width";
const PERSIST_CONVERSATION_KEY ="focal-ai-assistant-conversation";
const FOCUS_MODE_EVENT ="focal-focus-mode-changed";
const ASSISTANT_WIDTH_DEFAULT = 320;
const ASSISTANT_WIDTH_MIN = 260;
const ASSISTANT_WIDTH_MAX = 640;
const ASSISTANT_WIDTH_STEP = 16;
const ASSISTANT_MAX_TOKENS = 600;
const FOCAL_AGENT_MAX_TURNS = 4;

// ponytail: ~4 chars/16ms splash ≈ 250 chars/sec — short enough to feel
// responsive, long enough that a 600-token reply paints in ~1.5s without
// hammering the React reconciler. Reduced-motion branch jumps the typewriter
// to the full string in one frame.
const TYPEWRITER_CHARS_PER_TICK = 4;
const TYPEWRITER_TICK_MS = 16;

interface AiAssistantPanelProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onOpenSettings?: () => void;
 sessions?: StudySession[];
 events?: CalendarEvent[];
 projects?: Project[];
 subjects?: Subject[];
 onCreateSession?: (data: {
 projectId?: string;
 subjectIds: string[];
 title: string;
 startTime: string;
 endTime: string;
 description?: string;
 notes?: string;
 }) => Promise<unknown> | void;
 onUpdateSession?: (
 id: string,
 updates: Partial<Omit<StudySession,"id" |"created_at">>,
 ) => Promise<unknown> | void;
 onCreateEvent?: (data: {
 title: string;
 startTime: string;
 endTime?: string;
 eventType: EventType;
 subjectId?: string;
 description?: string;
 location?: string;
 }) => Promise<unknown> | void;
 onUpdateEvent?: (data: {
 id: string;
 title: string;
 startTime: string;
 endTime?: string;
 eventType: EventType;
 subjectId?: string;
 description?: string;
 location?: string;
 isFinished?: boolean;
 finishedAt?: string;
 }) => Promise<unknown> | void;
 onDeleteEvent?: (id: string) => Promise<unknown> | void;
 contextRefs?: {
 project?: Project | null;
 focusModeActive?: boolean;
 };
}

interface DraftStudySession {
 title: string;
 subjectIds: string[];
 projectId?: string;
 startTime: string;
 endTime: string;
 description?: string;
 notes?: string;
}

interface DraftEvent {
 title: string;
 eventType: EventType;
 startTime: string;
 endTime?: string;
 subjectId?: string;
 description?: string;
 location?: string;
}

type EventToolAction =
 |"none"
 |"list_events"
 |"get_event"
 |"create_event"
 |"update_event"
 |"delete_event";

interface EventToolData {
 title?: string;
 eventType?: EventType;
 startTime?: string;
 endTime?: string;
 subjectId?: string;
 description?: string;
 location?: string;
 isFinished?: boolean;
 finishedAt?: string;
}

interface EventToolCall {
 action: EventToolAction;
 eventId?: string;
 query?: string;
 startDate?: string;
 endDate?: string;
 data?: EventToolData;
}

interface Message {
 id: string;
 role:"user" |"assistant";
 content: string;
 pending?: boolean;
 cancelled?: boolean;
 followUps?: string[];
 toolActivity?: {
 name: string;
 status:"running" |"done" |"failed";
 };
 draft?: {
 type:"session" |"event";
 data: DraftStudySession | DraftEvent;
 };
}

interface PersistedMessage {
 id: string;
 role:"user" |"assistant";
 content: string;
 followUps?: string[];
}

function clampAssistantWidth(value: number): number {
 if (!Number.isFinite(value)) return ASSISTANT_WIDTH_DEFAULT;
 return Math.min(ASSISTANT_WIDTH_MAX, Math.max(ASSISTANT_WIDTH_MIN, value));
}

function readPersistedAssistantWidth(): number {
 try {
 const stored = localStorage.getItem(ASSISTANT_WIDTH_KEY);
 if (!stored) return ASSISTANT_WIDTH_DEFAULT;
 const parsed = parseInt(stored, 10);
 return clampAssistantWidth(parsed);
 } catch {
 return ASSISTANT_WIDTH_DEFAULT;
 }
}

function readPersistedConversation(): Message[] {
 try {
 const raw = localStorage.getItem(PERSIST_CONVERSATION_KEY);
 if (!raw) return [];
 const parsed: unknown = JSON.parse(raw);
 if (!Array.isArray(parsed)) return [];
 return parsed.flatMap((entry): Message[] => {
 if (typeof entry !=="object" || entry === null) return [];
 const record = entry as Record<string, unknown>;
 if (
 (record.role !=="user" && record.role !=="assistant") ||
 typeof record.content !=="string" ||
 typeof record.id !=="string"
 ) {
 return [];
 }
 const followUps = Array.isArray(record.followUps)
 ? record.followUps
 .filter((item): item is string => typeof item ==="string")
 .slice(0, 3)
 : undefined;
 return [
 {
 id: record.id,
 role: record.role,
 content: record.content,
 followUps,
 },
 ];
 });
 } catch {
 return [];
 }
}

function writePersistedConversation(messages: Message[]): void {
 try {
 const persistable: PersistedMessage[] = messages
 .filter(
 (m) =>
 !m.pending && !m.cancelled && !m.toolActivity && m.content.length > 1,
 )
 .map((m) => ({
 id: m.id,
 role: m.role,
 content: m.content,
 followUps: m.followUps,
 }));
 if (persistable.length === 0) {
 localStorage.removeItem(PERSIST_CONVERSATION_KEY);
 return;
 }
 localStorage.setItem(PERSIST_CONVERSATION_KEY, JSON.stringify(persistable));
 } catch {
 // localStorage unavailable (private mode, etc); in-memory state still works.
 }
}

function isChatHistoryMessage(message: Message): boolean {
 return !message.pending && !message.cancelled && !message.toolActivity;
}

function makeId(): string {
 return typeof crypto !=="undefined" &&"randomUUID" in crypto
 ? crypto.randomUUID()
 : Math.random().toString(36).slice(2);
}

// eslint-disable-next-line react-refresh/only-export-components
export function extractFollowUpPrompts(raw: string): {
 content: string;
 followUps: string[];
} {
 const followUps: string[] = [];
 const content = raw
 .replace(/\[\[follow-up:\s*(.+?)\s*\]\]/gi, (_match, prompt: string) => {
 const value = prompt.trim();
 if (value && !followUps.includes(value) && followUps.length < 3)
 followUps.push(value);
 return"";
 })
 .replace(/\n{3,}/g,"\n\n")
 .trim();
 return { content, followUps };
}

function projectContextLine(project: Project): string {
 const subject = project.subjectId ? ` (subject ${project.subjectId})` :"";
 const deadline = project.deadline ? ` with deadline ${project.deadline}` :"";
 return `User is currently looking at the assessment "${project.name}"${subject}${deadline}.`;
}

function buildContextBits(
 contextRefs: AiAssistantPanelProps["contextRefs"],
 focusModeActiveFallback: boolean,
): string {
 const bits: string[] = [];
 const project = contextRefs?.project;
 if (project) bits.push(projectContextLine(project));
 if (contextRefs?.focusModeActive ?? focusModeActiveFallback) {
 bits.push(
"User is in a Pomodoro focus block right now; if they ask for help, keep replies short so they can return to the timer.",
 );
 }
 return bits.length > 0 ? `\n${bits.join("\n")}` :"";
}

// ponytail: concise snapshot of upcoming events + sessions so the AI has
// real visibility into the calendar without hallucinating. Bounded to keep
// system prompt under ~250 tokens.
function buildCalendarContext(
 events: CalendarEvent[] | undefined,
 sessions: StudySession[] | undefined,
 today: string,
): string {
 if (!events?.length && !sessions?.length) return"";
 const lines: string[] = [];
 const now = new Date(`${today}T00:00:00`).getTime();
 const horizon = now + 14 * 24 * 60 * 60 * 1000;

 const upcomingEvents = (events ?? [])
 .filter(
 (e) =>
 new Date(e.startTime).getTime() >= now &&
 new Date(e.startTime).getTime() <= horizon,
 )
 .sort(
 (a, b) =>
 new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
 )
 .slice(0, 5);
 const upcomingSessions = (sessions ?? [])
 .filter(
 (s) =>
 new Date(s.startTime).getTime() >= now &&
 new Date(s.startTime).getTime() <= horizon,
 )
 .sort(
 (a, b) =>
 new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
 )
 .slice(0, 5);

 if (upcomingEvents.length > 0) {
 lines.push(
 `- Upcoming events: ${upcomingEvents.map((e) => `"${e.title}" ${e.startTime.slice(0, 10)}${e.eventType ? ` (${e.eventType})` :""}`).join(";")}`,
 );
 }
 if (upcomingSessions.length > 0) {
 lines.push(
 `- Upcoming sessions: ${upcomingSessions.map((s) => `"${s.title}" ${s.startTime.slice(0, 10)}`).join(";")}`,
 );
 }
 if (lines.length === 1) return `Calendar snapshot: ${lines[0].slice(2)}`;
 return lines.length > 0 ? `Calendar snapshot:\n${lines.join("\n")}` :"";
}

function dateOnlyMs(value: string): number | null {
 const ms = new Date(`${value.slice(0, 10)}T00:00:00`).getTime();
 return Number.isFinite(ms) ? ms : null;
}

function daysFromToday(date: string, today: string): number | null {
 const target = dateOnlyMs(date);
 const anchor = dateOnlyMs(today);
 if (target === null || anchor === null) return null;
 return Math.round((target - anchor) / (24 * 60 * 60 * 1000));
}

function endOfWeekDate(today: string): string {
 const date = new Date(`${today}T00:00:00`);
 date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
 return getLocalDateValue(date);
}

function relativeDeadlineLabel(days: number): string {
 if (days < 0) return `${Math.abs(days)} day${days === -1 ?"" :"s"} overdue`;
 if (days === 0) return"today";
 if (days === 1) return"tomorrow";
 return `in ${days} days`;
}

interface AssistantOverview {
 title: string;
 detail: string;
 prompt: string;
 hasFocalContext: boolean;
}

function formatPlannedTime(minutes: number): string {
 if (minutes < 60) return `${minutes} min`;
 const hours = Math.floor(minutes / 60);
 const remainder = minutes % 60;
 return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildAssistantOverview(
 projects: Project[] | undefined,
 sessions: StudySession[] | undefined,
 today: string,
 currentProject?: Project | null,
): AssistantOverview {
 const nextDeadline = (projects ?? [])
 .filter(
 (project) =>
 !project.isFinished && !project.isArchived && project.deadline,
 )
 .sort((a, b) =>
 (a.deadline ??"9999").localeCompare(b.deadline ??"9999"),
 )[0];
 const todayMs = dateOnlyMs(today) ?? 0;
 const nextWeekMs = todayMs + 7 * 24 * 60 * 60 * 1000;
 const planned = (sessions ?? []).filter((session) => {
 const start = new Date(session.startTime).getTime();
 return (
 session.status !=="completed" && start >= todayMs && start <= nextWeekMs
 );
 });
 const plannedMinutes = planned.reduce((total, session) => {
 const duration =
 new Date(session.endTime).getTime() -
 new Date(session.startTime).getTime();
 return total + Math.max(0, Math.round(duration / 60_000));
 }, 0);
 const plannedDetail =
 planned.length > 0
 ? `${planned.length} study block${planned.length === 1 ?"" :"s"} · ${formatPlannedTime(plannedMinutes)} planned for the next 7 days`
 :"No study blocks planned for the next 7 days";

 if (nextDeadline?.deadline) {
 const days = daysFromToday(nextDeadline.deadline, today);
 const timing =
 days === null
 ? nextDeadline.deadline.slice(0, 10)
 : days < 0
 ? `${Math.abs(days)} day${days === -1 ?"" :"s"} overdue`
 : relativeDeadlineLabel(days);
 return {
 title:
 days !== null && days < 0
 ? `${nextDeadline.name} is ${timing}`
 : `${nextDeadline.name} is due ${timing}`,
 detail: plannedDetail,
 prompt: `Help me prepare for "${nextDeadline.name}", due ${nextDeadline.deadline.slice(0, 10)}. Check my current study sessions and suggest the single best next study block.`,
 hasFocalContext: true,
 };
 }

 if (currentProject) {
 return {
 title: `Plan the next step for ${currentProject.name}`,
 detail: plannedDetail,
 prompt: `I'm working on "${currentProject.name}". Check its details and my current study sessions, then suggest the single best next study block.`,
 hasFocalContext: true,
 };
 }

 const activeProjects = (projects ?? []).filter(
 (project) => !project.isFinished && !project.isArchived,
 );
 if (activeProjects.length > 0 || planned.length > 0) {
 return {
 title:"Turn your current workload into a plan",
 detail: `${activeProjects.length} active assessment${activeProjects.length === 1 ?"" :"s"} · ${plannedDetail.toLowerCase()}`,
 prompt:
"Review my active assessments and planned study sessions, then suggest the single best next study block.",
 hasFocalContext: true,
 };
 }

 return {
 title:"Fast answers for the next study decision",
 detail:
"Ask for a concise plan, explanation, or deadline check without leaving the workspace.",
 prompt:"Help me choose one useful 45-minute study block for today.",
 hasFocalContext: false,
 };
}

function buildSystemMessage(
 contextDay: string,
 providerName: string,
 contextLine: string,
 calendarContext: string,
 briefing: string,
): string {
 const parts = [
 VCE_SYSTEM_PREAMBLE,
 `Today is ${contextDay}. The user is talking to ${providerName}. Use the user's existing Focal context when relevant, but never invent specific page numbers, marks, or rubric items.`,
 ];
 if (briefing) parts.push(briefing);
 if (calendarContext) parts.push(calendarContext);
 if (contextLine) parts.push(contextLine);
 parts.push(getAssistantPersonalityInstruction());
 parts.push(
 `When a reply has genuinely useful next steps, end with up to 3 clickable follow-up prompts using exactly this syntax: [[follow-up: message]]. The text must be a concise message written in the user's voice that they could send verbatim, such as"Plan those sessions for me". Offer prompts only when the answer naturally branches or a useful action remains. Do not add them to simple factual answers, errors, confirmations, or every reply. Never mention this syntax.`,
 );
 return parts.join("\n\n");
}

function buildFocalAgentSystemMessage(
 baseSystemMessage: string,
 contextDay: string,
): string {
 return `${baseSystemMessage}

You are in a Focal tool-using agent loop. Use tools before answering any request that depends on the user's current Focal data: deadlines, assessments/projects, study sessions, subjects, calendar events, or event edits. You may answer general study advice directly when it does not need Focal data.

Tool rules:
- Never say you do not have Focal information until the relevant tool returns no matches.
- For SAC, exam, assignment, assessment, deadline, due-date, next, or upcoming assessment questions, call list_deadlines before the final answer.
- If the user asks for"next 3 SACs" or similar, call list_deadlines with query"sac" and range"all_upcoming", then answer from the earliest results.
- For study-session questions, call list_study_sessions.
- For workload, prioritization, or"what should I do next?" questions, call get_study_overview.
- Base prioritization on the returned deadline, planned-time, and coverage-gap evidence. Name the evidence briefly, then recommend one concrete next block instead of generic study tips.
- Use create_study_session only when the user explicitly asks to create or schedule a session. Resolve project and subject ids first when needed.
- Use update_study_session when the user explicitly asks to reschedule, rename, complete, or edit a study session. Call list_study_sessions first when the session id is unknown; never guess between multiple matches.
- For subject ids, call list_subjects when unsure.
- If you call list_subjects for an assessment-date question, you must still call list_deadlines before answering.
- For event create/update/delete/read requests, use the event tools. The app confirms destructive deletion.
- After tool results arrive, answer naturally and briefly from the tool result.
- Do not tell the user to use an external calendar app.

Today is ${contextDay}. Date phrases are relative to this date. Tool range values include this_week, next_7_days, next_14_days, all_upcoming, and all. Use only these event types: ${EVENT_TYPE_ENUM.join(", ")}.`;
}

const SESSION_DRAFT_SCHEMA = {
 type:"object",
 properties: {
 title: { type:"string" },
 subjectIds: { type:"array", items: { type:"string" } },
 projectId: { type:"string" },
 startTime: { type:"string" },
 endTime: { type:"string" },
 description: { type:"string" },
 notes: { type:"string" },
 },
 required: ["title","subjectIds","startTime","endTime"],
} as const;

const EVENT_TYPE_ENUM = [
"sac",
"exam",
"assignment",
"event",
"homework",
"other",
"practice-sac",
] as const satisfies readonly EventType[];

const EVENT_TOOL_ACTIONS = [
"none",
"list_events",
"get_event",
"create_event",
"update_event",
"delete_event",
] as const satisfies readonly EventToolAction[];
const MONTH_INDEX: Record<string, number> = {
 jan: 1,
 january: 1,
 feb: 2,
 february: 2,
 mar: 3,
 march: 3,
 apr: 4,
 april: 4,
 may: 5,
 jun: 6,
 june: 6,
 jul: 7,
 july: 7,
 aug: 8,
 august: 8,
 sep: 9,
 sept: 9,
 september: 9,
 oct: 10,
 october: 10,
 nov: 11,
 november: 11,
 dec: 12,
 december: 12,
};

const EVENT_DRAFT_SCHEMA = {
 type:"object",
 properties: {
 title: { type:"string" },
 eventType: { type:"string", enum: EVENT_TYPE_ENUM },
 startTime: { type:"string" },
 endTime: { type:"string" },
 subjectId: { type:"string" },
 description: { type:"string" },
 location: { type:"string" },
 },
 required: ["title","eventType","startTime"],
} as const;

const EVENT_TOOL_SCHEMA = {
 type:"object",
 properties: {
 action: { type:"string", enum: EVENT_TOOL_ACTIONS },
 eventId: {
 type:"string",
 description:"Existing Focal event id when known; otherwise empty.",
 },
 query: {
 type:"string",
 description:
"Plain-text event title/search hint when id is unknown; otherwise empty.",
 },
 startDate: {
 type:"string",
 description:
"YYYY-MM-DD lower date bound when relevant; otherwise empty.",
 },
 endDate: {
 type:"string",
 description:
"YYYY-MM-DD upper date bound when relevant; otherwise empty.",
 },
 data: {
 type:"object",
 properties: {
 title: { type:"string" },
 eventType: { type:"string", enum: EVENT_TYPE_ENUM },
 startTime: { type:"string", description:"ISO 8601 datetime." },
 endTime: { type:"string", description:"ISO 8601 datetime or empty." },
 subjectId: { type:"string", description:"Subject id or empty." },
 description: { type:"string" },
 location: { type:"string" },
 isFinished: { type:"boolean" },
 finishedAt: {
 type:"string",
 description:"ISO 8601 datetime or empty.",
 },
 },
 },
 },
 required: ["action"],
} as const;

const FOCAL_AGENT_TOOLS: ToolDefinition[] = [
 {
 type:"function",
 function: {
 name:"list_deadlines",
 description:
"List Focal assessment/project deadlines. Use this before answering SAC, exam, assignment, assessment, deadline, due-date, next, or upcoming assessment questions.",
 parameters: {
 type:"object",
 properties: {
 query: {
 type:"string",
 description:
"Optional title, subject, type, unit, or notes search text.",
 },
 range: {
 type:"string",
 enum: [
"this_week",
"next_7_days",
"next_14_days",
"all_upcoming",
"all",
 ],
 description:
"Optional date window. Prefer all_upcoming for 'next N SACs' and this_week only when the user says this week.",
 },
 startDate: {
 type:"string",
 description:"Optional YYYY-MM-DD lower bound.",
 },
 endDate: {
 type:"string",
 description:"Optional YYYY-MM-DD upper bound.",
 },
 includeFinished: {
 type:"boolean",
 description:"Whether to include finished assessments.",
 },
 includeArchived: {
 type:"boolean",
 description:"Whether to include archived assessments.",
 },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"list_projects",
 description:
"List Focal assessment/project records, optionally filtered by search text or deadline date.",
 parameters: {
 type:"object",
 properties: {
 query: {
 type:"string",
 description:
"Optional title, subject, type, unit, notes, or id search text.",
 },
 range: {
 type:"string",
 enum: [
"this_week",
"next_7_days",
"next_14_days",
"all_upcoming",
"all",
 ],
 description:"Optional deadline date window.",
 },
 startDate: {
 type:"string",
 description:"Optional YYYY-MM-DD deadline lower bound.",
 },
 endDate: {
 type:"string",
 description:"Optional YYYY-MM-DD deadline upper bound.",
 },
 includeFinished: { type:"boolean" },
 includeArchived: { type:"boolean" },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"list_study_sessions",
 description:
"List Focal study sessions, optionally filtered by query, date range, or status.",
 parameters: {
 type:"object",
 properties: {
 query: {
 type:"string",
 description:
"Optional title, subject, project, notes, topic, or blocker search text.",
 },
 range: {
 type:"string",
 enum: [
"this_week",
"next_7_days",
"next_14_days",
"all_upcoming",
"all",
 ],
 description:"Optional session start-date window.",
 },
 startDate: {
 type:"string",
 description:"Optional YYYY-MM-DD lower bound.",
 },
 endDate: {
 type:"string",
 description:"Optional YYYY-MM-DD upper bound.",
 },
 status: {
 type:"string",
 enum: ["planned","in-progress","completed"],
 },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"list_subjects",
 description:
"List Focal subjects and ids. Use before choosing or explaining subject ids.",
 parameters: {
 type:"object",
 properties: {
 query: {
 type:"string",
 description:
"Optional subject name, short code, or id search text.",
 },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"get_study_overview",
 description:
"Summarize the user's active workload, nearest deadline, and planned study time. Use for prioritization, workload, and 'what should I do next?' questions.",
 parameters: { type:"object", properties: {} },
 },
 },
 {
 type:"function",
 function: {
 name:"create_study_session",
 description:
"Create a Focal study session only when the user explicitly asks to schedule or create one.",
 parameters: {
 type:"object",
 properties: {
 title: { type:"string" },
 subjectIds: {
 type:"array",
 items: { type:"string" },
 description:"Subject ids from list_subjects.",
 },
 projectId: {
 type:"string",
 description:"Optional project id from list_projects.",
 },
 startTime: { type:"string", description:"ISO 8601 datetime." },
 endTime: {
 type:"string",
 description:"ISO 8601 datetime after startTime.",
 },
 description: { type:"string" },
 notes: { type:"string" },
 },
 required: ["title","subjectIds","startTime","endTime"],
 },
 },
 },
 {
 type:"function",
 function: {
 name:"update_study_session",
 description:
"Reschedule, rename, complete, or edit one existing Focal study session. Identify exactly one session, then provide only changed fields.",
 parameters: {
 type:"object",
 properties: {
 sessionId: {
 type:"string",
 description:"Existing Focal study-session id when known.",
 },
 query: {
 type:"string",
 description:
"Title, subject, or project search hint when id is unknown.",
 },
 title: { type:"string" },
 subjectIds: {
 type:"array",
 items: { type:"string" },
 description:"Subject ids from list_subjects.",
 },
 projectId: {
 type:"string",
 description:"Project id from list_projects.",
 },
 startTime: { type:"string", description:"ISO 8601 datetime." },
 endTime: {
 type:"string",
 description:"ISO 8601 datetime after startTime.",
 },
 description: { type:"string" },
 topics: { type:"array", items: { type:"string" } },
 notes: { type:"string" },
 status: {
 type:"string",
 enum: ["planned","in-progress","completed"],
 },
 confidence: { type:"number", enum: [1, 2, 3, 4, 5] },
 blockers: { type:"string" },
 nextAction: { type:"string" },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"list_events",
 description:
"List Focal calendar events, optionally filtered by query and YYYY-MM-DD date range.",
 parameters: {
 type:"object",
 properties: {
 query: {
 type:"string",
 description:
"Optional title, subject, type, or location search text.",
 },
 startDate: {
 type:"string",
 description:"Optional YYYY-MM-DD lower bound.",
 },
 endDate: {
 type:"string",
 description:"Optional YYYY-MM-DD upper bound.",
 },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"get_event",
 description:
"Get details for one existing Focal event by id or a precise query.",
 parameters: {
 type:"object",
 properties: {
 eventId: {
 type:"string",
 description:"Existing Focal event id when known.",
 },
 query: {
 type:"string",
 description:"Title/search hint when id is unknown.",
 },
 startDate: {
 type:"string",
 description:"Optional YYYY-MM-DD lower bound.",
 },
 endDate: {
 type:"string",
 description:"Optional YYYY-MM-DD upper bound.",
 },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"create_event",
 description:
"Create a Focal calendar event. Use known details; missing details will be reported back to the user.",
 parameters: {
 type:"object",
 properties: {
 title: { type:"string" },
 eventType: { type:"string", enum: EVENT_TYPE_ENUM },
 startTime: { type:"string", description:"ISO 8601 datetime." },
 endTime: {
 type:"string",
 description:"Optional ISO 8601 datetime.",
 },
 subjectId: {
 type:"string",
 description:"Optional subject id from the provided subject list.",
 },
 description: { type:"string" },
 location: { type:"string" },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"update_event",
 description:
"Update one existing Focal event. Identify exactly one event, then provide only changed fields.",
 parameters: {
 type:"object",
 properties: {
 eventId: {
 type:"string",
 description:"Existing Focal event id when known.",
 },
 query: {
 type:"string",
 description:"Title/search hint when id is unknown.",
 },
 startDate: {
 type:"string",
 description:"Optional YYYY-MM-DD lower bound for matching.",
 },
 endDate: {
 type:"string",
 description:"Optional YYYY-MM-DD upper bound for matching.",
 },
 title: { type:"string" },
 eventType: { type:"string", enum: EVENT_TYPE_ENUM },
 startTime: { type:"string", description:"ISO 8601 datetime." },
 endTime: { type:"string", description:"ISO 8601 datetime." },
 subjectId: { type:"string" },
 description: { type:"string" },
 location: { type:"string" },
 isFinished: { type:"boolean" },
 finishedAt: { type:"string", description:"ISO 8601 datetime." },
 },
 },
 },
 },
 {
 type:"function",
 function: {
 name:"delete_event",
 description:
"Delete one existing Focal event. The app will still ask the user to confirm destructive deletion.",
 parameters: {
 type:"object",
 properties: {
 eventId: {
 type:"string",
 description:"Existing Focal event id when known.",
 },
 query: {
 type:"string",
 description:"Title/search hint when id is unknown.",
 },
 startDate: {
 type:"string",
 description:"Optional YYYY-MM-DD lower bound for matching.",
 },
 endDate: {
 type:"string",
 description:"Optional YYYY-MM-DD upper bound for matching.",
 },
 },
 },
 },
 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value ==="object" && value !== null && !Array.isArray(value);
}

function readOptionalString(
 record: Record<string, unknown>,
 key: string,
): string | undefined {
 const value = record[key];
 return typeof value ==="string" && value.trim() ? value.trim() : undefined;
}

function readOptionalBoolean(
 record: Record<string, unknown>,
 key: string,
): boolean | undefined {
 const value = record[key];
 return typeof value ==="boolean" ? value : undefined;
}

function readOptionalStringArray(
 record: Record<string, unknown>,
 key: string,
): string[] | undefined {
 const value = record[key];
 if (!Array.isArray(value)) return undefined;
 return value.filter(
 (item): item is string =>
 typeof item ==="string" && item.trim().length > 0,
 );
}

function isEventType(value: unknown): value is EventType {
 return (
 typeof value ==="string" && EVENT_TYPE_ENUM.includes(value as EventType)
 );
}

function isIsoDateTime(value: string | undefined): value is string {
 return Boolean(value && Number.isFinite(new Date(value).getTime()));
}

function normaliseKey(value: string): string {
 return value
 .toLowerCase()
 .replace(/[^a-z0-9]+/g," ")
 .trim();
}

function searchQueryVariants(query: string): string[] {
 const key = normaliseKey(query);
 if (!key) return [];
 return Array.from(
 new Set([
 key,
 key.replace(/\bmaths?\b/g,"mathematical"),
 key.replace(/\bmathematical\b/g,"math"),
 ]),
 );
}

function searchMatches(value: string, query: string | undefined): boolean {
 if (!query) return true;
 const haystack = normaliseKey(value);
 return searchQueryVariants(query).some((variant) => {
 const terms = variant.split(/\s+/).filter(Boolean);
 return (
 terms.length === 0 ||
 haystack.includes(variant) ||
 terms.every((term) => haystack.includes(term))
 );
 });
}

function titleCase(value: string): string {
 return value
 .split(/\s+/)
 .filter(Boolean)
 .map((word) =>
 word.length <= 3
 ? word.toUpperCase()
 : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`,
 )
 .join(" ");
}

function parseLooseTime(value: string): string | undefined {
 const match = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(value);
 if (!match) return undefined;
 let hours = Number(match[1]);
 const minutes = Number(match[2] ??"00");
 if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59)
 return undefined;
 const meridiem = match[3]?.toLowerCase();
 if (meridiem) {
 if (hours < 1 || hours > 12) return undefined;
 if (hours === 12) hours = 0;
 if (meridiem ==="pm") hours += 12;
 } else if (hours > 23) {
 return undefined;
 }
 return `${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}`;
}

function dateMatchesParts(
 date: Date,
 year: number,
 month: number,
 day: number,
): boolean {
 return (
 date.getFullYear() === year &&
 date.getMonth() + 1 === month &&
 date.getDate() === day
 );
}

function inferEventTypeFromText(text: string): EventType {
 const lower = text.toLowerCase();
 if (/\bpractice\s+sac\b|\bpractice-sac\b/.test(lower)) return"practice-sac";
 for (const type of EVENT_TYPE_ENUM) {
 if (type !=="practice-sac" && new RegExp(`\\b${type}\\b`,"i").test(lower))
 return type;
 }
 return"event";
}

function inferSubjectIdFromText(
 text: string,
 subjects: Subject[] | undefined,
): string | undefined {
 const key = normaliseKey(text);
 const variants = [key, key.replace(/\bmaths?\b/g,"mathematical")];
 return subjects?.find((subject) => {
 const name = normaliseKey(subject.name);
 const code = normaliseKey(subject.shortCode);
 return variants.some((variant) => {
 const compact = variant.replace(/\s+/g,"");
 return (
 compact.includes(name.replace(/\s+/g,"")) ||
 compact.includes(code.replace(/\s+/g,""))
 );
 });
 })?.id;
}

// eslint-disable-next-line react-refresh/only-export-components
export function parseLooseEventCreateRequest(
 text: string,
 today: string,
 subjects: Subject[] | undefined,
): EventToolData | null {
 const dateMatch =
 /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?\b/i.exec(
 text,
 );
 if (!dateMatch) return null;
 const month = MONTH_INDEX[dateMatch[2].toLowerCase()];
 const day = Number(dateMatch[1]);
 if (!month || !Number.isInteger(day) || day < 1 || day > 31) return null;
 const timeText = text.slice(dateMatch.index + dateMatch[0].length);
 const timeValue = parseLooseTime(timeText) ?? parseLooseTime(text);
 if (!timeValue) return null;

 const todayDate = new Date(`${today}T00:00:00`);
 const year = dateMatch[3] ? Number(dateMatch[3]) : todayDate.getFullYear();
 const dateValue = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
 let start = combineDateAndTime(dateValue, timeValue);
 if (start && !dateMatchesParts(start, year, month, day)) return null;
 if (!dateMatch[3] && start && start < todayDate) {
 const nextYear = year + 1;
 start = combineDateAndTime(
 `${nextYear}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`,
 timeValue,
 );
 if (start && !dateMatchesParts(start, nextYear, month, day)) return null;
 }
 if (!start) return null;

 const beforeDate = text
 .slice(0, dateMatch.index)
 .replace(/\b(on|at|for)\b/gi,"")
 .trim();
 const eventType = inferEventTypeFromText(text);
 const titleSource =
 beforeDate ||
 text
 .replace(dateMatch[0],"")
 .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i,"")
 .trim();
 const title = titleCase(titleSource || eventType);
 if (!title) return null;
 return {
 title,
 eventType,
 startTime: start.toISOString(),
 subjectId: inferSubjectIdFromText(titleSource, subjects),
 };
}

function normaliseEventToolCall(raw: unknown): EventToolCall {
 if (!isRecord(raw)) return { action:"none" };
 const action = EVENT_TOOL_ACTIONS.includes(raw.action as EventToolAction)
 ? (raw.action as EventToolAction)
 :"none";
 const dataRaw = isRecord(raw.data) ? raw.data : {};
 const eventType = dataRaw.eventType;
 return {
 action,
 eventId: readOptionalString(raw,"eventId"),
 query: readOptionalString(raw,"query"),
 startDate: readOptionalString(raw,"startDate"),
 endDate: readOptionalString(raw,"endDate"),
 data: {
 title: readOptionalString(dataRaw,"title"),
 eventType: isEventType(eventType) ? eventType : undefined,
 startTime: readOptionalString(dataRaw,"startTime"),
 endTime: readOptionalString(dataRaw,"endTime"),
 subjectId: readOptionalString(dataRaw,"subjectId"),
 description: readOptionalString(dataRaw,"description"),
 location: readOptionalString(dataRaw,"location"),
 isFinished: readOptionalBoolean(dataRaw,"isFinished"),
 finishedAt: readOptionalString(dataRaw,"finishedAt"),
 },
 };
}

function eventToolCallFromNative(call: ToolCall): EventToolCall {
 const args = call.arguments;
 const data: Record<string, unknown> = {};
 for (const key of [
"title",
"eventType",
"startTime",
"endTime",
"subjectId",
"description",
"location",
"isFinished",
"finishedAt",
 ]) {
 if (args[key] !== undefined) data[key] = args[key];
 }
 return normaliseEventToolCall({
 action: call.name,
 eventId: args.eventId,
 query: args.query,
 startDate: args.startDate,
 endDate: args.endDate,
 data,
 });
}

function hasEventToolIntent(text: string): boolean {
 return /\b(event|events|calendar|schedule|deadline|exam|sac|assignment|homework|due|reschedule|move|rename|delete|remove|mark|finish|finished)\b/i.test(
 text,
 );
}

function hasEventMutationIntent(text: string): boolean {
 return /\b(add|create|make|schedule|put|edit|update|change|move|reschedule|rename|delete|remove|mark|finish|finished)\b/i.test(
 text,
 );
}

function eventSubjectLabel(
 subjects: Subject[] | undefined,
 subjectId: string | undefined,
): string {
 if (!subjectId) return"no subject";
 const subject = subjects?.find((item) => item.id === subjectId);
 return subject ? `${subject.shortCode} ${subject.name}` : subjectId;
}

function formatEventLine(
 event: CalendarEvent,
 subjects: Subject[] | undefined,
): string {
 const when = `${event.startTime}${event.endTime ? ` to ${event.endTime}` :""}`;
 const done = event.isFinished ?"finished" :"current";
 return `- ${event.id}:"${event.title}" (${event.eventType}, ${done}) ${when}; ${eventSubjectLabel(subjects, event.subjectId)}${event.location ? `; ${event.location}` :""}`;
}

function buildEventToolContext(
 events: CalendarEvent[] | undefined,
 subjects: Subject[] | undefined,
 today: string,
): string {
 const items = (events ?? [])
 .slice()
 .sort(
 (a, b) =>
 Math.abs(
 new Date(a.startTime).getTime() -
 new Date(`${today}T00:00:00`).getTime(),
 ) -
 Math.abs(
 new Date(b.startTime).getTime() -
 new Date(`${today}T00:00:00`).getTime(),
 ),
 )
 .slice(0, 40);
 const eventLines =
 items.length > 0
 ? items.map((event) => formatEventLine(event, subjects)).join("\n")
 :"No events.";
 const subjectLines =
 (subjects ?? [])
 .map(
 (subject) => `- ${subject.id}: ${subject.name} (${subject.shortCode})`,
 )
 .join("\n") ||"No subjects.";
 return `Available event types: ${EVENT_TYPE_ENUM.join(", ")}

Subjects:
${subjectLines}

Nearest Focal events, by id:
${eventLines}`;
}

function eventMatchesDate(
 event: CalendarEvent,
 startDate?: string,
 endDate?: string,
): boolean {
 const date = event.startTime.slice(0, 10);
 return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function eventSearchText(
 event: CalendarEvent,
 subjects: Subject[] | undefined,
): string {
 return [
 event.id,
 event.title,
 event.description,
 event.eventType,
 event.location,
 event.subjectId,
 eventSubjectLabel(subjects, event.subjectId),
 ]
 .filter(Boolean)
 .join("");
}

function findToolEvent(
 events: CalendarEvent[] | undefined,
 subjects: Subject[] | undefined,
 call: EventToolCall,
): { event?: CalendarEvent; matches: CalendarEvent[]; reason?: string } {
 const list = events ?? [];
 if (call.eventId) {
 const event = list.find((item) => item.id === call.eventId);
 return event
 ? { event, matches: [event] }
 : { matches: [], reason: `No event has id ${call.eventId}.` };
 }
 const scoped = list.filter((event) =>
 eventMatchesDate(event, call.startDate, call.endDate),
 );
 const query = call.query?.trim();
 if (!query) {
 return scoped.length === 1
 ? { event: scoped[0], matches: scoped }
 : {
 matches: scoped,
 reason:
 scoped.length === 0
 ?"No matching events found."
 :"More than one event matches.",
 };
 }
 const exact = scoped.filter(
 (event) => normaliseKey(event.title) === normaliseKey(query),
 );
 if (exact.length === 1) return { event: exact[0], matches: exact };
 const matches = scoped.filter((event) =>
 searchMatches(eventSearchText(event, subjects), query),
 );
 return matches.length === 1
 ? { event: matches[0], matches }
 : {
 matches,
 reason:
 matches.length === 0
 ?"No matching events found."
 :"More than one event matches.",
 };
}

function listToolEvents(
 events: CalendarEvent[] | undefined,
 subjects: Subject[] | undefined,
 call: EventToolCall,
): CalendarEvent[] {
 const query = call.query?.trim();
 return (events ?? [])
 .filter((event) => eventMatchesDate(event, call.startDate, call.endDate))
 .filter((event) => searchMatches(eventSearchText(event, subjects), query))
 .sort(
 (a, b) =>
 new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
 )
 .slice(0, 20);
}

function addDays(date: string, days: number): string {
 const base = dateOnlyMs(date) ?? Date.now();
 return getLocalDateValue(new Date(base + days * 24 * 60 * 60 * 1000));
}

function readToolDateRange(
 args: Record<string, unknown>,
 today: string,
): { startDate?: string; endDate?: string } {
 const startDate = readOptionalString(args,"startDate");
 const endDate = readOptionalString(args,"endDate");
 const range = readOptionalString(args,"range");
 if (startDate || endDate) return { startDate, endDate };
 if (range ==="this_week")
 return { startDate: today, endDate: endOfWeekDate(today) };
 if (range ==="next_7_days")
 return { startDate: today, endDate: addDays(today, 7) };
 if (range ==="next_14_days")
 return { startDate: today, endDate: addDays(today, 14) };
 if (range ==="all_upcoming") return { startDate: today };
 return {};
}

function dateMatchesRange(
 value: string | undefined,
 startDate?: string,
 endDate?: string,
): boolean {
 if (!value) return !startDate && !endDate;
 const date = value.slice(0, 10);
 return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function projectSubjectLabel(
 subjects: Subject[] | undefined,
 subjectId: string | undefined,
): string {
 if (!subjectId) return"no subject";
 const subject = subjects?.find((item) => item.id === subjectId);
 return subject ? `${subject.shortCode} ${subject.name}` : subjectId;
}

function projectSearchText(
 project: Project,
 subjects: Subject[] | undefined,
): string {
 return [
 project.id,
 project.name,
 project.description,
 project.deadlineType,
 project.deadline,
 project.unit,
 project.subjectId,
 projectSubjectLabel(subjects, project.subjectId),
 project.notes,
 ]
 .filter(Boolean)
 .join("");
}

function formatProjectLine(
 project: Project,
 subjects: Subject[] | undefined,
 today: string,
): string {
 const state = project.isFinished
 ?"finished"
 : project.isArchived
 ?"archived"
 :"active";
 const days = project.deadline ? daysFromToday(project.deadline, today) : null;
 const deadline = project.deadline
 ? `due ${project.deadline.slice(0, 10)}${
 days !== null ? ` (${relativeDeadlineLabel(days)})` :""
 }`
 :"no deadline";
 return [
 `- ${project.id}:"${project.name}"`,
 `(${project.deadlineType ??"assessment"}, ${state})`,
 deadline,
 projectSubjectLabel(subjects, project.subjectId),
 project.unit ? `Unit ${project.unit}` : null,
 ]
 .filter(Boolean)
 .join(";");
}

function filterProjectsForTool(
 projects: Project[] | undefined,
 subjects: Subject[] | undefined,
 opts: {
 query?: string;
 startDate?: string;
 endDate?: string;
 includeFinished: boolean;
 includeArchived: boolean;
 onlyDeadlines: boolean;
 ignoreDate?: boolean;
 },
): Project[] {
 return (projects ?? [])
 .filter((project) => opts.includeFinished || !project.isFinished)
 .filter((project) => opts.includeArchived || !project.isArchived)
 .filter((project) => !opts.onlyDeadlines || Boolean(project.deadline))
 .filter(
 (project) =>
 opts.ignoreDate === true ||
 dateMatchesRange(project.deadline, opts.startDate, opts.endDate),
 )
 .filter((project) =>
 searchMatches(projectSearchText(project, subjects), opts.query),
 );
}

function sessionSearchText(
 session: StudySession,
 subjects: Subject[] | undefined,
 projects: Project[] | undefined,
): string {
 const project = projects?.find((item) => item.id === session.projectId);
 const subjectLabels = session.subjectIds
 .map((id) => projectSubjectLabel(subjects, id))
 .join("");
 return [
 session.id,
 session.title,
 session.description,
 session.status,
 session.notes,
 session.blockers,
 session.nextAction,
 session.topics?.join(""),
 subjectLabels,
 project?.name,
 ]
 .filter(Boolean)
 .join("");
}

function formatSessionLine(
 session: StudySession,
 subjects: Subject[] | undefined,
 projects: Project[] | undefined,
): string {
 const project = projects?.find((item) => item.id === session.projectId);
 const subjectLabels =
 session.subjectIds
 .map((id) => projectSubjectLabel(subjects, id))
 .join(", ") ||"no subject";
 const projectLabel = project ? `; project "${project.name}"` :"";
 const confidence = session.confidence
 ? `; confidence ${session.confidence}/5`
 :"";
 return `- ${session.id}:"${session.title}" (${session.status}) ${session.startTime} to ${session.endTime}; ${subjectLabels}${projectLabel}${confidence}`;
}

type PreparedStudySessionUpdate =
 | {
 session: StudySession;
 updates: Partial<Omit<StudySession,"id" |"created_at">>;
 }
 | { error: string };

// eslint-disable-next-line react-refresh/only-export-components
export function prepareStudySessionUpdate(
 call: ToolCall,
 context: {
 sessions?: StudySession[];
 subjects?: Subject[];
 projects?: Project[];
 now?: string;
 },
): PreparedStudySessionUpdate {
 const args = call.arguments;
 const sessionId = readOptionalString(args,"sessionId");
 const query = readOptionalString(args,"query");
 const candidates = context.sessions ?? [];
 let matches = sessionId
 ? candidates.filter((session) => session.id === sessionId)
 : candidates.filter((session) =>
 searchMatches(
 sessionSearchText(session, context.subjects, context.projects),
 query,
 ),
 );
 if (!sessionId && query) {
 const exact = matches.filter(
 (session) => normaliseKey(session.title) === normaliseKey(query),
 );
 if (exact.length === 1) matches = exact;
 }
 if (matches.length !== 1) {
 if (matches.length === 0)
 return { error:"No matching study session found." };
 return {
 error: `More than one study session matches:\n${matches
 .slice(0, 8)
 .map((session) =>
 formatSessionLine(session, context.subjects, context.projects),
 )
 .join("\n")}`,
 };
 }

 const session = matches[0];
 const updates: Partial<Omit<StudySession,"id" |"created_at">> = {};
 const title = readOptionalString(args,"title");
 const subjectIds = readOptionalStringArray(args,"subjectIds");
 const projectId = readOptionalString(args,"projectId");
 const startTime = readOptionalString(args,"startTime");
 const endTime = readOptionalString(args,"endTime");
 const status = readOptionalString(args,"status");
 const confidence = args.confidence;

 if (title) updates.title = title;
 if (subjectIds) updates.subjectIds = subjectIds;
 if (projectId) updates.projectId = projectId;
 if (startTime) updates.startTime = startTime;
 if (endTime) updates.endTime = endTime;
 for (const key of [
"description",
"notes",
"blockers",
"nextAction",
 ] as const) {
 const value = readOptionalString(args, key);
 if (value) updates[key] = value;
 }
 const topics = readOptionalStringArray(args,"topics");
 if (topics) updates.topics = topics;
 if (
 status ==="planned" ||
 status ==="in-progress" ||
 status ==="completed"
 ) {
 updates.status = status;
 updates.completedAt =
 status ==="completed"
 ? (context.now ?? new Date().toISOString())
 : undefined;
 } else if (status) {
 return { error: `"${status}" is not a valid study-session status.` };
 }
 if (confidence !== undefined) {
 if (
 confidence !== 1 &&
 confidence !== 2 &&
 confidence !== 3 &&
 confidence !== 4 &&
 confidence !== 5
 ) {
 return { error:"Confidence must be a whole number from 1 to 5." };
 }
 updates.confidence = confidence;
 }

 if (Object.keys(updates).length === 0)
 return { error:"No study-session changes were provided." };
 if (
 subjectIds?.some(
 (id) => !(context.subjects ?? []).some((subject) => subject.id === id),
 )
 ) {
 return {
 error:
"One or more subject ids do not exist, so I did not update the session.",
 };
 }
 if (
 projectId &&
 !(context.projects ?? []).some((project) => project.id === projectId)
 ) {
 return {
 error: `Project id "${projectId}" does not exist, so I did not update the session.`,
 };
 }
 const nextStart = updates.startTime ?? session.startTime;
 const nextEnd = updates.endTime ?? session.endTime;
 if (!isIsoDateTime(nextStart) || !isIsoDateTime(nextEnd)) {
 return {
 error:"The updated study-session times were not valid ISO dates.",
 };
 }
 if (new Date(nextEnd).getTime() <= new Date(nextStart).getTime()) {
 return { error:"The study session must end after it starts." };
 }
 return { session, updates };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildStudyOverviewToolResult(
 projects: Project[] | undefined,
 sessions: StudySession[] | undefined,
 subjects: Subject[] | undefined,
 today: string,
): string {
 const overview = buildAssistantOverview(projects, sessions, today);
 const todayMs = dateOnlyMs(today) ?? 0;
 const nextWeekMs = todayMs + 7 * 24 * 60 * 60 * 1000;
 const nextFortnightMs = todayMs + 14 * 24 * 60 * 60 * 1000;
 const nearestDeadlines = (projects ?? [])
 .filter(
 (project) =>
 !project.isFinished && !project.isArchived && project.deadline,
 )
 .sort((a, b) => (a.deadline ??"9999").localeCompare(b.deadline ??"9999"))
 .slice(0, 5);
 const plannedSessions = (sessions ?? [])
 .filter((session) => {
 const start = new Date(session.startTime).getTime();
 return (
 session.status !=="completed" &&
 start >= todayMs &&
 start <= nextWeekMs
 );
 })
 .sort(
 (a, b) =>
 new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
 )
 .slice(0, 8);
 // ponytail: project/subject linkage is a deliberately cheap coverage heuristic.
 // Upgrade to explicit per-assessment coverage only if sessions gain that relation.
 const uncovered = nearestDeadlines.filter((project) => {
 const deadlineMs = project.deadline ? dateOnlyMs(project.deadline) : null;
 if (deadlineMs === null || deadlineMs > nextFortnightMs) return false;
 return !(sessions ?? []).some((session) => {
 if (session.status ==="completed") return false;
 const start = new Date(session.startTime).getTime();
 if (start < todayMs || start > deadlineMs + 24 * 60 * 60 * 1000 - 1)
 return false;
 return (
 session.projectId === project.id ||
 Boolean(
 project.subjectId && session.subjectIds.includes(project.subjectId),
 )
 );
 });
 });

 const deadlineEvidence =
 nearestDeadlines.length > 0
 ? nearestDeadlines
 .map((project) => formatProjectLine(project, subjects, today))
 .join("\n")
 :"- None";
 const sessionEvidence =
 plannedSessions.length > 0
 ? plannedSessions
 .map((session) => formatSessionLine(session, subjects, projects))
 .join("\n")
 :"- None";
 const gapEvidence =
 uncovered.length > 0
 ? uncovered
 .map((project) => formatProjectLine(project, subjects, today))
 .join("\n")
 :"- None among deadlines in the next 14 days";

 return `Study overview: ${overview.title}. ${overview.detail}.

Nearest active deadlines:
${deadlineEvidence}

Planned study in the next 7 days:
${sessionEvidence}

Coverage gaps (no linked planned session before the deadline):
${gapEvidence}`;
}

// eslint-disable-next-line react-refresh/only-export-components
export function executeReadOnlyFocalToolCall(
 call: ToolCall,
 context: {
 projects?: Project[];
 sessions?: StudySession[];
 subjects?: Subject[];
 today: string;
 },
): string | null {
 const args = call.arguments;
 const query = readOptionalString(args,"query");
 const { startDate, endDate } = readToolDateRange(args, context.today);

 if (call.name ==="list_subjects") {
 const matches = (context.subjects ?? [])
 .filter((subject) =>
 searchMatches(
 `${subject.id} ${subject.name} ${subject.shortCode}`,
 query,
 ),
 )
 .sort((a, b) => a.name.localeCompare(b.name));
 if (matches.length === 0) return"No matching subjects found.";
 return `Subjects:\n${matches.map((subject) => `- ${subject.id}: ${subject.name} (${subject.shortCode})`).join("\n")}\n\nSubject lookup does not include SAC, exam, assignment, or deadline dates. For assessment dates, call list_deadlines next.`;
 }

 if (call.name ==="list_deadlines" || call.name ==="list_projects") {
 const includeFinished =
 readOptionalBoolean(args,"includeFinished") ?? false;
 const includeArchived =
 readOptionalBoolean(args,"includeArchived") ?? false;
 const onlyDeadlines = call.name ==="list_deadlines";
 const matches = filterProjectsForTool(context.projects, context.subjects, {
 query,
 startDate,
 endDate,
 includeFinished,
 includeArchived,
 onlyDeadlines,
 })
 .sort(
 (a, b) =>
 (a.deadline ??"9999").localeCompare(b.deadline ??"9999") ||
 a.name.localeCompare(b.name),
 )
 .slice(0, 30);
 if (matches.length === 0) {
 const fallbackMatches = filterProjectsForTool(
 context.projects,
 context.subjects,
 {
 query,
 includeFinished,
 includeArchived,
 onlyDeadlines,
 ignoreDate: true,
 },
 )
 .sort(
 (a, b) =>
 (a.deadline ??"9999").localeCompare(b.deadline ??"9999") ||
 a.name.localeCompare(b.name),
 )
 .slice(0, 8);
 const empty = onlyDeadlines
 ?"No matching deadlines found in the requested date range."
 :"No matching projects found in the requested date range.";
 if (fallbackMatches.length === 0)
 return onlyDeadlines
 ?"No matching deadlines found."
 :"No matching projects found.";
 const label = onlyDeadlines
 ?"Matching deadlines outside that range"
 :"Matching projects outside that range";
 return `${empty}\n${label}:\n${fallbackMatches.map((project) => formatProjectLine(project, context.subjects, context.today)).join("\n")}`;
 }
 const label = onlyDeadlines ?"Deadlines" :"Projects";
 return `${label}:\n${matches.map((project) => formatProjectLine(project, context.subjects, context.today)).join("\n")}`;
 }

 if (call.name ==="list_study_sessions") {
 const status = readOptionalString(args,"status");
 const matches = (context.sessions ?? [])
 .filter((session) => !status || session.status === status)
 .filter((session) =>
 dateMatchesRange(session.startTime, startDate, endDate),
 )
 .filter((session) =>
 searchMatches(
 sessionSearchText(session, context.subjects, context.projects),
 query,
 ),
 )
 .sort(
 (a, b) =>
 new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
 )
 .slice(0, 30);
 if (matches.length === 0) return"No matching study sessions found.";
 return `Study sessions:\n${matches.map((session) => formatSessionLine(session, context.subjects, context.projects)).join("\n")}`;
 }

 if (call.name ==="get_study_overview") {
 return buildStudyOverviewToolResult(
 context.projects,
 context.sessions,
 context.subjects,
 context.today,
 );
 }

 return null;
}

function toolDisplayName(name: string): string {
 return name.replace(/_/g,"");
}

function toolRunningText(name: string): string {
 const label = toolDisplayName(name);
 if (name.startsWith("list_"))
 return `Checking ${label.replace(/^list /,"")}`;
 if (name.startsWith("get_")) return `Reading ${label.replace(/^get /,"")}`;
 if (name.startsWith("create_"))
 return `Creating ${label.replace(/^create /,"")}`;
 if (name.startsWith("update_"))
 return `Updating ${label.replace(/^update /,"")}`;
 if (name.startsWith("delete_"))
 return `Deleting ${label.replace(/^delete /,"")}`;
 return `Using ${label}`;
}

function toolDoneText(name: string): string {
 const label = toolDisplayName(name);
 if (name.startsWith("list_")) return `Checked ${label.replace(/^list /,"")}`;
 if (name.startsWith("get_")) return `Read ${label.replace(/^get /,"")}`;
 if (name.startsWith("create_"))
 return `Created ${label.replace(/^create /,"")}`;
 if (name.startsWith("update_"))
 return `Updated ${label.replace(/^update /,"")}`;
 if (name.startsWith("delete_")) return `Ran ${label}`;
 return `Used ${label}`;
}

export function AIAssistantPanel({
 open,
 onOpenChange,
 onOpenSettings,
 sessions,
 events,
 projects,
 subjects,
 onCreateSession,
 onUpdateSession,
 onCreateEvent,
 onUpdateEvent,
 onDeleteEvent,
 contextRefs,
}: AiAssistantPanelProps) {
 const reduceMotion = useReducedMotion();
 const [messages, setMessages] = useState<Message[]>(() =>
 readPersistedConversation(),
 );
 const [input, setInput] = useState("");
 const [pending, setPending] = useState(false);
 const [error, setError] = useState<{
 message: string;
 hint: string | null;
 } | null>(null);
 const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
 const sendAbortRef = useRef<AbortController | null>(null);
 const scrollRef = useRef<HTMLDivElement | null>(null);
 const inputRef = useRef<HTMLTextAreaElement | null>(null);

 const [width, setWidth] = useState<number>(() =>
 readPersistedAssistantWidth(),
 );
 const [isDragging, setIsDragging] = useState(false);
 const resizeCleanupRef = useRef<(() => void) | null>(null);

 const typewriterRef = useRef<{
 id: string;
 target: string;
 current: number;
 timeoutId: number;
 } | null>(null);

 const [focusModeActive, setFocusModeActive] = useState(false);
 useEffect(() => {
 const handler: EventListener = (event) => {
 const active = (event as CustomEvent<{ active?: boolean }>).detail
 ?.active;
 if (typeof active ==="boolean") setFocusModeActive(active);
 };
 window.addEventListener(FOCUS_MODE_EVENT, handler);
 return () => window.removeEventListener(FOCUS_MODE_EVENT, handler);
 }, []);

 useEffect(() => {
 try {
 localStorage.setItem(ASSISTANT_WIDTH_KEY, String(width));
 } catch {
 // localStorage unavailable (private mode, etc).
 }
 }, [width]);

 useEffect(() => {
 writePersistedConversation(messages);
 }, [messages]);

 const handleResizeStart = useCallback(
 (event: React.MouseEvent<HTMLButtonElement>) => {
 event.preventDefault();
 const startX = event.clientX;
 const startWidth = width;
 const previousBodyCursor = document.body.style.cursor;
 const previousBodyUserSelect = document.body.style.userSelect;
 document.body.style.cursor ="ew-resize";
 document.body.style.userSelect ="none";

 const handleMove = (moveEvent: MouseEvent) => {
 const delta = startX - moveEvent.clientX;
 setWidth(clampAssistantWidth(startWidth + delta));
 };
 const handleUp = () => {
 setIsDragging(false);
 document.body.style.cursor = previousBodyCursor;
 document.body.style.userSelect = previousBodyUserSelect;
 window.removeEventListener("mousemove", handleMove);
 window.removeEventListener("mouseup", handleUp);
 if (resizeCleanupRef.current === handleUp)
 resizeCleanupRef.current = null;
 };

 setIsDragging(true);
 resizeCleanupRef.current = handleUp;
 window.addEventListener("mousemove", handleMove);
 window.addEventListener("mouseup", handleUp);
 },
 [width],
 );

 useEffect(
 () => () => {
 resizeCleanupRef.current?.();
 },
 [],
 );
 useEffect(
 () => () => {
 if (typewriterRef.current?.timeoutId)
 clearTimeout(typewriterRef.current.timeoutId);
 },
 [],
 );

 const handleResizeKeyDown = useCallback(
 (event: React.KeyboardEvent<HTMLButtonElement>) => {
 if (event.altKey || event.ctrlKey || event.metaKey) return;
 if (event.key ==="ArrowLeft") {
 event.preventDefault();
 setWidth((current) =>
 clampAssistantWidth(current + ASSISTANT_WIDTH_STEP),
 );
 } else if (event.key ==="ArrowRight") {
 event.preventDefault();
 setWidth((current) =>
 clampAssistantWidth(current - ASSISTANT_WIDTH_STEP),
 );
 }
 },
 [],
 );

 const contextDay = useMemo(() => getLocalDateValue(new Date()), []);

 const activeProvider = getActiveProvider();
 const providerName = activeProvider.displayName;
 const providerMissing = !activeProvider.isConfigured();
 const providerIsOllama = activeProvider.id ==="ollama";
 const activeModel = getEffectiveModel();

 const briefing = useMemo(() => {
 if (!projects?.length && !sessions?.length) return"";
 return buildUserBriefing({
 projects: projects ?? [],
 sessions: sessions ?? [],
 subjects: subjects ?? [],
 today: contextDay,
 });
 }, [projects, sessions, subjects, contextDay]);

 const calendarContext = useMemo(
 () => buildCalendarContext(events, sessions, contextDay),
 [events, sessions, contextDay],
 );

 const overview = useMemo(
 () =>
 buildAssistantOverview(
 projects,
 sessions,
 contextDay,
 contextRefs?.project,
 ),
 [projects, sessions, contextDay, contextRefs?.project],
 );
 const starterPrompts = useMemo(
 () =>
 overview.hasFocalContext
 ? SUGGESTED_PROMPTS
 : [
 { label:"Choose my next block", prompt: overview.prompt },
 ...SUGGESTED_PROMPTS.slice(0, 3),
 ],
 [overview.hasFocalContext, overview.prompt],
 );
 const latestAssistantMessageId = useMemo(() => {
 for (let index = messages.length - 1; index >= 0; index--) {
 const message = messages[index];
 if (message.role ==="assistant" && !message.toolActivity)
 return message.id;
 }
 return null;
 }, [messages]);

 const pricePerMillionCents = 15;
 const showCost =
 !providerMissing && !providerIsOllama && input.trim().length > 0;
 const costDisplay = showCost
 ? (() => {
 const dollars =
 ((pricePerMillionCents / 100) * ASSISTANT_MAX_TOKENS) / 1_000_000;
 return dollars < 0.001 ?"<$0.001" : `~$${dollars.toFixed(3)}`;
 })()
 : null;

 useEffect(() => {
 if (!scrollRef.current) return;
 scrollRef.current.scrollTo({
 top: scrollRef.current.scrollHeight,
 behavior: reduceMotion ?"auto" :"smooth",
 });
 }, [messages, pending, reduceMotion]);

 useEffect(() => {
 if (!open || providerMissing) return;
 const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
 return () => window.cancelAnimationFrame(frame);
 }, [open, providerMissing]);

 const stopTypewriter = useCallback(() => {
 if (typewriterRef.current?.timeoutId)
 clearTimeout(typewriterRef.current.timeoutId);
 typewriterRef.current = null;
 }, []);

 const cancel = useCallback(() => {
 sendAbortRef.current?.abort();
 sendAbortRef.current = null;
 stopTypewriter();
 }, [stopTypewriter]);

 const animateTypewriter = useCallback(
 (messageId: string, target: string) => {
 const reply = extractFollowUpPrompts(target);
 if (reduceMotion || reply.content.length <= TYPEWRITER_CHARS_PER_TICK) {
 setMessages((prev) =>
 prev.map((m) =>
 m.id === messageId
 ? {
 ...m,
 content: reply.content,
 followUps: reply.followUps,
 pending: false,
 }
 : m,
 ),
 );
 return;
 }
 const initial = reply.content.slice(0, TYPEWRITER_CHARS_PER_TICK);
 setMessages((prev) =>
 prev.map((m) =>
 m.id === messageId
 ? {
 ...m,
 content: initial,
 followUps: reply.followUps,
 pending: false,
 }
 : m,
 ),
 );
 typewriterRef.current = {
 id: messageId,
 target: reply.content,
 current: TYPEWRITER_CHARS_PER_TICK,
 timeoutId: 0,
 };
 const tick = () => {
 const run = typewriterRef.current;
 if (run?.id !== messageId) return;
 const next = Math.min(
 run.target.length,
 run.current + TYPEWRITER_CHARS_PER_TICK,
 );
 typewriterRef.current = { ...run, current: next };
 setMessages((prev) =>
 prev.map((m) =>
 m.id === messageId
 ? { ...m, content: run.target.slice(0, next) }
 : m,
 ),
 );
 if (next >= run.target.length) {
 typewriterRef.current = null;
 return;
 }
 typewriterRef.current.timeoutId = window.setTimeout(
 tick,
 TYPEWRITER_TICK_MS,
 );
 };
 typewriterRef.current.timeoutId = window.setTimeout(
 tick,
 TYPEWRITER_TICK_MS,
 );
 },
 [reduceMotion],
 );

 const finalizePlaceholder = useCallback(
 (placeholderId: string, err: unknown): boolean => {
 const { message, hint, cancelled: wasCancelled } = describeAiError(err);
 if (wasCancelled) {
 setMessages((prev) =>
 prev.map((m) =>
 m.id === placeholderId
 ? {
 ...m,
 content:"— cancelled —",
 pending: false,
 cancelled: true,
 }
 : m,
 ),
 );
 return true;
 }
 setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
 setError({ message, hint });
 return false;
 },
 [],
 );

 const makeSystemMessage = useCallback((): string => {
 const contextLine = buildContextBits(contextRefs, focusModeActive);
 return buildSystemMessage(
 contextDay,
 providerName,
 contextLine,
 calendarContext,
 briefing,
 );
 }, [
 contextRefs,
 focusModeActive,
 contextDay,
 providerName,
 calendarContext,
 briefing,
 ]);

 const createEventFromToolData = useCallback(
 async (data: EventToolData): Promise<string> => {
 if (!onCreateEvent) return"Event creation is not available here.";
 if (!data.title || !data.eventType || !isIsoDateTime(data.startTime)) {
 return `I need a title, event type (${EVENT_TYPE_ENUM.join(", ")}), and date/time before I can create that event.`;
 }
 if (data.endTime && !isIsoDateTime(data.endTime))
 return"The event end time was not a valid ISO date.";
 if (
 data.subjectId &&
 !(subjects ?? []).some((subject) => subject.id === data.subjectId)
 ) {
 return `I couldn't find subject id "${data.subjectId}", so I didn't create the event.`;
 }
 const result = await onCreateEvent({
 title: data.title,
 startTime: data.startTime,
 endTime: data.endTime,
 eventType: data.eventType,
 subjectId: data.subjectId,
 description: data.description,
 location: data.location,
 });
 if (result === false) return `I couldn't create **${data.title}**.`;
 return `Created event **${data.title}** for ${data.startTime}.`;
 },
 [onCreateEvent, subjects],
 );

 const executeEventToolCall = useCallback(
 async (
 call: EventToolCall,
 looseCreate?: EventToolData | null,
 ): Promise<string | null> => {
 if (call.action ==="none") return null;

 if (call.action ==="list_events") {
 const matches = listToolEvents(events, subjects, call);
 if (matches.length === 0) return"No matching events found.";
 return `Found ${matches.length} matching event${matches.length === 1 ?"" :"s"}:\n${matches.map((event) => formatEventLine(event, subjects)).join("\n")}`;
 }

 if (call.action ==="get_event") {
 const { event, matches, reason } = findToolEvent(
 events,
 subjects,
 call,
 );
 if (!event) {
 return matches.length > 1
 ? `More than one event matches:\n${matches
 .slice(0, 8)
 .map((item) => formatEventLine(item, subjects))
 .join("\n")}`
 : (reason ??"No matching event found.");
 }
 return formatEventLine(event, subjects);
 }

 if (call.action ==="create_event") {
 const data = call.data ?? {};
 return createEventFromToolData({
 title: data.title ?? looseCreate?.title,
 eventType: data.eventType ?? looseCreate?.eventType,
 startTime: isIsoDateTime(data.startTime)
 ? data.startTime
 : looseCreate?.startTime,
 endTime: data.endTime ?? looseCreate?.endTime,
 subjectId: data.subjectId ?? looseCreate?.subjectId,
 description: data.description ?? looseCreate?.description,
 location: data.location ?? looseCreate?.location,
 });
 }

 const { event, matches, reason } = findToolEvent(events, subjects, call);
 if (!event) {
 return matches.length > 1
 ? `More than one event matches:\n${matches
 .slice(0, 8)
 .map((item) => formatEventLine(item, subjects))
 .join("\n")}`
 : (reason ??"No matching event found.");
 }

 if (call.action ==="update_event") {
 if (!onUpdateEvent) return"Event editing is not available here.";
 const data = call.data ?? {};
 if (data.startTime && !isIsoDateTime(data.startTime))
 return"The new start time was not a valid ISO date.";
 if (data.endTime && !isIsoDateTime(data.endTime))
 return"The new end time was not a valid ISO date.";
 if (data.finishedAt && !isIsoDateTime(data.finishedAt))
 return"The finished time was not a valid ISO date.";
 if (
 data.subjectId &&
 !(subjects ?? []).some((subject) => subject.id === data.subjectId)
 ) {
 return `Subject id "${data.subjectId}" does not exist; event was not updated.`;
 }
 const result = await onUpdateEvent({
 id: event.id,
 title: data.title ?? event.title,
 startTime: data.startTime ?? event.startTime,
 endTime: data.endTime ?? event.endTime,
 eventType: data.eventType ?? event.eventType,
 subjectId: data.subjectId ?? event.subjectId,
 description: data.description ?? event.description,
 location: data.location ?? event.location,
 isFinished: data.isFinished ?? event.isFinished,
 finishedAt:
 data.finishedAt ??
 (data.isFinished === true
 ? (event.finishedAt ?? new Date().toISOString())
 : data.isFinished === false
 ? undefined
 : event.finishedAt),
 });
 return result === false
 ? `Could not update "${event.title}".`
 : `Updated "${data.title ?? event.title}".`;
 }

 if (call.action ==="delete_event") {
 if (!onDeleteEvent) return"Event deletion is not available here.";
 const result = await onDeleteEvent(event.id);
 return result === false
 ? `Deletion cancelled for "${event.title}".`
 : `Deleted "${event.title}".`;
 }

 return null;
 },
 [createEventFromToolData, events, onDeleteEvent, onUpdateEvent, subjects],
 );

 const executeFocalToolCall = useCallback(
 async (
 toolCall: ToolCall,
 looseCreate?: EventToolData | null,
 ): Promise<string | null> => {
 const readOnlyResult = executeReadOnlyFocalToolCall(toolCall, {
 projects,
 sessions,
 subjects,
 today: contextDay,
 });
 if (readOnlyResult !== null) return readOnlyResult;
 if (toolCall.name ==="create_study_session") {
 if (!onCreateSession)
 return"Study-session creation is not available here.";
 const { arguments: args } = toolCall;
 const title = readOptionalString(args,"title");
 const subjectIds = readOptionalStringArray(args,"subjectIds") ?? [];
 const projectId = readOptionalString(args,"projectId");
 const startTime = readOptionalString(args,"startTime");
 const endTime = readOptionalString(args,"endTime");
 if (!title || !isIsoDateTime(startTime) || !isIsoDateTime(endTime)) {
 return"I need a title, valid start time, and valid end time before I can create that study session.";
 }
 if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
 return"The study session must end after it starts.";
 }
 if (
 subjectIds.some(
 (id) => !(subjects ?? []).some((subject) => subject.id === id),
 )
 ) {
 return"One or more subject ids do not exist, so I did not create the session.";
 }
 if (
 projectId &&
 !(projects ?? []).some((project) => project.id === projectId)
 ) {
 return `Project id "${projectId}" does not exist, so I did not create the session.`;
 }
 const result = await onCreateSession({
 title,
 subjectIds,
 projectId,
 startTime,
 endTime,
 description: readOptionalString(args,"description"),
 notes: readOptionalString(args,"notes"),
 });
 return result === false
 ? `I couldn't create **${title}**.`
 : `Created study session **${title}** for ${startTime}.`;
 }
 if (toolCall.name ==="update_study_session") {
 if (!onUpdateSession)
 return"Study-session editing is not available here.";
 const prepared = prepareStudySessionUpdate(toolCall, {
 sessions,
 subjects,
 projects,
 });
 if ("error" in prepared) return prepared.error;
 const result = await onUpdateSession(
 prepared.session.id,
 prepared.updates,
 );
 const title = prepared.updates.title ?? prepared.session.title;
 return result === false
 ? `I couldn't update **${title}**.`
 : `Updated study session **${title}**.`;
 }
 return executeEventToolCall(
 eventToolCallFromNative(toolCall),
 looseCreate,
 );
 },
 [
 contextDay,
 executeEventToolCall,
 onCreateSession,
 onUpdateSession,
 projects,
 sessions,
 subjects,
 ],
 );

 const runFocalAgent = useCallback(
 async (
 text: string,
 signal: AbortSignal,
 chatHistory: Message[],
 placeholderId?: string,
 ): Promise<string | null> => {
 const recent = chatHistory
 .slice(-6)
 .map((m) => `${m.role}: ${m.content}`)
 .join("\n");
 const looseCreate = parseLooseEventCreateRequest(
 text,
 contextDay,
 subjects,
 );
 if (getActiveProvider().supportsToolCalling) {
 const agentMessages: ChatTurn[] = [
 {
 role:"system",
 content: buildFocalAgentSystemMessage(
 makeSystemMessage(),
 contextDay,
 ),
 },
 ...chatHistory
 .slice(-8)
 .map((m): ChatTurn => ({ role: m.role, content: m.content })),
 { role:"user", content: text },
 ];
 let usedTool = false;
 for (let turn = 0; turn < FOCAL_AGENT_MAX_TURNS; turn++) {
 const result = await aiChatCompletionResult({
 messages: agentMessages,
 tools: FOCAL_AGENT_TOOLS,
 temperature: 0.2,
 maxTokens: ASSISTANT_MAX_TOKENS,
 signal,
 });
 if (!result.toolCalls?.length) {
 if (result.content.trim()) return result.content;
 break;
 }
 usedTool = true;
 agentMessages.push({
 role:"assistant",
 content: result.content,
 toolCalls: result.toolCalls,
 });
 for (const toolCall of result.toolCalls) {
 const activityId = makeId();
 if (placeholderId) {
 const activity: Message = {
 id: activityId,
 role:"assistant",
 content: toolRunningText(toolCall.name),
 toolActivity: { name: toolCall.name, status:"running" },
 };
 setMessages((prev) => {
 const index = prev.findIndex(
 (message) => message.id === placeholderId,
 );
 return index === -1
 ? [...prev, activity]
 : [...prev.slice(0, index), activity, ...prev.slice(index)];
 });
 }
 try {
 const toolResult = await executeFocalToolCall(
 toolCall,
 looseCreate,
 );
 if (placeholderId) {
 setMessages((prev) =>
 prev.map((message) =>
 message.id === activityId
 ? {
 ...message,
 content: toolDoneText(toolCall.name),
 toolActivity: { name: toolCall.name, status:"done" },
 }
 : message,
 ),
 );
 }
 agentMessages.push({
 role:"tool",
 toolName: toolCall.name,
 content: toolResult ??"No action taken.",
 });
 } catch (error) {
 if (placeholderId) {
 setMessages((prev) =>
 prev.map((message) =>
 message.id === activityId
 ? {
 ...message,
 content: `Failed ${toolDisplayName(toolCall.name)}`,
 toolActivity: {
 name: toolCall.name,
 status:"failed",
 },
 }
 : message,
 ),
 );
 }
 throw error;
 }
 }
 }
 if (usedTool) {
 // ponytail: hard cap prevents runaway tool loops; one no-tool pass lets
 // the model summarize the evidence it already gathered instead of
 // falling back to a fresh chat call that cannot see tool results.
 const result = await aiChatCompletionResult({
 messages: [
 ...agentMessages,
 {
 role:"user",
 content:
"Answer now from the tool results above. If the results were insufficient, say exactly what is missing.",
 },
 ],
 temperature: 0.2,
 maxTokens: ASSISTANT_MAX_TOKENS,
 signal,
 });
 if (result.content.trim()) return result.content;
 }
 return null;
 }
 if (!hasEventToolIntent(text)) return null;
 const raw = await aiStructuredCompletion<unknown>({
 system: `${makeSystemMessage()}

You may call exactly one local Focal calendar-event tool when the user's latest message asks to read, create, update, complete, reschedule, rename, or delete calendar events. Choose action"none" for study advice, explanations, project/session requests, or anything that should be answered normally.

Tool rules:
- Use list_events for"what is on","show","read","next", or date-range questions.
- Use get_event for details about one existing event.
- Use create_event only when title, eventType, and startTime can be inferred.
- If the user asks whether you can add/create events but gives no event details, choose create_event with missing data; the app will ask for the missing details.
- Use update_event only when exactly one existing event can be identified. Put only changed fields in data.
- Use delete_event only when exactly one existing event can be identified. The app will ask the user to confirm.
- Date phrases are relative to today (${contextDay}); emit ISO datetimes for startTime/endTime.
- Use only valid eventType values and subject ids from the context.`,
 user: `Recent chat:
${recent ||"None"}

${buildEventToolContext(events, subjects, contextDay)}

Latest user message:
${text}`,
 schemaName:"focal_event_tool_call",
 schema: EVENT_TOOL_SCHEMA,
 temperature: 0,
 maxTokens: 500,
 signal,
 });
 const call = normaliseEventToolCall(raw);
 if (call.action ==="none") {
 return hasEventMutationIntent(text)
 ? `Yes. Tell me the event title, date/time, and type (${EVENT_TYPE_ENUM.join(", ")}), and I can add or update it in Focal.`
 : null;
 }
 return executeEventToolCall(call, looseCreate);
 },
 [
 contextDay,
 executeFocalToolCall,
 executeEventToolCall,
 events,
 makeSystemMessage,
 subjects,
 ],
 );

 const send = useCallback(
 async (text: string) => {
 const trimmed = text.trim();
 if (!trimmed || pending) return;
 stopTypewriter();

 const userMsg: Message = { id: makeId(), role:"user", content: trimmed };
 const placeholderId = makeId();
 const placeholder: Message = {
 id: placeholderId,
 role:"assistant",
 content:"",
 pending: true,
 };
 setMessages((prev) => [...prev, userMsg, placeholder]);
 setInput("");
 setError(null);

 const systemMsg = makeSystemMessage();
 const chatHistory = messages.filter(isChatHistoryMessage);
 const history: ChatTurn[] = [
 { role:"system", content: systemMsg },
 ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
 { role:"user", content: trimmed },
 ];

 sendAbortRef.current = new AbortController();
 setPending(true);
 try {
 const toolReply = await runFocalAgent(
 trimmed,
 sendAbortRef.current.signal,
 chatHistory,
 placeholderId,
 );
 const reply =
 toolReply ??
 (await aiChatCompletion({
 messages: history,
 temperature: 0.4,
 maxTokens: ASSISTANT_MAX_TOKENS,
 signal: sendAbortRef.current.signal,
 }));
 animateTypewriter(placeholderId, reply);
 } catch (e) {
 finalizePlaceholder(placeholderId, e);
 } finally {
 sendAbortRef.current = null;
 setPending(false);
 }
 },
 [
 animateTypewriter,
 makeSystemMessage,
 messages,
 pending,
 runFocalAgent,
 stopTypewriter,
 finalizePlaceholder,
 ],
 );

 const sendDraft = useCallback(
 async (intent:"session" |"event", prompt: string) => {
 if (pending) return;
 stopTypewriter();

 const userMsg: Message = { id: makeId(), role:"user", content: prompt };
 const placeholderId = makeId();
 const placeholder: Message = {
 id: placeholderId,
 role:"assistant",
 content:"",
 pending: true,
 };
 setMessages((prev) => [...prev, userMsg, placeholder]);
 setError(null);

 const systemMsg = makeSystemMessage();
 const schema =
 intent ==="session" ? SESSION_DRAFT_SCHEMA : EVENT_DRAFT_SCHEMA;
 const schemaName = intent ==="session" ?"session_draft" :"event_draft";

 sendAbortRef.current = new AbortController();
 setPending(true);
 try {
 const raw = await aiStructuredCompletion<unknown>({
 system: systemMsg,
 user: prompt,
 schemaName,
 schema,
 temperature: 0.3,
 maxTokens: ASSISTANT_MAX_TOKENS,
 signal: sendAbortRef.current.signal,
 });

 const validated =
 intent ==="session"
 ? (raw as DraftStudySession)
 : (raw as DraftEvent);

 // ponytail: guard against models that omit required fields despite strict schema
 if (
 !validated ||
 typeof validated.title !=="string" ||
 typeof validated.startTime !=="string"
 ) {
 throw new Error(
"The AI returned an incomplete draft. Try again with a clearer prompt.",
 );
 }

 setMessages((prev) =>
 prev.map((m) =>
 m.id === placeholderId
 ? {
 ...m,
 content:
 intent ==="session"
 ? `I've drafted a study session: **${validated.title}** on ${validated.startTime.slice(0, 10)}.`
 : `I've drafted an event: **${validated.title}** on ${validated.startTime.slice(0, 10)}.`,
 pending: false,
 draft: { type: intent, data: validated },
 }
 : m,
 ),
 );
 } catch (e) {
 finalizePlaceholder(placeholderId, e);
 } finally {
 sendAbortRef.current = null;
 setPending(false);
 }
 },
 [makeSystemMessage, pending, stopTypewriter, finalizePlaceholder],
 );

 const regenerate = useCallback(
 async (assistantMessageId: string) => {
 if (pending) return;
 const trimmedHistory = messages.filter(isChatHistoryMessage);
 const targetIndex = trimmedHistory.findIndex(
 (m) => m.id === assistantMessageId,
 );
 if (targetIndex <= 0) return;
 const precedingUser = trimmedHistory[targetIndex - 1];
 if (precedingUser?.role !=="user") return;

 stopTypewriter();

 const placeholderId = makeId();
 const placeholder: Message = {
 id: placeholderId,
 role:"assistant",
 content:"",
 pending: true,
 };
 setMessages([
 ...trimmedHistory.slice(0, targetIndex),
 placeholder,
 ...trimmedHistory.slice(targetIndex + 1),
 ]);
 setError(null);
 setPending(true);
 sendAbortRef.current = new AbortController();

 const systemMsg = makeSystemMessage();
 const chatHistory = trimmedHistory.slice(0, targetIndex - 1);
 const history: ChatTurn[] = [
 { role:"system", content: systemMsg },
 ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
 { role:"user", content: precedingUser.content },
 ];

 try {
 const toolReply = await runFocalAgent(
 precedingUser.content,
 sendAbortRef.current.signal,
 chatHistory,
 placeholderId,
 );
 const reply =
 toolReply ??
 (await aiChatCompletion({
 messages: history,
 temperature: 0.4,
 maxTokens: ASSISTANT_MAX_TOKENS,
 signal: sendAbortRef.current.signal,
 }));
 animateTypewriter(placeholderId, reply);
 } catch (e) {
 finalizePlaceholder(placeholderId, e);
 } finally {
 sendAbortRef.current = null;
 setPending(false);
 }
 },
 [
 animateTypewriter,
 makeSystemMessage,
 messages,
 pending,
 runFocalAgent,
 stopTypewriter,
 finalizePlaceholder,
 ],
 );

 useEffect(() => {
 if (!open) {
 sendAbortRef.current?.abort();
 sendAbortRef.current = null;
 stopTypewriter();
 /* eslint-disable react-hooks/set-state-in-effect */
 setPending(false);
 setError(null);
 /* eslint-enable react-hooks/set-state-in-effect */
 }
 }, [open, stopTypewriter]);

 const handleSubmit = useCallback(() => {
 void send(input);
 }, [input, send]);

 const handleKeyDown = useCallback(
 (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
 if (e.key ==="Enter" && !e.shiftKey) {
 e.preventDefault();
 void send(input);
 }
 },
 [input, send],
 );

 const handleCopy = useCallback(async (messageId: string, content: string) => {
 try {
 await navigator.clipboard.writeText(content);
 setCopiedMessageId(messageId);
 toast.success("Copied to clipboard", { duration: 1800 });
 window.setTimeout(
 () =>
 setCopiedMessageId((current) =>
 current === messageId ? null : current,
 ),
 1400,
 );
 } catch {
 toast.error("Couldn't copy — clipboard access blocked");
 }
 }, []);

 const clearSnapshotRef = useRef<Message[] | null>(null);

 const handleClear = useCallback(() => {
 if (messages.length === 0 || pending) return;
 clearSnapshotRef.current = messages;
 setMessages([]);
 setError(null);
 stopTypewriter();
 showUndoToast({
 message:"Chat cleared",
 undoLabel:"Undo",
 duration: 8000,
 onUndo: () => {
 const snapshot = clearSnapshotRef.current;
 clearSnapshotRef.current = null;
 if (!snapshot) return;
 setMessages((current) => (current.length === 0 ? snapshot : current));
 },
 });
 }, [messages, pending, stopTypewriter]);

 const handleCreateFromDraft = useCallback(
 async (messageId: string, draft: Message["draft"]) => {
 if (!draft) return;
 try {
 if (draft.type ==="session" && onCreateSession) {
 await onCreateSession(draft.data as DraftStudySession);
 toast.success("Study session created");
 } else if (draft.type ==="event" && onCreateEvent) {
 await onCreateEvent(draft.data as DraftEvent);
 toast.success("Event created");
 }
 setMessages((prev) => prev.filter((m) => m.id !== messageId));
 } catch (e) {
 toast.error(
 `Failed to create: ${e instanceof Error ? e.message : String(e)}`,
 );
 }
 },
 [onCreateSession, onCreateEvent],
 );

 const handleDiscardDraft = useCallback((messageId: string) => {
 setMessages((prev) => prev.filter((m) => m.id !== messageId));
 }, []);

 const handleOpenAssistantSettings = useCallback(() => {
 onOpenSettings?.();
 onOpenChange(false);
 }, [onOpenChange, onOpenSettings]);

 const panelTransition =
 isDragging || reduceMotion ? ({ duration: 0 } as const) : TRANSITION.view;

 return (
 <AnimatePresence initial={false}>
 {open && (
 <motion.aside
 key="ai-panel"
 initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
 transition={panelTransition}
 style={{ width: `${width}px` }}
 className="relative flex h-full shrink-0 flex-col overflow-hidden rounded-lg border border-sidebar-border text-sidebar-foreground"
 role="complementary"
 aria-label="AI Assistant"
 >
 <button
 type="button"
 aria-label="Resize AI Assistant width"
 aria-orientation="vertical"
 aria-valuemin={ASSISTANT_WIDTH_MIN}
 aria-valuemax={ASSISTANT_WIDTH_MAX}
 aria-valuenow={width}
 onMouseDown={handleResizeStart}
 onKeyDown={handleResizeKeyDown}
 className="group absolute inset-y-0 left-0 z-20 flex w-2 cursor-ew-resize items-center justify-center bg-transparent outline-none"
 >
 <span
 aria-hidden
 className={cn(
"h-10 w-0.5 rounded-full bg-sidebar-border opacity-0 transition-opacity",
 isDragging
 ?"opacity-100 bg-primary/65"
 :"group-hover:opacity-100 group-focus-visible:opacity-100",
 )}
 />
 </button>

 <div className="shrink-0 border-b border-sidebar-border/80 px-3 py-3 pl-4">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0 space-y-2">
 <div className="flex items-center gap-2">
 <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
 <Sparkles className="h-3.5 w-3.5" />
 </div>
 <div className="min-w-0">
 <p className="truncate text-sm font-semibold leading-tight">
 Study Assistant
 </p>
 <p className="truncate text-micro leading-tight text-muted-foreground">
 {providerMissing
 ? `${providerName} needs setup`
 : providerIsOllama
 ? `${activeModel} · via Ollama`
 : `Answering with ${providerName}`}
 </p>
 </div>
 </div>
 <div
 className={cn(
"inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-micro font-medium",
 providerMissing
 ?"border-destructive/25 bg-destructive/10 text-destructive"
 :"border-sidebar-border bg-background/40 text-muted-foreground",
 )}
 >
 {providerMissing ? (
 <AlertCircle className="h-3 w-3 shrink-0" />
 ) : (
 <CheckCircle2 className="h-3 w-3 shrink-0 text-primary" />
 )}
 <span className="truncate text-xs">
 {providerMissing
 ?"AI setup required"
 : overview.hasFocalContext
 ?"Using your assessments and study plan"
 :"Ready for quick study help"}
 </span>
 </div>
 {providerMissing && onOpenSettings && (
 <Button
 size="sm"
 variant="outline"
 onClick={handleOpenAssistantSettings}
 className="h-7 w-fit"
 >
 Configure AI
 </Button>
 )}
 </div>
 <div className="flex shrink-0 items-center gap-1">
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 size="icon-sm"
 variant="ghost"
 onClick={handleClear}
 disabled={messages.length === 0 || pending}
 aria-label="Clear conversation"
 >
 <Eraser className="h-3.5 w-3.5" />
 </Button>
 </TooltipTrigger>
 <TooltipContent side="bottom">
 Clear conversation
 </TooltipContent>
 </Tooltip>
 {pending && (
 <Button
 size="icon-sm"
 variant="ghost"
 onClick={cancel}
 aria-label="Cancel response"
 >
 <Square className="h-3.5 w-3.5" />
 </Button>
 )}
 <Button
 size="icon-sm"
 variant="ghost"
 onClick={() => onOpenChange(false)}
 aria-label="Close assistant"
 >
 <PanelRightClose className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>
 </div>      <ScrollArea
        viewportRef={scrollRef}
        className="flex min-h-0 flex-1 flex-col px-3 py-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-between gap-5">
 <div className="pt-2">
 <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-background/45 text-primary">
 <Brain className="h-4 w-4" />
 </div>
 <p className="max-w-60 text-sm font-semibold leading-snug">
 {overview.title}
 </p>
 <p className="mt-1.5 max-w-64 text-xs leading-relaxed text-muted-foreground">
 {overview.detail}
 </p>
 {overview.hasFocalContext && (
 <Button
 type="button"
 onClick={() => void send(overview.prompt)}
 disabled={pending || providerMissing}
 size="sm"
 className="mt-3"
 >
 <Wand2 className="h-3 w-3" />
 Choose my next block
 </Button>
 )}
 </div>
 <div className="space-y-2">
 <div className="flex items-center gap-1.5 text-micro font-medium text-muted-foreground">
 <MessageSquareText className="h-3 w-3" />
 Starters
 </div>
 <motion.div
 className="grid w-full gap-1.5"
 variants={staggerContainer(0.05, 0.08)}
 initial="initial"
 animate="animate"
 >
 {starterPrompts.map(({ label, prompt }) => (
 <motion.button
 key={prompt}
 type="button"
 onClick={() => void send(prompt)}
 disabled={pending || providerMissing}
 variants={staggerItem}
 transition={reduceMotion ? { duration: 0 } : undefined}
 className={cn(
"group flex min-h-12 w-full items-start gap-2 rounded-xl border border-sidebar-border/80 bg-background/40 px-2.5 py-2 text-left transition-colors",
"hover:border-primary/25 hover:bg-sidebar-accent/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
"disabled:cursor-not-allowed disabled:opacity-50",
 )}
 >
 <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
 <Wand2 className="h-3 w-3" />
 </span>
 <span className="min-w-0">
 <span className="block text-xs font-medium leading-tight text-foreground">
 {label}
 </span>
 <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
 {prompt}
 </span>
 </span>
 </motion.button>
 ))}
 </motion.div>
 </div>          </div>
        ) : (
          <div className="flex h-full flex-col gap-3">
 {messages.map((m) => (
 <Bubble
 key={m.id}
 message={m}
 isCopied={copiedMessageId === m.id}
 canRegenerate={
 m.role ==="assistant" &&
 !m.pending &&
 !m.cancelled &&
 !m.toolActivity &&
 !pending
 }
 onCopy={() => void handleCopy(m.id, m.content)}
 onRegenerate={() => void regenerate(m.id)}
 onCreateFromDraft={
 m.draft
 ? () => void handleCreateFromDraft(m.id, m.draft)
 : undefined
 }
 onDiscardDraft={
 m.draft ? () => handleDiscardDraft(m.id) : undefined
 }
 onFollowUp={
 m.id === latestAssistantMessageId
 ? (prompt) => void send(prompt)
 : undefined
 }
 />          ))}
        </div>
        )}
      </ScrollArea>

 <AnimatePresence>
 {error && (
 <motion.div
 key="ai-error"
 initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
 animate={{ opacity: 1, y: 0 }}
 exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
 transition={reduceMotion ? { duration: 0 } : TRANSITION.exit}
 className="mx-3 mb-2 flex shrink-0 items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
 >
 <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
 <div className="min-w-0">
 <p>{error.message}</p>
 {error.hint && (
 <p className="mt-0.5 text-destructive/70">{error.hint}</p>
 )}
 {onOpenSettings && (
 <Button
 type="button"
 onClick={handleOpenAssistantSettings}
 variant="link"
 size="xs"
 className="mt-1.5 text-destructive"
 >
 Open AI settings
 </Button>
 )}
 </div>
 </motion.div>
 )}
 </AnimatePresence>

 {messages.length > 0 && (
 <QuickActionChips
 disabled={pending || providerMissing}
 onPick={(prompt) => void send(prompt)}
 onCreate={({ intent, prompt }) => void sendDraft(intent, prompt)}
 />
 )}

 <form
 onSubmit={(e) => {
 e.preventDefault();
 handleSubmit();
 }}
 className="shrink-0 border-t border-sidebar-border/80 p-3"
 >
 <div
 className={cn(
"flex items-end gap-2 rounded-xl border border-input bg-background/55 p-1.5 transition-colors",
"focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/45 dark:bg-input/25",
 providerMissing &&"opacity-70",
 )}
 >
 <Textarea
 ref={inputRef}
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder={
 providerMissing
 ?"Configure AI in Settings to chat"
 : contextRefs?.project
 ? `Ask about ${contextRefs.project.name}`
 :"Ask about deadlines, sessions, or study strategy"
 }
 disabled={providerMissing || pending}
 rows={2}
 className="min-h-11 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
 />
 <div className="flex flex-col items-end gap-1.5">
 {costDisplay && (
 <span
 className="inline-flex items-center gap-1 rounded-full border border-sidebar-border/80 bg-background/45 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
 title="Ceiling estimate · flat rate; actual cost depends on the active model"
 aria-label={`Estimated cost ${costDisplay}`}
 >
 {costDisplay}
 </span>
 )}
 <Button
 type="submit"
 size="icon-sm"
 disabled={!input.trim() || pending || providerMissing}
 className="text-primary-foreground"
 aria-label="Send"
 >
 {pending ? (
 <Loader2 className="h-3.5 w-3.5 animate-spin" />
 ) : (
 <Send className="h-3.5 w-3.5" />
 )}
 </Button>
 </div>
 </div>
 {!providerMissing && (
 <p className="mt-1.5 px-1 text-micro text-muted-foreground">
 Enter to send · Shift + Enter for a new line
 </p>
 )}
 </form>
 </motion.aside>
 )}
 </AnimatePresence>
 );
}

interface MarkdownProps {
 node?: unknown;
 children?: React.ReactNode;
}

const MARKDOWN_COMPONENTS = {
 p: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLParagraphElement>) => (
 <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed" {...props}>
 {children}
 </p>
 ),
 ul: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLUListElement>) => (
 <ul
 className="my-1.5 ml-4 list-disc space-y-0.5 marker:text-muted-foreground/70"
 {...props}
 >
 {children}
 </ul>
 ),
 ol: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.OlHTMLAttributes<HTMLOListElement>) => (
 <ol
 className="my-1.5 ml-4 list-decimal space-y-0.5 marker:text-muted-foreground/70"
 {...props}
 >
 {children}
 </ol>
 ),
 li: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.LiHTMLAttributes<HTMLLIElement>) => (
 <li className="leading-relaxed" {...props}>
 {children}
 </li>
 ),
 h1: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLHeadingElement>) => (
 <h1
 className="mt-2 mb-1 text-[0.95rem] font-semibold tracking-tight"
 {...props}
 >
 {children}
 </h1>
 ),
 h2: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLHeadingElement>) => (
 <h2
 className="mt-2 mb-1 text-[0.9rem] font-semibold tracking-tight"
 {...props}
 >
 {children}
 </h2>
 ),
 h3: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLHeadingElement>) => (
 <h3 className="mt-1.5 mb-0.5 text-[0.85rem] font-semibold" {...props}>
 {children}
 </h3>
 ),
 code: ({
 node: _node,
 inline,
 children,
 ...props
 }: MarkdownProps & {
 inline?: boolean;
 } & React.HTMLAttributes<HTMLElement>) =>
 inline ? (
 <code
 className="rounded bg-foreground/8 px-1 py-px font-mono text-[0.82em]"
 {...props}
 >
 {children}
 </code>
 ) : (
 <code className="font-mono text-[0.78em]" {...props}>
 {children}
 </code>
 ),
 pre: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLPreElement>) => (
 <ScrollArea className="my-1.5 rounded-lg bg-foreground/8 ring-1 ring-border/40">
 <pre
 className="font-mono text-[0.78em] leading-relaxed p-2"
 {...props}
 >
 {children}
 </pre>
 <ScrollBar orientation="horizontal" />
 </ScrollArea>
 ),
 a: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
 <a
 className="text-primary underline-offset-2 hover:underline"
 target="_blank"
 rel="noopener noreferrer"
 {...props}
 >
 {children}
 </a>
 ),
 strong: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLElement>) => (
 <strong className="font-semibold" {...props}>
 {children}
 </strong>
 ),
 em: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLElement>) => (
 <em className="italic" {...props}>
 {children}
 </em>
 ),
 blockquote: ({
 node: _node,
 children,
 ...props
 }: MarkdownProps & React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
 <blockquote
 className="my-1.5 rounded-md bg-primary/8 px-2.5 py-1.5 italic text-muted-foreground"
 {...props}
 >
 {children}
 </blockquote>
 ),
 hr: ({
 node: _node,
 ...props
 }: MarkdownProps & React.HTMLAttributes<HTMLHRElement>) => (
 <hr className="my-2 border-border/60" {...props} />
 ),
} as const;

function Bubble({
 message,
 isCopied,
 canRegenerate,
 onCopy,
 onRegenerate,
 onCreateFromDraft,
 onDiscardDraft,
 onFollowUp,
}: {
 message: Message;
 isCopied: boolean;
 canRegenerate: boolean;
 onCopy: () => void;
 onRegenerate: () => void;
 onCreateFromDraft?: () => void;
 onDiscardDraft?: () => void;
 onFollowUp?: (prompt: string) => void;
}) {
 const isUser = message.role ==="user";
 const reduceMotion = useReducedMotion();
 const hasDraft = Boolean(message.draft);
 const isToolActivity = Boolean(message.toolActivity);
 const toolDone = message.toolActivity?.status ==="done";
 const toolFailed = message.toolActivity?.status ==="failed";
 return (
 <motion.div
 initial={reduceMotion ? false : { opacity: 0, y: 6 }}
 animate={{ opacity: 1, y: 0 }}
 transition={reduceMotion ? { duration: 0 } : TRANSITION.view}
 className={cn(
"group/bubble relative flex",
 isUser ?"justify-end" :"justify-start",
 )}
 >
 <div
 className={cn(
"min-w-0 max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed",
 isUser
 ?"bg-primary text-primary-foreground"
 : isToolActivity
 ?"border border-sidebar-border/70 bg-muted/30 text-muted-foreground"
 : message.cancelled
 ?"border border-sidebar-border bg-muted/35 italic text-muted-foreground"
 :"border border-sidebar-border/75 bg-background/55 text-foreground",
 )}
 >
 {isToolActivity && message.toolActivity ? (
 <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium">
 {toolDone ? (
 <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
 ) : toolFailed ? (
 <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
 ) : (
 <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
 )}
 <span className="truncate">{message.content}</span>
 <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
 {message.toolActivity.name}
 </span>
 </span>
 ) : (
 !isUser &&
 !message.pending &&
 !message.cancelled &&
 !hasDraft && (
 <div className="mb-1.5 flex items-center gap-1.5 text-micro font-medium text-muted-foreground">
 <Wand2 className="h-3 w-3 text-primary" />
 Assistant
 </div>
 )
 )}
 {isToolActivity ? null : message.pending ? (
 <span className="inline-flex items-center gap-2 text-muted-foreground">
 <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
 Thinking
 </span>
 ) : isUser ? (
 <p className="whitespace-pre-wrap wrap-break-word">
 {message.content}
 </p>
 ) : (
 <div className="focal-ai-markdown">
 <ReactMarkdown components={MARKDOWN_COMPONENTS}>
 {message.content}
 </ReactMarkdown>
 {message.content.length === 0 && (
 <span className="ml-0 inline-flex text-muted-foreground motion-safe:animate-pulse">
 ▍
 </span>
 )}
 </div>
 )}

 {hasDraft && message.draft && (
 <DraftCard
 draft={message.draft}
 onCreate={onCreateFromDraft}
 onDiscard={onDiscardDraft}
 />
 )}

 {onFollowUp && message.followUps && message.followUps.length > 0 && (
 <div className="mt-2.5 flex flex-col items-start gap-1.5 border-t border-sidebar-border/70 pt-2.5">
 {message.followUps.map((prompt) => (
 <Button
 key={prompt}
 type="button"
 onClick={() => onFollowUp(prompt)}
 variant="secondary"
 size="sm"
 className="h-auto max-w-full text-left whitespace-normal"
 >
 {prompt}
 </Button>          ))}
        </div>
        )}
 {!isUser && !isToolActivity && !message.pending && !message.cancelled && (
 <div
 className={cn(
"absolute bottom-1 right-1 flex items-center gap-0.5 rounded-md border border-sidebar-border bg-background/85 px-0.5 py-0.5 opacity-0 backdrop-blur-sm transition-opacity",
"group-hover/bubble:opacity-100 focus-within:opacity-100",
 )}
 >
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 type="button"
 onClick={onCopy}
 aria-label={isCopied ?"Copied" :"Copy message"}
 variant="ghost"
 size="icon-xs"
 >
 {isCopied ? (
 <Check className="h-3 w-3 text-primary" />
 ) : (
 <ClipboardCopy className="h-3 w-3" />
 )}
 </Button>
 </TooltipTrigger>
 <TooltipContent side="bottom">
 {isCopied ?"Copied" :"Copy"}
 </TooltipContent>
 </Tooltip>
 <Tooltip>
 <TooltipTrigger asChild>
 <Button
 type="button"
 onClick={onRegenerate}
 disabled={!canRegenerate}
 aria-label="Regenerate reply"
 variant="ghost"
 size="icon-xs"
 >
 <RefreshCw className="h-3 w-3" />
 </Button>
 </TooltipTrigger>
 <TooltipContent side="bottom">Regenerate</TooltipContent>
 </Tooltip>
 </div>
 )}
 </div>
 </motion.div>
 );
}

function DraftCard({
 draft,
 onCreate,
 onDiscard,
}: {
 draft: NonNullable<Message["draft"]>;
 onCreate?: () => void;
 onDiscard?: () => void;
}) {
 const isSession = draft.type ==="session";
 const data = draft.data;
 const title = isSession
 ? (data as DraftStudySession).title
 : (data as DraftEvent).title;
 const date = isSession
 ? (data as DraftStudySession).startTime.slice(0, 10)
 : (data as DraftEvent).startTime.slice(0, 10);
 const Icon = isSession ? BookOpen : Calendar;
 return (
 <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
 <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
 <Icon className="h-3.5 w-3.5" />
 {isSession ?"Study session draft" :"Event draft"}
 </div>
 <div className="space-y-1 text-xs text-foreground">
 <p className="font-medium">{title}</p>
 <p className="text-muted-foreground">{date}</p>
 </div>
 <div className="mt-2.5 flex items-center gap-1.5">
 <Button
 size="sm"
 className="h-7 text-xs"
 onClick={onCreate}
 disabled={!onCreate}
 >
 <Check className="mr-1 h-3 w-3" />
 Create
 </Button>
 <Button
 size="sm"
 variant="ghost"
 className="h-7 text-xs"
 onClick={onDiscard}
 >
 <X className="mr-1 h-3 w-3" />
 Discard
 </Button>
 </div>
 </div>
 );
}

function QuickActionChips({
 disabled,
 onPick,
 onCreate,
}: {
 disabled: boolean;
 onPick: (prompt: string) => void;
 onCreate: (opts: { intent:"session" |"event"; prompt: string }) => void;
}) {
 return (
 <div
 className="border-t border-sidebar-border/60 px-3 py-2"
 role="toolbar"
 aria-label="Quick actions"
 >
 <ScrollArea className="w-full whitespace-nowrap">
 <div
 className={cn(
"flex gap-1.5 snap-x snap-mandatory",
 )}
 >
 {QUICK_ACTION_PROMPTS.map(({ label, prompt }) => (
 <Button
 key={prompt}
 type="button"
 disabled={disabled}
 onClick={() => onPick(prompt)}
 variant="outline"
 size="sm"
 className="snap-start"
 >
 <Wand2 className="h-3 w-3 text-primary" />
 {label}
 </Button>
 ))}
 {CREATION_QUICK_ACTIONS.map(({ label, icon: Icon, intent, prompt }) => (
 <Button
 key={intent}
 type="button"
 disabled={disabled}
 onClick={() => onCreate({ intent, prompt })}
 variant="outline"
 size="sm"
 className="snap-start"
 >
 <Icon className="h-3 w-3 text-primary" />
 {label}
 </Button>
 ))}
 </div>
 <ScrollBar orientation="horizontal" />
 </ScrollArea>
 </div>
 );
}
