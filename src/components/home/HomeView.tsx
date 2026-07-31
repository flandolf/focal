import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  memo,
  Fragment,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { format, isSameMonth, parseISO, differenceInDays } from "date-fns";
import {
  Clock,
  AlertCircle,
  CalendarPlus,
  MapPin,
  Trash2,
  X,
  CheckCircle2,
  Combine,
  Check,
  Wand2,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Pin,
  Play,
  Settings2,
  Sparkles,
} from "lucide-react";
import {
  getDayLabelForDate,
  getTimetableEntriesForDay,
  getCurrentPeriodInfo,
} from "@/lib/timetable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatDeadline,
  getDeadlineTypeInfo,
  getSubjectById,
  getEventTypeInfo,
  getSessionSubjectIds,
  getSessionEffectiveMinutes,
  cn,
  getLocalDateValue,
  formatTime12,
} from "@/lib/utils";
import { TextEventPlanner } from "@/components/planning/TextEventPlanner";
import type { PrepBalanceItem } from "@/lib/planning";
import { buildTodayOverview } from "@/features/home/todayOverview";
import {
  FOCUS_PRIORITIES_KEY,
  getPriorityItems,
  readFocusPriorities,
} from "@/lib/studyPriority";
import type { TimetableConfig } from "@/lib/settings";
import type {
  CalendarEvent,
  PriorityItem,
  Project,
  StudySession,
  StudySessionDraft,
} from "@/lib/types";
import { CalendarGrid } from "@/components/home/CalendarGrid";
import { DayDetail } from "@/components/home/DayDetail";
import { QuickLinks } from "@/components/home/QuickLinks";
import { StudyPriorities } from "@/components/home/StudyPriorities";
import { RecentActivity } from "@/components/home/RecentActivity";

interface MonthBriefItem {
  id: string;
  title: string;
  meta: string;
  date: Date;
  color: string;
  kind: "assessment" | "session" | "event";
  projectId?: string;
  session?: StudySession;
  event?: CalendarEvent;
}

const CALENDAR_SESSION_COLOR = "var(--primary)";
const PREP_COMPLETED_CREDIT_WINDOW_DAYS = 7;

interface HomeViewProps {
  projects: Project[];
  sessions: StudySession[];
  events: CalendarEvent[];
  onSelectProject: (projectId: string) => void;
  onSelectSession: (session: StudySession) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onNewSession: (initialDate?: Date) => void;
  onNewEvent: (initialDate?: Date) => void;
  onNewProject: () => void;
  onCreateEvents: (
    events: Omit<CalendarEvent, "id" | "created_at">[],
  ) => Promise<void>;
  onCreateStudySessions: (sessions: StudySessionDraft[]) => Promise<void>;
  onDeleteCalendarItems: (itemIds: {
    eventIds: string[];
    sessionIds: string[];
  }) => Promise<void>;
  onSetCalendarItemsCompleted: (
    itemIds: { eventIds: string[]; sessionIds: string[] },
    isCompleted: boolean,
  ) => Promise<void>;
  onMergeEvents: (ids: string[]) => Promise<void>;
  onMergeStudySessions: (ids: string[]) => Promise<void>;
  onGoTimetable: () => void;
  timetableConfig: TimetableConfig | null;
  onMoveEvent?: (
    eventId: string,
    newStartTime: string,
    newEndTime?: string,
  ) => void;
  onOpenAiAssistant?: () => void;
  onStartFocus: (item: PriorityItem) => void;
}

