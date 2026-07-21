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
import { cn, getLocalDateValue } from"@/lib/utils";
import { showUndoToast } from"@/lib/undoToast";
import { toast } from"sonner";
import {
 aiChatCompletion,
 aiChatCompletionResult,
 aiStructuredCompletion,
 buildUserBriefing,
 describeAiError,
 type ChatTurn,
} from"@/lib/aiAssistant";
import {
 getActiveProvider,
 getEffectiveModel,
 type ToolCall,
} from"@/lib/providers";
import type {
 Project,
 StudySession,
 CalendarEvent,
 Subject,
 EventType,
} from"@/lib/types";
import {
 buildAssistantOverview,
 buildCalendarContext,
 buildContextBits,
 buildEventToolContext,
 buildFocalAgentSystemMessage,
 buildSystemMessage,
 EVENT_DRAFT_SCHEMA,
 EVENT_TYPE_ENUM,
 EVENT_TOOL_SCHEMA,
 eventToolCallFromNative,
 executeReadOnlyFocalToolCall,
 findToolEvent,
 FOCAL_AGENT_TOOLS,
 formatEventLine,
 hasEventMutationIntent,
 hasEventToolIntent,
 listToolEvents,
 normaliseEventToolCall,
 parseLooseEventCreateRequest,
 prepareStudySessionUpdate,
 readOptionalString,
 readOptionalStringArray,
 SESSION_DRAFT_SCHEMA,
 toolDisplayName,
 toolDoneText,
 toolRunningText,
 type DraftEvent,
 type DraftStudySession,
 type EventToolData,
 type EventToolCall,
 isIsoDateTime,
} from "@/features/assistant/agent";


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
