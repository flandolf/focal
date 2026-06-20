import {
  useState,
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Search,
  X,
  FileText,
  Folder,
  ArrowRight,
  BarChart3,
  Home,
  CalendarDays,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isMacOS } from "@/lib/platform";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import {
  formatFileSize,
  getEventTypeInfo,
  getSessionSubjectIds,
  getSubjectById,
} from "@/lib/utils";
import type {
  CalendarEvent,
  Project,
  StudySession,
  SearchResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
  projects: Project[];
  sessions: StudySession[];
  events: CalendarEvent[];
  onSelectProject: (id: string) => void;
  onSelectSession: (session: StudySession) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onNewProject?: () => void;
  onNewSession?: () => void;
  onNewEvent?: () => void;
  onGoHome?: () => void;
  onGoTimetable?: () => void;
  onGoAnalytics?: () => void;
  onOpenAiAssistant?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResults {
  projects: Project[];
  sessions: StudySession[];
  events: CalendarEvent[];
  files: SearchResult[];
}

const EMPTY_RESULTS: SearchResults = {
  projects: [],
  sessions: [],
  events: [],
  files: [],
};

type SearchItem =
  | { type: "project"; data: Project }
  | { type: "session"; data: StudySession }
  | { type: "event"; data: CalendarEvent }
  | { type: "file"; data: SearchResult };

interface QuickAction {
  type: "action";
  id: string;
  label: string;
  hint: string;
  aliases: string[];
  shortcut?: string;
  icon: typeof Search;
  run: () => void;
}

function getTotalResults(results: SearchResults) {
  return (
    results.projects.length +
    results.sessions.length +
    results.events.length +
    results.files.length
  );
}

function quickActionMatches(action: QuickAction, lowerQuery: string) {
  return (
    action.label.toLowerCase().includes(lowerQuery) ||
    action.hint.toLowerCase().includes(lowerQuery) ||
    action.aliases.some((alias) => alias.includes(lowerQuery))
  );
}

export function GlobalSearch({
  projects,
  sessions,
  events,
  onSelectProject,
  onSelectSession,
  onSelectEvent,
  onNewProject,
  onNewSession,
  onNewEvent,
  onGoHome,
  onGoTimetable,
  onGoAnalytics,
  onOpenAiAssistant,
  open,
  onOpenChange,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [fileSearchFailed, setFileSearchFailed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const searchRequestRef = useRef(0);
  const searchId = useId();
  const titleId = `${searchId}-title`;
  const resultListId = `${searchId}-results`;
  const statusId = `${searchId}-status`;
  const getResultId = (index: number) => `${resultListId}-${index}`;
  const modKeyLabel = isMacOS ? "⌘" : "Ctrl";

  const quickActions = useMemo<QuickAction[]>(
    () => {
      const actions: (QuickAction | undefined)[] = [
        onNewProject && {
          type: "action" as const,
          id: "new-assessment",
          label: "New assessment",
          hint: "Create a folder-backed assessment",
          aliases: ["project", "assignment", "task", "sac", "folder"],
          shortcut: `${modKeyLabel} N`,
          icon: Plus,
          run: onNewProject,
        },
        onNewSession && {
          type: "action" as const,
          id: "new-session",
          label: "New study session",
          hint: "Plan focused study time",
          aliases: ["study", "focus", "revision", "timer", "pomodoro"],
          shortcut: `${modKeyLabel} ⇧ S`,
          icon: FileText,
          run: onNewSession,
        },
        onNewEvent && {
          type: "action" as const,
          id: "new-event",
          label: "New calendar item",
          hint: "Add a deadline, class, or reminder",
          aliases: ["calendar", "deadline", "due", "reminder", "schedule"],
          shortcut: `${modKeyLabel} ⇧ N`,
          icon: CalendarDays,
          run: onNewEvent,
        },
        onGoHome && {
          type: "action" as const,
          id: "go-home",
          label: "Go to Today",
          hint: "Review this month's workload",
          aliases: ["home", "dashboard", "overview", "month", "plan"],
          shortcut: "H",
          icon: Home,
          run: onGoHome,
        },
        onGoTimetable && {
          type: "action" as const,
          id: "go-timetable",
          label: "Open timetable",
          hint: "Check current and upcoming periods",
          aliases: ["schedule", "classes", "periods", "day", "school"],
          shortcut: "T",
          icon: CalendarDays,
          run: onGoTimetable,
        },
        onGoAnalytics && {
          type: "action" as const,
          id: "go-analytics",
          label: "Open analytics",
          hint: "Review study patterns",
          aliases: ["stats", "charts", "progress", "reports", "insights"],
          shortcut: "A",
          icon: BarChart3,
          run: onGoAnalytics,
        },
        onOpenAiAssistant && {
          type: "action" as const,
          id: "open-ai-assistant",
          label: "Ask AI Assistant",
          hint: "Quick answers about studying, planning, or subjects",
          aliases: ["ai", "assistant", "chat", "ask", "help", "explain"],
          shortcut: "I",
          icon: Sparkles,
          run: onOpenAiAssistant,
        },
      ];
      return actions.filter((action): action is QuickAction => Boolean(action));
    },
    [
      modKeyLabel,
      onGoAnalytics,
      onGoHome,
      onGoTimetable,
      onNewEvent,
      onNewProject,
      onNewSession,
      onOpenAiAssistant,
    ],
  );

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setFileSearchFailed(false);
      setSelectedIndex(quickActions.length > 0 ? 0 : -1);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, quickActions.length]);

  const search = useCallback(
    async (
      q: string,
      projs: Project[],
      sess: StudySession[],
      evts: CalendarEvent[],
    ) => {
      const requestId = searchRequestRef.current + 1;
      searchRequestRef.current = requestId;
      const trimmed = q.trim();

      if (!trimmed) {
        setResults(EMPTY_RESULTS);
        setLoading(false);
        setFileSearchFailed(false);
        setSelectedIndex(quickActions.length > 0 ? 0 : -1);
        return;
      }

      const lower = trimmed.toLowerCase();
      const matchedQuickActionCount = quickActions.filter((action) =>
        quickActionMatches(action, lower),
      ).length;

      const matchedProjects = projs.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          (p.description?.toLowerCase().includes(lower) ?? false) ||
          (getSubjectById(p.subjectId)?.name.toLowerCase().includes(lower) ??
            false),
      );

      const matchedSessions = sess.filter((s) => {
        const project = projs.find((p) => p.id === s.projectId);
        const subjectMatch = getSessionSubjectIds(s, project).some(
          (subjectId) => {
            const subject = getSubjectById(subjectId);
            return (
              subjectId.toLowerCase().includes(lower) ||
              (subject?.name.toLowerCase().includes(lower) ?? false) ||
              (subject?.shortCode.toLowerCase().includes(lower) ?? false)
            );
          },
        );
        return (
          s.title.toLowerCase().includes(lower) ||
          (s.description?.toLowerCase().includes(lower) ?? false) ||
          (s.topics?.some((t) => t.toLowerCase().includes(lower)) ?? false) ||
          (project?.name.toLowerCase().includes(lower) ?? false) ||
          subjectMatch
        );
      });

      const matchedEvents = evts.filter((event) => {
        const subject = getSubjectById(event.subjectId);
        const eventInfo = getEventTypeInfo(event.eventType);
        return (
          event.title.toLowerCase().includes(lower) ||
          (event.description?.toLowerCase().includes(lower) ?? false) ||
          (event.location?.toLowerCase().includes(lower) ?? false) ||
          (subject?.name.toLowerCase().includes(lower) ?? false) ||
          eventInfo.label.toLowerCase().includes(lower)
        );
      });

      const immediateResults = {
        projects: matchedProjects,
        sessions: matchedSessions,
        events: matchedEvents,
        files: [],
      };
      setResults(immediateResults);
      setSelectedIndex(
        matchedQuickActionCount + getTotalResults(immediateResults) > 0 ? 0 : -1,
      );
      setLoading(true);
      setFileSearchFailed(false);

      try {
        const fileResults = await invoke<SearchResult[]>(
          "search_files_all_projects",
          { query: trimmed },
        );
        if (searchRequestRef.current !== requestId) return;

        const nextResults = {
          projects: matchedProjects,
          sessions: matchedSessions,
          events: matchedEvents,
          files: fileResults.slice(0, 20),
        };
        setResults(nextResults);
        setSelectedIndex(
          matchedQuickActionCount + getTotalResults(nextResults) > 0 ? 0 : -1,
        );
      } catch {
        if (searchRequestRef.current !== requestId) return;

        setResults(immediateResults);
        setFileSearchFailed(true);
      } finally {
        if (searchRequestRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [quickActions],
  );

  useEffect(() => {
    const timer = setTimeout(
      () => search(query, projects, sessions, events),
      200,
    );
    return () => clearTimeout(timer);
  }, [query, search, projects, sessions, events]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onOpenChange]);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const lowerQuery = trimmedQuery.toLowerCase();
  const visibleQuickActions = hasQuery
    ? quickActions.filter((action) => quickActionMatches(action, lowerQuery))
    : quickActions;
  const actionOffset = visibleQuickActions.length;
  const resultItems: SearchItem[] = [
    ...results.projects.map((p) => ({ type: "project" as const, data: p })),
    ...results.sessions.map((s) => ({ type: "session" as const, data: s })),
    ...results.events.map((event) => ({ type: "event" as const, data: event })),
    ...results.files.map((f) => ({ type: "file" as const, data: f })),
  ];
  const allItems = [...visibleQuickActions, ...resultItems];
  const totalItems = allItems.length;
  const hasVisibleResults = totalItems > 0;
  const activeResultId =
    selectedIndex >= 0 ? getResultId(selectedIndex) : undefined;

  const handleSelect = (item: SearchItem | QuickAction) => {
    if (item.type === "action") {
      item.run();
      onOpenChange(false);
      return;
    }
    if (item.type === "project") {
      onSelectProject(item.data.id);
    } else if (item.type === "session") {
      onSelectSession(item.data);
    } else if (item.type === "event") {
      onSelectEvent(item.data);
    } else if (item.type === "file") {
      void openPath(item.data.file.path).catch(() => undefined);
    }
    onOpenChange(false);
  };

  const kbdClass =
    "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border/80 bg-muted/70 px-1.5 font-mono text-caption leading-none text-muted-foreground"

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (totalItems === 0) return;
      setSelectedIndex((i) => (i < 0 ? 0 : (i + 1) % totalItems));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (totalItems === 0) return;
      setSelectedIndex((i) =>
        i < 0 ? totalItems - 1 : (i - 1 + totalItems) % totalItems,
      );
    } else if (
      e.key === "Enter" &&
      selectedIndex >= 0 &&
      selectedIndex < allItems.length
    ) {
      e.preventDefault();
      handleSelect(allItems[selectedIndex]);
    }
  };

  useEffect(() => {
    resultRefs.current = [];
  }, [totalItems]);

  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < resultRefs.current.length) {
      const el = resultRefs.current[selectedIndex];
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (      <div
        className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-[14vh] backdrop-blur-sm animate-in fade-in duration-100 sm:pt-[18vh]"
        onClick={() => onOpenChange(false)}
      >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="glass-dialog w-full max-w-2xl overflow-hidden rounded-2xl text-popover-foreground shadow-lg outline-none animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="sr-only">
          Search
        </h2>
        <div id={statusId} className="sr-only" aria-live="polite">
          {loading
            ? "Searching"
            : hasQuery
              ? `${totalItems} results`
              : `${visibleQuickActions.length} quick actions`}
        </div>

        <div className="flex min-h-14 items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              const nextQuery = e.target.value;
              const nextLower = nextQuery.trim().toLowerCase();
              const hasMatchingAction =
                nextLower.length > 0 &&
                quickActions.some((action) => quickActionMatches(action, nextLower));
              setQuery(nextQuery);
              setSelectedIndex(
                nextLower ? (hasMatchingAction ? 0 : -1) : quickActions.length > 0 ? 0 : -1,
              );
            }}
            placeholder="Search assessments, sessions, events, files"
            role="combobox"
            aria-expanded={totalItems > 0}
            aria-controls={resultListId}
            aria-activedescendant={activeResultId}
            aria-describedby={statusId}
            autoComplete="off"
            spellCheck={false}
            className="h-13 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => {
                setQuery("");
                setSelectedIndex(quickActions.length > 0 ? 0 : -1);
              }}
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </div>

        {hasVisibleResults && (
          <ScrollArea className="max-h-[min(60vh,28rem)]">
            <div
              id={resultListId}
              role="listbox"
              aria-label="Search results"
              className="py-2"
            >
              {visibleQuickActions.length > 0 && (
                <div role="group" aria-label="Quick actions">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase text-muted-foreground">
                    Actions
                  </div>
                  {visibleQuickActions.map((action, index) => {
                    const Icon = action.icon;
                    return (
                      <button
                        ref={(el) => {
                          resultRefs.current[index] = el;
                        }}
                        key={action.id}
                        id={getResultId(index)}
                        role="option"
                        aria-selected={selectedIndex === index}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === index && "bg-accent/80",
                        )}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => handleSelect(action)}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary/75">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {action.label}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {action.hint}
                          </span>
                        </span>
                        {action.shortcut ? (
                          <kbd
                            className={cn(
                              kbdClass,
                              "hidden shrink-0 opacity-70 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100 sm:inline-flex",
                            )}
                          >
                            {action.shortcut}
                          </kbd>
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {results.projects.length > 0 && (
                <div role="group" aria-label="Assessments">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase text-muted-foreground">
                    Assessments
                  </div>
                  {results.projects.map((project, idx) => {
                    const subject = getSubjectById(project.subjectId);
                    const globalIdx = actionOffset + idx;
                    return (
                      <button
                        ref={(el) => {
                          resultRefs.current[globalIdx] = el;
                        }}
                        key={project.id}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80",
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() =>
                          handleSelect({ type: "project", data: project })
                        }
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/45 text-sm">
                          {project.icon ?? "📄"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">
                            {project.name}
                          </p>
                          {subject && (
                            <span
                              className="rounded px-1.5 py-0.5 text-micro font-medium"
                              style={{
                                backgroundColor: subject.color + "20",
                                color: subject.color,
                              }}
                            >
                              {subject.shortCode}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              )}

              {results.sessions.length > 0 && (
                <div role="group" aria-label="Study Sessions">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase text-muted-foreground">
                    Study Sessions
                  </div>
                  {results.sessions.map((session, idx) => {
                    const project = projects.find(
                      (p) => p.id === session.projectId,
                    );
                    const subjectLabel = getSessionSubjectIds(session, project)
                      .map(
                        (subjectId) =>
                          getSubjectById(subjectId)?.shortCode ?? subjectId,
                      )
                      .join(", ");
                    const globalIdx = actionOffset + results.projects.length + idx;
                    return (
                      <button
                        ref={(el) => {
                          resultRefs.current[globalIdx] = el;
                        }}
                        key={session.id}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80",
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() =>
                          handleSelect({ type: "session", data: session })
                        }
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-4 w-4 text-primary/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">
                            {session.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {project?.name ?? subjectLabel}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              )}

              {results.events.length > 0 && (
                <div role="group" aria-label="Events">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase text-muted-foreground">
                    Events
                  </div>
                  {results.events.map((event, idx) => {
                    const subject = getSubjectById(event.subjectId);
                    const eventInfo = getEventTypeInfo(event.eventType);
                    const globalIdx =
                      actionOffset + results.projects.length + results.sessions.length + idx;
                    return (
                      <button
                        ref={(el) => {
                          resultRefs.current[globalIdx] = el;
                        }}
                        key={event.id}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80",
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() =>
                          handleSelect({ type: "event", data: event })
                        }
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <CalendarDays className="h-4 w-4 text-primary/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">
                            {event.title}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span
                              className="rounded px-1.5 py-0.5 text-micro font-medium"
                              style={{
                                backgroundColor: eventInfo.color + "20",
                                color: eventInfo.color,
                              }}
                            >
                              {eventInfo.label}
                            </span>
                            {subject && (
                              <span
                                className="rounded px-1.5 py-0.5 text-micro font-medium"
                                style={{
                                  backgroundColor: subject.color + "20",
                                  color: subject.color,
                                }}
                              >
                                {subject.shortCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              )}

              {results.files.length > 0 && (
                <div role="group" aria-label="Files">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase text-muted-foreground">
                    Files
                  </div>
                  {results.files.map((result, idx) => {
                    const globalIdx =
                      actionOffset +
                      results.projects.length +
                      results.sessions.length +
                      results.events.length +
                      idx;
                    return (
                      <button
                        ref={(el) => {
                          resultRefs.current[globalIdx] = el;
                        }}
                        key={result.file.path}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80",
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() =>
                          handleSelect({ type: "file", data: result })
                        }
                      >
                        <FileTypeIcon extension={result.file.extension} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">
                            {result.file.name}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Folder className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {result.projectFolder}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0 tabular-nums">
                              {formatFileSize(result.file.size)}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {hasQuery && totalItems === 0 && loading && (
          <div className="space-y-2 px-4 py-4" aria-label="Searching">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex min-h-12 items-center gap-3 rounded-lg py-2"
              >
                <div className="size-8 rounded-lg bg-muted/60 motion-safe:animate-pulse" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-2/5 rounded bg-muted/70 motion-safe:animate-pulse" />
                  <div className="h-2.5 w-3/5 rounded bg-muted/45 motion-safe:animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {hasQuery && totalItems === 0 && !loading && (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
            <Search className="h-5 w-5 text-muted-foreground/40" />
            <p className="max-w-72 text-sm text-muted-foreground">
              No results for{" "}
              <span className="font-medium text-foreground">
                "{query.trim()}"
              </span>
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 text-micro text-muted-foreground">
          <div className="hidden items-center gap-3 sm:flex">
            <span className="flex items-center gap-1.5">
              <kbd className={kbdClass}>{modKeyLabel} K</kbd>
              <span className="text-muted-foreground">toggle</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className={kbdClass}>↑↓</kbd>
              <span className="text-muted-foreground">navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className={kbdClass}>↵</kbd>
              <span className="text-muted-foreground">open</span>
            </span>
          </div>
          <span
            className={cn("ml-auto flex items-center gap-1.5", fileSearchFailed && "text-destructive")}
          >
            {loading && hasVisibleResults ? (
              "Searching files"
            ) : fileSearchFailed ? (
              "File search unavailable"
            ) : (
              <>
                <kbd className={kbdClass}>Esc</kbd>
                <span className="text-muted-foreground">close</span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