export const HomeView = memo(function HomeView({
  // ponytail: Keep the month calendar as the primary surface; decisions orbit it.
  projects,
  sessions,
  events,
  onSelectProject,
  onSelectSession,
  onSelectEvent,
  onNewSession,
  onNewEvent,
  onNewProject: _onNewProject,
  onCreateEvents,
  onCreateStudySessions,
  onDeleteCalendarItems,
  onSetCalendarItemsCompleted,
  onMergeEvents,
  onMergeStudySessions,
  onGoTimetable,
  onMoveEvent,
  timetableConfig,
  onOpenAiAssistant,
  onStartFocus,
}: HomeViewProps) {
  const [clockNow, setClockNow] = useState(() => new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    getLocalDateValue(new Date()),
  );
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [prioritiesOpen, setPrioritiesOpen] = useState(true);
  const [calendarSelectionMode, setCalendarSelectionMode] = useState(false);
  const [recentActivityOpen, setRecentActivityOpen] = useState(true);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [eventBatchSaving, setEventBatchSaving] = useState(false);
  const [textPlannerOpen, setTextPlannerOpen] = useState(false);
  const [textPlannerTitle, setTextPlannerTitle] = useState("Text to Events");
  const [textPlannerDescription, setTextPlannerDescription] = useState(
    "Paste a notice, rough plan, or teacher message. Review drafts before adding them.",
  );
  const [textPlannerInitialText, setTextPlannerInitialText] = useState("");
  const [focusPriorities, setFocusPriorities] = useState(readFocusPriorities);

  useEffect(() => {
    const refreshNow = () => setClockNow(new Date());
    const timer = window.setInterval(refreshNow, 60_000);
    window.addEventListener("focus", refreshNow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshNow);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(FOCUS_PRIORITIES_KEY, JSON.stringify(focusPriorities));
  }, [focusPriorities]);

  const selectedCalendarDate = selectedDate
    ? parseISO(selectedDate)
    : undefined;

  const {
    activeProjects,
    projectsWithDeadlines,
    overdueProjects,
    dueThisWeek,
    completedSessions,
    totalStudyHours,
    planningSubjects,
    recentActivity,
    topSubjects,
    upcomingSessions,
    upcomingEvents,
    deadlinesByDate,
    sessionsByDate,
    eventsByDate,
    now,
  } = useMemo(
    () => buildTodayOverview(projects, sessions, events, clockNow),
    [clockNow, events, projects, sessions],
  );

  const prioritySubjectIds = useMemo(() => {
    const ids = new Set<string>();
    activeProjects.forEach((project) => {
      if (project.subjectId) ids.add(project.subjectId);
    });
    events.forEach((event) => {
      if (!event.isFinished && event.subjectId) ids.add(event.subjectId);
    });
    return ids;
  }, [activeProjects, events]);
  const prioritySubjects = useMemo(
    () => planningSubjects.filter((subject) => prioritySubjectIds.has(subject.id)),
    [planningSubjects, prioritySubjectIds],
  );
  const effectiveSubjectOrder = useMemo(() => {
    const available = new Set(prioritySubjects.map((subject) => subject.id));
    const saved = focusPriorities.subjectOrder.filter((subjectId) => available.has(subjectId));
    return [
      ...saved,
      ...prioritySubjects.map((subject) => subject.id).filter((subjectId) => !saved.includes(subjectId)),
    ];
  }, [focusPriorities.subjectOrder, prioritySubjects]);
  const priorityItems = useMemo(
    () => getPriorityItems({
      projects,
      sessions,
      events,
      now: now.getTime(),
      subjectOrder: effectiveSubjectOrder,
      pinnedEventIds: focusPriorities.pinnedEventIds,
    }),
    [effectiveSubjectOrder, events, focusPriorities.pinnedEventIds, now, projects, sessions],
  );
  const nextFocus = priorityItems[0];
  const nextFocusSubject = nextFocus?.subjectIds[0]
    ? getSubjectById(nextFocus.subjectIds[0])
    : undefined;
  const pinnableEvents = useMemo(() => {
    const cutoff = now.getTime() + 30 * 24 * 60 * 60 * 1000;
    return events
      .filter((event) => {
        const start = parseISO(event.startTime).getTime();
        return !event.isFinished && start >= now.getTime() && start <= cutoff;
      })
      .sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
      .slice(0, 8);
  }, [events, now]);

  const movePrioritySubject = (subjectId: string, direction: -1 | 1) => {
    const index = effectiveSubjectOrder.indexOf(subjectId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= effectiveSubjectOrder.length) return;
    const next = [...effectiveSubjectOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setFocusPriorities((current) => ({ ...current, subjectOrder: next }));
  };

  const togglePinnedEvent = (eventId: string) => {
    setFocusPriorities((current) => ({
      ...current,
      pinnedEventIds: current.pinnedEventIds.includes(eventId)
        ? current.pinnedEventIds.filter((id) => id !== eventId)
        : [...current.pinnedEventIds, eventId],
    }));
  };

  const selectedEventIdSet = useMemo(
    () => new Set(selectedEventIds),
    [selectedEventIds],
  );
  const selectedSessionIdSet = useMemo(
    () => new Set(selectedSessionIds),
    [selectedSessionIds],
  );
  const selectedDayDeadlines = selectedDate
    ? (deadlinesByDate[selectedDate] ?? [])
    : [];
  const selectedDaySessions = selectedDate
    ? (sessionsByDate[selectedDate] ?? [])
    : [];
  const selectedDayEvents = selectedDate
    ? (eventsByDate[selectedDate] ?? [])
    : [];
  const todayDateKey = getLocalDateValue(now);
  const headingDateKey = selectedDate ?? todayDateKey;
  const headingDate = parseISO(headingDateKey);
  const selectedStudyHours = (sessionsByDate[headingDateKey] ?? [])
    .filter((session) => session.status === "completed")
    .reduce((total, session) => total + getSessionEffectiveMinutes(session), 0) / 60;
  const selectedBatchEvents = selectedDayEvents.filter((event) =>
    selectedEventIdSet.has(event.id),
  );
  const selectedBatchSessions = selectedDaySessions.filter((session) =>
    selectedSessionIdSet.has(session.id),
  );
  const selectedBatchCount =
    selectedBatchEvents.length + selectedBatchSessions.length;
  const canMergeSelectedEvents =
    selectedBatchEvents.length >= 2 && selectedBatchSessions.length === 0;
  const canMergeSelectedSessions =
    selectedBatchSessions.length >= 2 && selectedBatchEvents.length === 0;
  const canMergeSelectedItems =
    canMergeSelectedEvents || canMergeSelectedSessions;
  const allSelectedItemsComplete =
    selectedBatchCount > 0 &&
    selectedBatchEvents.every((event) => event.isFinished) &&
    selectedBatchSessions.every((session) => session.status === "completed");

  const clearEventSelection = () => {
    setCalendarSelectionMode(false);
    setSelectedEventIds([]);
    setSelectedSessionIds([]);
  };

  const handleSelectCalendarDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    clearEventSelection();
  };

  const handleToggleEventSelection = (eventId: string) => {
    setSelectedEventIds((current) =>
      current.includes(eventId)
        ? current.filter((id) => id !== eventId)
        : [...current, eventId],
    );
  };

  const handleToggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId],
    );
  };

  const handleSelectAllCalendarItems = () => {
    setSelectedEventIds(selectedDayEvents.map((event) => event.id));
    setSelectedSessionIds(selectedDaySessions.map((session) => session.id));
  };

  const handleDeleteSelectedEvents = async () => {
    if (selectedBatchCount === 0) return;
    setEventBatchSaving(true);
    try {
      const eventIds = selectedBatchEvents.map((event) => event.id);
      const sessionIds = selectedBatchSessions.map((session) => session.id);
      await onDeleteCalendarItems({ eventIds, sessionIds });
      clearEventSelection();
    } finally {
      setEventBatchSaving(false);
    }
  };

  const handleMergeSelectedEvents = async () => {
    if (!canMergeSelectedItems) return;
    setEventBatchSaving(true);
    try {
      if (canMergeSelectedEvents) {
        await onMergeEvents(selectedBatchEvents.map((event) => event.id));
      } else if (canMergeSelectedSessions) {
        await onMergeStudySessions(
          selectedBatchSessions.map((session) => session.id),
        );
      }
      clearEventSelection();
    } finally {
      setEventBatchSaving(false);
    }
  };

  const handleToggleSelectedEventsComplete = async () => {
    if (selectedBatchCount === 0) return;
    setEventBatchSaving(true);
    try {
      const eventIds = selectedBatchEvents.map((event) => event.id);
      const sessionIds = selectedBatchSessions.map((session) => session.id);
      const nextComplete = !allSelectedItemsComplete;
      await onSetCalendarItemsCompleted({ eventIds, sessionIds }, nextComplete);
      clearEventSelection();
    } finally {
      setEventBatchSaving(false);
    }
  };

  const monthAgendaStart = isSameMonth(currentMonth, now)
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : (() => {
        const d = new Date(currentMonth);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        return d;
      })();
  const isMonthItemVisible = (date: Date) =>
    date >= monthAgendaStart &&
    (() => {
      const d = new Date(currentMonth);
      d.setMonth(d.getMonth() + 1, 0);
      d.setHours(23, 59, 59, 999);
      return d;
    })() >= date;

  const monthBriefItems: MonthBriefItem[] = [
    ...projectsWithDeadlines
      .filter(
        (project) =>
          project.deadline && isMonthItemVisible(parseISO(project.deadline)),
      )
      .map((project) => {
        const subject = getSubjectById(project.subjectId);
        return {
          id: `assessment-${project.id}`,
          title: project.name,
          meta: `${project.deadlineType ? getDeadlineTypeInfo(project.deadlineType).label : "Assessment"} · ${formatDeadline(project.deadline!)}`,
          date: parseISO(project.deadline!),
          color: subject?.color ?? "var(--primary)",
          kind: "assessment" as const,
          projectId: project.id,
        };
      }),
    ...(() => {
      const plannedSessions = sessions.filter(
        (session) =>
          session.status === "planned" &&
          isMonthItemVisible(parseISO(session.startTime)),
      );
      const subjectDayMap = new Map<
        string,
        {
          count: number;
          totalMinutes: number;
          date: Date;
          subjectId: string;
          projectName: string;
        }
      >();
      for (const session of plannedSessions) {
        const project = session.projectId
          ? projects.find((candidate) => candidate.id === session.projectId)
          : undefined;
        const subjectIds = getSessionSubjectIds(session, project);
        const dateKey = format(parseISO(session.startTime), "yyyy-MM-dd");
        const durationMinutes = getSessionEffectiveMinutes(session);
        const sessionContext =
          project?.name ??
          (subjectIds
            .map(
              (subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId,
            )
            .join(", ") ||
            "Study session");
        const minutesPerSubject = durationMinutes / (subjectIds.length || 1);
        for (const subjectId of subjectIds) {
          const key = `${dateKey}-${subjectId}`;
          const existing = subjectDayMap.get(key);
          if (existing) {
            existing.count++;
            existing.totalMinutes += minutesPerSubject;
          } else {
            subjectDayMap.set(key, {
              count: 1,
              totalMinutes: minutesPerSubject,
              date: parseISO(session.startTime),
              subjectId,
              projectName: sessionContext,
            });
          }
        }
      }
      return Array.from(subjectDayMap.entries()).map(([, group]) => {
        const subject = getSubjectById(group.subjectId);
        const totalHours = Math.round(group.totalMinutes / 6) / 10;
        const hourLabel =
          totalHours >= 1
            ? `${totalHours}h`
            : `${Math.round(group.totalMinutes)}m`;
        const meta =
          group.count > 1
            ? `${group.count} sessions · ${hourLabel} · ${group.projectName}`
            : `${hourLabel} · ${group.projectName}`;
        return {
          id: `session-${group.subjectId}-${format(group.date, "yyyy-MM-dd")}`,
          title: subject?.shortCode ?? group.subjectId,
          meta,
          date: group.date,
          color: subject?.color ?? CALENDAR_SESSION_COLOR,
          kind: "session" as const,
        };
      });
    })(),
    ...events
      .filter(
        (event) =>
          !event.isFinished && isMonthItemVisible(parseISO(event.startTime)),
      )
      .map((event) => {
        const subject = getSubjectById(event.subjectId);
        const eventInfo = getEventTypeInfo(event.eventType);
        const startDate = parseISO(event.startTime);
        const isMultiDay =
          event.endTime &&
          format(startDate, "yyyy-MM-dd") !==
            format(parseISO(event.endTime), "yyyy-MM-dd");
        let meta: string;
        if (isMultiDay && event.endTime) {
          const endDate = parseISO(event.endTime);
          const dayCount = differenceInDays(endDate, startDate) + 1;
          meta = `${eventInfo.label} · ${format(startDate, "MMM d")}–${format(endDate, "MMM d")} · All day (${dayCount}d)`;
        } else {
          const startStr = format(startDate, "MMM d, h:mm a");
          const endStr = event.endTime
            ? format(parseISO(event.endTime), "h:mm a")
            : null;
          meta = endStr
            ? `${eventInfo.label} · ${startStr} – ${endStr}`
            : `${eventInfo.label} · ${startStr}`;
        }
        return {
          id: `event-${event.id}`,
          title: event.title,
          meta,
          date: startDate,
          color: subject?.color ?? eventInfo.color,
          kind: "event" as const,
          event,
        };
      }),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  const _monthBriefPreview = monthBriefItems.slice(0, 4);
  const monthStudyMinutes = sessions
    .filter(
      (session) =>
        session.status === "planned" &&
        isMonthItemVisible(parseISO(session.startTime)),
    )
    .reduce((total, session) => {
      const minutes = getSessionEffectiveMinutes(session);
      return total + minutes;
    }, 0);
  const _monthStudyHours = Math.round((monthStudyMinutes / 60) * 10) / 10;
  const _monthBusyDays = new Set(
    monthBriefItems.map((item) => format(item.date, "yyyy-MM-dd")),
  ).size;
  const _monthAssessments = monthBriefItems.filter(
    (item) => item.kind === "assessment",
  ).length;
  const prepBalanceBySubject = new Map<string, PrepBalanceItem>();

  const ensurePrepBalanceItem = (subjectId: string) => {
    const existing = prepBalanceBySubject.get(subjectId);
    if (existing) return existing;
    const subject = getSubjectById(subjectId);
    const nextItem: PrepBalanceItem = {
      subjectId,
      shortCode: subject?.shortCode ?? subjectId,
      name: subject?.name ?? subjectId,
      color: subject?.color ?? "var(--primary)",
      assessmentCount: 0,
      plannedMinutes: 0,
    };
    prepBalanceBySubject.set(subjectId, nextItem);
    return nextItem;
  };

  const applyNextPrepItem = (
    item: PrepBalanceItem,
    title: string,
    date: Date,
    source: { projectId?: string; event?: CalendarEvent },
  ) => {
    if (!item.nextDate || date < item.nextDate) {
      item.nextTitle = title;
      item.nextDate = date;
      item.projectId = source.projectId;
      item.event = source.event;
    }
  };

  const hasVisibleAssessmentDueWithinPrepWindow = (
    subjectId: string,
    sessionStart: Date,
  ) => {
    const windowEnd = new Date(
      sessionStart.getTime() +
        PREP_COMPLETED_CREDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const projectMatch = projectsWithDeadlines.some((project) => {
      if (!project.deadline || project.subjectId !== subjectId) return false;
      const dueDate = parseISO(project.deadline);
      return (
        isMonthItemVisible(dueDate) &&
        dueDate >= sessionStart &&
        dueDate <= windowEnd
      );
    });
    if (projectMatch) return true;

    return events.some((event) => {
      if (
        event.isFinished ||
        event.eventType === "event" ||
        event.subjectId !== subjectId
      )
        return false;
      const dueDate = parseISO(event.startTime);
      return (
        isMonthItemVisible(dueDate) &&
        dueDate >= sessionStart &&
        dueDate <= windowEnd
      );
    });
  };

  projectsWithDeadlines.forEach((project) => {
    if (!project.deadline || !project.subjectId) return;
    const deadlineDate = parseISO(project.deadline);
    if (!isMonthItemVisible(deadlineDate)) return;
    const item = ensurePrepBalanceItem(project.subjectId);
    item.assessmentCount += 1;
    applyNextPrepItem(item, project.name, deadlineDate, {
      projectId: project.id,
    });
  });

  events.forEach((event) => {
    if (event.isFinished || event.eventType === "event" || !event.subjectId)
      return;
    const eventDate = parseISO(event.startTime);
    if (!isMonthItemVisible(eventDate)) return;
    const item = ensurePrepBalanceItem(event.subjectId);
    item.assessmentCount += 1;
    applyNextPrepItem(item, event.title, eventDate, { event });
  });

  sessions.forEach((session) => {
    if (session.status !== "planned" && session.status !== "completed") return;
    const sessionStart = parseISO(session.startTime);
    const project = session.projectId
      ? projects.find((candidate) => candidate.id === session.projectId)
      : undefined;
    const subjectIds = getSessionSubjectIds(session, project);
    if (subjectIds.length === 0) return;
    const creditedSubjectIds =
      session.status === "planned"
        ? subjectIds
        : subjectIds.filter((subjectId) =>
            hasVisibleAssessmentDueWithinPrepWindow(subjectId, sessionStart),
          );
    if (session.status === "planned" && !isMonthItemVisible(sessionStart))
      return;
    const minutes = getSessionEffectiveMinutes(session);
    const minutesPerSubject = minutes / subjectIds.length;
    creditedSubjectIds.forEach((subjectId) => {
      ensurePrepBalanceItem(subjectId).plannedMinutes += minutesPerSubject;
    });
  });

  const prepBalanceItems = Array.from(prepBalanceBySubject.values())
    .filter((item) => item.assessmentCount > 0)
    .sort((a, b) => {
      const pressureDelta = b.assessmentCount - a.assessmentCount;
      if (pressureDelta !== 0) return pressureDelta;
      const studyDelta = a.plannedMinutes - b.plannedMinutes;
      if (studyDelta !== 0) return studyDelta;
      return a.shortCode.localeCompare(b.shortCode);
    })
    .slice(0, 4);
  const _prepBalanceNeedsAttention = prepBalanceItems.filter(
    (item) => item.plannedMinutes < item.assessmentCount * 90,
  ).length;

  const _handleMonthBriefSelect = (item: MonthBriefItem) => {
    if (item.projectId) {
      onSelectProject(item.projectId);
      return;
    }
    if (item.session) {
      onSelectSession(item.session);
      return;
    }
    if (item.event) {
      onSelectEvent(item.event);
      return;
    }
    // Grouped session item — navigate to the day
    setSelectedDate(format(item.date, "yyyy-MM-dd"));
    clearEventSelection();
  };

  const _handlePrepBalanceSelect = (item: PrepBalanceItem) => {
    if (item.projectId) {
      onSelectProject(item.projectId);
      return;
    }
    if (item.event) {
      onSelectEvent(item.event);
      return;
    }
    onNewSession(selectedCalendarDate);
  };

  const handlePrevMonth = () =>
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1),
    );
  const handleNextMonth = () =>
    setCurrentMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1),
    );
  const handleToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDate(getLocalDateValue(today));
  };

  const handleOpenTextPlanner = useCallback(() => {
    setTextPlannerTitle("Text to Events");
    setTextPlannerDescription(
      "Paste a notice, rough plan, or teacher message. Review drafts before adding them.",
    );

    setTextPlannerInitialText("");
    setTextPlannerOpen(true);
  }, []);

  const handlePrioritySelect = (item: PriorityItem) => {
    if (item.sessionId) {
      const session = sessions.find(
        (candidate) => candidate.id === item.sessionId,
      );
      if (session) {
        onSelectSession(session);
        return;
      }
    }
    if (item.eventId) {
      const event = events.find((candidate) => candidate.id === item.eventId);
      if (event) {
        onSelectEvent(event);
        return;
      }
    }
    if (item.projectId) {
      onSelectProject(item.projectId);
      return;
    }
    onNewSession(selectedCalendarDate);
  };

  const eventBatchToolbar =
    selectedBatchCount > 0 && !eventBatchSaving
      ? createPortal(
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 min-[900px]:px-4">
            <div className="pointer-events-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 rounded-t-lg border border-b-0 bg-popover px-3 py-2 text-popover-foreground shadow-md">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">
                    Calendar selection
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {selectedBatchCount} selected from{" "}
                    {selectedDate
                      ? format(parseISO(selectedDate), "MMM d")
                      : "calendar"}
                    {selectedBatchSessions.length > 0 &&
                    selectedBatchEvents.length > 0
                      ? ` (${selectedBatchEvents.length} events, ${selectedBatchSessions.length} sessions)`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                  onClick={clearEventSelection}
                  disabled={eventBatchSaving}
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                {canMergeSelectedItems && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                    onClick={handleMergeSelectedEvents}
                  >
                    <Combine className="h-3.5 w-3.5" />
                    Merge
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                  onClick={handleDeleteSelectedEvents}
                  disabled={eventBatchSaving}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 gap-1.5 rounded-md px-2.5 text-xs"
                  onClick={handleToggleSelectedEventsComplete}
                  disabled={eventBatchSaving}
                >
                  {allSelectedItemsComplete ? (
                    <X className="h-3.5 w-3.5" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {allSelectedItemsComplete ? "Reopen" : "Complete"}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <ScrollArea className="h-full">
        <div
          className={cn(
            "px-4 pt-4 min-[1200px]:px-6 min-[1200px]:pt-5",
            selectedBatchCount > 0
              ? "pb-24 min-[1200px]:pb-24"
              : "pb-6 min-[1200px]:pb-8",
          )}
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border/70 pb-5">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-medium text-foreground/60 tabular-nums">
                {format(headingDate, "EEEE · d MMMM")}
              </p>
              <h1 className="text-xl font-semibold tracking-tight">
                {headingDateKey === todayDateKey
                  ? "Today"
                  : format(headingDate, "d MMMM")}
              </h1>
              {(() => {
                const meta: [string, ReactNode][] = [];
                if (selectedStudyHours > 0)
                  meta.push([
                    "studied",
                    <span className="font-medium text-foreground/80 tabular-nums">
                      {selectedStudyHours.toFixed(1)}h studied
                    </span>,
                  ]);
                if (overdueProjects.length > 0)
                  meta.push([
                    "overdue",
                    <span className="font-medium text-destructive">
                      {overdueProjects.length} overdue
                    </span>,
                  ]);
                if (dueThisWeek.length > 0)
                  meta.push([
                    "due",
                    <span>{dueThisWeek.length} due this week</span>,
                  ]);
                if (upcomingEvents.length > 0)
                  meta.push([
                    "events",
                    <span>
                      {upcomingEvents.length} event
                      {upcomingEvents.length !== 1 ? "s" : ""} this week
                    </span>,
                  ]);
                return (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {meta.length > 0 ? (
                      meta.map(([key, part], i) => (
                        <Fragment key={key}>
                          {i > 0 && (
                            <span className="text-muted-foreground/40">
                              {" · "}
                            </span>
                          )}
                          {part}
                        </Fragment>
                      ))
                    ) : (
                      <span>No urgent deadlines. Keep the workspace tidy.</span>
                    )}
                  </p>
                );
              })()}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Sparkles />
                  Tools
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onOpenAiAssistant && (
                  <DropdownMenuItem onSelect={onOpenAiAssistant}>
                    <Sparkles />
                    AI Assistant
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={handleOpenTextPlanner}>
                  <Wand2 />
                  Text to events
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/50 px-2.5 py-1.5">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              Next focus
            </span>
            {nextFocus ? (
              <>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto max-w-[min(100%,18rem)] truncate p-0 text-sm font-medium"
                  onClick={() => handlePrioritySelect(nextFocus)}
                >
                  {nextFocus.title}
                </Button>
                {nextFocusSubject && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
                    style={{
                      backgroundColor: `${nextFocusSubject.color}18`,
                      color: nextFocusSubject.color,
                    }}
                  >
                    {nextFocusSubject.shortCode}
                  </span>
                )}
                <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:inline">
                  {nextFocus.reason}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                Add a due date or plan a session to build your queue.
              </span>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Focus priorities"
                  >
                    <Settings2 />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] p-3">
                  <PopoverHeader>
                    <PopoverTitle>Focus priorities</PopoverTitle>
                    <PopoverDescription>
                      Ranked subjects and pinned events influence the next-focus queue; urgent work still stays visible.
                    </PopoverDescription>
                  </PopoverHeader>
                  <div className="mt-2 space-y-4">
                    <section aria-labelledby="priority-subjects-heading">
                      <h3 id="priority-subjects-heading" className="mb-2 text-sm font-semibold">
                        Subjects
                      </h3>
                      {effectiveSubjectOrder.length > 0 ? (
                        <div className="space-y-1">
                          {effectiveSubjectOrder.map((subjectId, index) => {
                            const subject = prioritySubjects.find((item) => item.id === subjectId);
                            if (!subject) return null;
                            return (
                              <div key={subjectId} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                                <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                                  {index + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm">{subject.name}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={index === 0}
                                  onClick={() => movePrioritySubject(subjectId, -1)}
                                  aria-label={`Move ${subject.name} up`}
                                >
                                  <ArrowUp />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={index === effectiveSubjectOrder.length - 1}
                                  onClick={() => movePrioritySubject(subjectId, 1)}
                                  aria-label={`Move ${subject.name} down`}
                                >
                                  <ArrowDown />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No active subjects yet.</p>
                      )}
                    </section>
                    <section aria-labelledby="priority-events-heading">
                      <h3 id="priority-events-heading" className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <Pin className="size-4" />
                        Pinned events
                      </h3>
                      {pinnableEvents.length > 0 ? (
                        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                          {pinnableEvents.map((event) => {
                            const checked = focusPriorities.pinnedEventIds.includes(event.id);
                            return (
                              <label key={event.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => togglePinnedEvent(event.id)}
                                  aria-label={`Prioritise ${event.title}`}
                                  className="mt-0.5"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{event.title}</span>
                                  <span className="block text-sm text-muted-foreground">
                                    {format(parseISO(event.startTime), "EEE d MMM")}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No events in the next 30 days.</p>
                      )}
                    </section>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                size="xs"
                disabled={!nextFocus || nextFocus.subjectIds.length === 0}
                onClick={() => nextFocus && onStartFocus(nextFocus)}
              >
                <Play />
                Start
              </Button>
            </div>
          </div>

          {overdueProjects.length > 0 && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                <span className="text-xs font-semibold text-destructive">
                  {overdueProjects.length} overdue assessment
                  {overdueProjects.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {overdueProjects.map((p) => (
                  <Button
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    variant="destructive"
                    size="sm"
                  >
                    {p.name}
                    <span className="font-normal opacity-75 tabular-nums">
                      {formatDeadline(p.deadline!)}
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 min-[1200px]:gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
            <Card size="sm">
              <CardContent>
                <div className="flex h-full flex-col gap-4">
                <CalendarGrid
                  currentMonth={currentMonth}
                  calendarView={calendarView}
                  selectedDate={selectedDate}
                  deadlinesByDate={deadlinesByDate}
                  sessionsByDate={sessionsByDate}
                  eventsByDate={eventsByDate}
                  events={events}
                  projects={projects}
                  onMoveEvent={onMoveEvent}
                  onSetCalendarView={setCalendarView}
                  onPrevMonth={handlePrevMonth}
                  onNextMonth={handleNextMonth}
                  onToday={handleToday}
                  onSelectDate={handleSelectCalendarDate}
                  onSelectProject={onSelectProject}
                  onSelectSession={onSelectSession}
                  onSelectEvent={onSelectEvent}
                  onNewEvent={onNewEvent}
                  onDeleteCalendarItems={onDeleteCalendarItems}
                  onSetCalendarItemsCompleted={onSetCalendarItemsCompleted}
                />

                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <QuickLinks />

              {selectedDate && (
                <DayDetail
                  selectedDate={selectedDate}
                  deadlines={selectedDayDeadlines}
                  sessions={selectedDaySessions}
                  events={events}
                  projects={projects}
                  calendarSelectionMode={calendarSelectionMode}
                  selectedEventIdSet={selectedEventIdSet}
                  selectedSessionIdSet={selectedSessionIdSet}
                  onClose={() => {
                    setSelectedDate(null);
                    clearEventSelection();
                  }}
                  onToggleSelectionMode={() => setCalendarSelectionMode(true)}
                  onClearSelection={clearEventSelection}
                  onSelectAll={handleSelectAllCalendarItems}
                  onToggleEventSelection={handleToggleEventSelection}
                  onToggleSessionSelection={handleToggleSessionSelection}
                  onSelectProject={onSelectProject}
                  onSelectSession={onSelectSession}
                  onSelectEvent={onSelectEvent}
                  onDeleteCalendarItems={onDeleteCalendarItems}
                  onSetCalendarItemsCompleted={onSetCalendarItemsCompleted}
                />
              )}

              {timetableConfig?.enabled &&
                (() => {
                  const dayLabel = getDayLabelForDate(
                    now,
                    timetableConfig.day1Starts,
                    timetableConfig.holidays,
                  );
                  if (dayLabel === null) return null;
                  const entries = getTimetableEntriesForDay(
                    dayLabel,
                    timetableConfig.entries,
                  );
                  if (entries.length === 0) return null;
                  const periods = entries
                    .flatMap((e) => e.periods)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                  const periodInfo = getCurrentPeriodInfo(periods, now);
                  return (
                    <div className="rounded-lg bg-background p-3 ring-1 ring-border">
                      <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        Today&apos;s Timetable · Day {dayLabel}
                        <Button
                          onClick={onGoTimetable}
                          variant="link"
                          size="xs"
                          className="ml-auto text-muted-foreground"
                        >
                          View timetable
                          <ArrowRight />
                        </Button>
                      </h3>
                      <div className="space-y-1">
                        {periods.map((period, idx) => {
                          const subject = getSubjectById(period.subject);
                          const isCurrent =
                            periodInfo.current?.startTime ===
                              period.startTime &&
                            periodInfo.current?.subject === period.subject;
                          const isNext =
                            periodInfo.next?.startTime === period.startTime &&
                            periodInfo.next?.subject === period.subject;
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "relative flex items-center gap-2 rounded-md px-2.5 py-1.5",
                                isCurrent
                                  ? "bg-primary/10 ring-1 ring-primary/30"
                                  : "bg-muted",
                              )}
                            >
                              {/* Subject color accent bar */}
                              {subject && (
                                <div
                                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                                  style={{ backgroundColor: subject.color }}
                                />
                              )}

                              {/* Current period pulsing dot */}
                              {isCurrent && (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse" />
                              )}

                              {/* Time */}
                              <span className="w-14 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                                {formatTime12(period.startTime)}
                              </span>

                              {/* Subject name */}
                              <span
                                className="min-w-0 truncate text-xs"
                                style={{ color: subject?.color }}
                              >
                                {subject ? subject.name : period.subject}
                              </span>

                              {/* End time or Up next badge */}
                              <span className="ml-auto shrink-0 text-xs tabular-nums">
                                {isNext && !isCurrent ? (
                                  <span className="rounded border border-foreground/10 bg-foreground/[0.06] px-1.5 py-0.5 text-xs font-medium text-foreground/80">
                                    Up next
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/70">
                                    {formatTime12(period.endTime)}
                                  </span>
                                )}
                              </span>

                              {/* Location */}
                              {period.location && (
                                <span className="hidden shrink-0 items-center gap-0.5 truncate text-xs text-muted-foreground/70 sm:flex">
                                  <MapPin className="h-2.5 w-2.5" />
                                  {period.location}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Next period countdown */}
                      {periodInfo.current &&
                        periodInfo.remainingMinutes > 0 && (
                          <div className="mt-2 flex items-center gap-2 rounded-md bg-primary/10 px-2.5 py-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                            <span className="text-xs text-muted-foreground">
                              {periodInfo.next ? (
                                <>
                                  <span className="font-medium text-foreground">
                                    {periodInfo.remainingMinutes}m
                                  </span>{" "}
                                  remaining —{" "}
                                  <span className="text-muted-foreground">
                                    {getSubjectById(periodInfo.next.subject)
                                      ?.name ?? periodInfo.next.subject}
                                  </span>{" "}
                                  at{" "}
                                  <span className="tabular-nums">
                                    {formatTime12(periodInfo.next.startTime)}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="font-medium text-foreground">
                                    {periodInfo.remainingMinutes}m
                                  </span>{" "}
                                  remaining
                                </>
                              )}
                            </span>
                          </div>
                        )}
                    </div>
                  );
                })()}

              {/* ponytail: Today stays calendar-first; deeper activity and analytics live in Review. */}
              <div hidden aria-hidden="true">
              <StudyPriorities
                items={priorityItems}
                isOpen={prioritiesOpen}
                onToggle={() => setPrioritiesOpen((current) => !current)}
                onSelectItem={handlePrioritySelect}
              />

              {dueThisWeek.length > 0 && (
                <div className="rounded-lg bg-background p-3 ring-1 ring-border">
                  <h3 className="mb-2.5 text-sm font-semibold">
                    Due This Week
                  </h3>
                  <div className="-mx-1.5 space-y-0.5">
                    {dueThisWeek.map((p) => {
                      const subject = getSubjectById(p.subjectId);
                      return (
                        <Button
                          key={p.id}
                          onClick={() => onSelectProject(p.id)}
                          variant="ghost"
                          className="group h-auto w-full justify-start px-1.5 py-1.5 text-left whitespace-normal"
                        >
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">
                                {p.name}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDeadline(p.deadline!)}
                              </p>
                            </div>
                            {subject && (
                              <div
                                className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap font-medium shrink-0"
                                style={{
                                  backgroundColor: subject.color + "14",
                                  color: subject.color,
                                }}
                              >
                                {subject.shortCode}
                              </div>
                            )}
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {upcomingSessions.length > 0 && (
                <div className="rounded-lg bg-background p-3 ring-1 ring-border">
                  <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Upcoming Sessions
                  </h3>
                  <div className="-mx-1.5 space-y-0.5">
                    {upcomingSessions.slice(0, 5).map((session) => {
                      const project = projects.find(
                        (p) => p.id === session.projectId,
                      );
                      const subjects = getSessionSubjectIds(session, project)
                        .map(
                          (subjectId) =>
                            getSubjectById(subjectId)?.shortCode ?? subjectId,
                        )
                        .join(", ");
                      return (
                        <Button
                          key={session.id}
                          onClick={() => onSelectSession(session)}
                          variant="ghost"
                          className="h-auto w-full flex-col items-start gap-0.5 px-1.5 py-1.5 text-left whitespace-normal"
                        >
                          <p className="text-xs font-medium truncate">
                            {session.title}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {project?.name ?? subjects}
                            <span className="text-muted-foreground/40">
                              {" · "}
                            </span>
                            <span className="tabular-nums">
                              {format(
                                parseISO(session.startTime),
                                "MMM d, h:mm a",
                              )}
                            </span>
                          </p>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {upcomingEvents.length > 0 && (
                <div className="rounded-lg bg-background p-3 ring-1 ring-border">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" />
                    Events
                  </h3>
                  <div className="-mx-2 divide-y divide-border/60">
                    {upcomingEvents.slice(0, 5).map((event) => {
                      const subject = getSubjectById(event.subjectId);
                      const eventInfo = getEventTypeInfo(event.eventType);
                      const startTime = parseISO(event.startTime);
                      return (
                        <Button
                          key={event.id}
                          onClick={() => onSelectEvent(event)}
                          variant="ghost"
                          className="group h-auto w-full items-stretch justify-start rounded-md px-2 py-2.5 text-left whitespace-normal"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <time
                              dateTime={event.startTime}
                              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-muted/70 leading-none transition-colors group-hover:bg-background"
                            >
                              <span className="text-micro font-medium text-muted-foreground">
                                {format(startTime, "MMM")}
                              </span>
                              <span className="mt-1 text-sm font-semibold tabular-nums">
                                {format(startTime, "d")}
                              </span>
                            </time>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <p className="truncate text-sm font-medium leading-tight">
                                {event.title}
                              </p>
                              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className="shrink-0">
                                  {format(startTime, "EEE, h:mm a")}
                                </span>
                                {event.location && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">
                                      {event.location}
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro font-medium text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: eventInfo.color }}
                                  />
                                  {eventInfo.label}
                                </span>
                                {subject && (
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="h-1.5 w-1.5 rounded-full"
                                      style={{ backgroundColor: subject.color }}
                                    />
                                    {subject.shortCode}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {dueThisWeek.length === 0 &&
                upcomingSessions.length === 0 &&
                upcomingEvents.length === 0 &&
                overdueProjects.length === 0 && (
                  <div className="rounded-lg border border-dashed p-3">
                    <p className="text-xs text-muted-foreground">
                      Nothing due this week. Use the buttons above to add an
                      assessment, event, or session.
                    </p>
                  </div>
                )}

              <RecentActivity
                items={recentActivity}
                isOpen={recentActivityOpen}
                onToggle={() => setRecentActivityOpen((current) => !current)}
                onSelectSession={onSelectSession}
                onSelectEvent={onSelectEvent}
              />

              <div className="rounded-lg bg-background p-3 ring-1 ring-border">
                <h3 className="mb-2.5 text-sm font-semibold">Summary</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums leading-none">
                      {activeProjects.length}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      assessments
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums leading-none">
                      {completedSessions}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      completed
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums leading-none">
                      {totalStudyHours}
                      <span className="text-xs font-normal">h</span>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      studied
                    </p>
                  </div>
                </div>

                {topSubjects.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {topSubjects.map(([subjectId, info]) => {
                        const subject = getSubjectById(subjectId);
                        return (
                          <span
                            key={subjectId}
                            className="text-xs px-1.5 py-0.5 rounded font-medium tabular-nums"
                            style={{
                              backgroundColor: subject?.color + "14",
                              color: subject?.color,
                            }}
                          >
                            {info.icon} {info.shortCode}{" "}
                            <span className="font-normal tabular-nums">
                              {Math.round((info.minutes / 60) * 10) / 10}h
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      <TextEventPlanner
        key={textPlannerOpen ? "planner-open" : "planner-closed"}
        open={textPlannerOpen}
        onOpenChange={setTextPlannerOpen}
        title={textPlannerTitle}
        description={textPlannerDescription}
        initialText={textPlannerInitialText}
        projects={projects}
        planningSubjects={planningSubjects}
        onCreateEvents={onCreateEvents}
        onCreateStudySessions={onCreateStudySessions}
      />

      {eventBatchToolbar}
    </>
  );
});
