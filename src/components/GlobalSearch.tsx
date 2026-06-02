import { useState, useEffect, useCallback, useId, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { openPath } from "@tauri-apps/plugin-opener"
import { Search, X, FileText, Folder, ArrowRight, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileTypeIcon } from "@/components/FileTypeIcon"
import { formatFileSize, getEventTypeInfo, getSessionSubjectIds, getSubjectById } from "@/lib/utils"
import type { CalendarEvent, Project, StudySession, SearchResult } from "@/lib/types"
import { cn } from "@/lib/utils"

interface GlobalSearchProps {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  onSelectProject: (id: string) => void
  onSelectSession: (session: StudySession) => void
  onSelectEvent: (event: CalendarEvent) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SearchResults {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  files: SearchResult[]
}

const EMPTY_RESULTS: SearchResults = { projects: [], sessions: [], events: [], files: [] }

function getTotalResults(results: SearchResults) {
  return results.projects.length + results.sessions.length + results.events.length + results.files.length
}

export function GlobalSearch({
  projects,
  sessions,
  events,
  onSelectProject,
  onSelectSession,
  onSelectEvent,
  open,
  onOpenChange,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [fileSearchFailed, setFileSearchFailed] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRequestRef = useRef(0)
  const searchId = useId()
  const titleId = `${searchId}-title`
  const resultListId = `${searchId}-results`
  const statusId = `${searchId}-status`
  const getResultId = (index: number) => `${resultListId}-${index}`

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("")
      setResults(EMPTY_RESULTS)
      setLoading(false)
      setFileSearchFailed(false)
      setSelectedIndex(-1)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback(async (q: string, projs: Project[], sess: StudySession[], evts: CalendarEvent[]) => {
    const requestId = searchRequestRef.current + 1
    searchRequestRef.current = requestId
    const trimmed = q.trim()

    if (!trimmed) {
      setResults(EMPTY_RESULTS)
      setLoading(false)
      setFileSearchFailed(false)
      setSelectedIndex(-1)
      return
    }

    const lower = trimmed.toLowerCase()

    const matchedProjects = projs.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.description?.toLowerCase().includes(lower) ?? false) ||
        (getSubjectById(p.subjectId)?.name.toLowerCase().includes(lower) ?? false)
    )

    const matchedSessions = sess.filter(
      (s) => {
        const project = projs.find((p) => p.id === s.projectId)
        const subjectMatch = getSessionSubjectIds(s, project).some((subjectId) => {
          const subject = getSubjectById(subjectId)
          return (
            subjectId.toLowerCase().includes(lower) ||
            (subject?.name.toLowerCase().includes(lower) ?? false) ||
            (subject?.shortCode.toLowerCase().includes(lower) ?? false)
          )
        })
        return (
          s.title.toLowerCase().includes(lower) ||
          (s.description?.toLowerCase().includes(lower) ?? false) ||
          (s.topics?.some((t) => t.toLowerCase().includes(lower)) ?? false) ||
          (project?.name.toLowerCase().includes(lower) ?? false) ||
          subjectMatch
        )
      }
    )

    const matchedEvents = evts.filter((event) => {
      const subject = getSubjectById(event.subjectId)
      const eventInfo = getEventTypeInfo(event.eventType)
      return (
        event.title.toLowerCase().includes(lower) ||
        (event.description?.toLowerCase().includes(lower) ?? false) ||
        (event.location?.toLowerCase().includes(lower) ?? false) ||
        (subject?.name.toLowerCase().includes(lower) ?? false) ||
        eventInfo.label.toLowerCase().includes(lower)
      )
    })

    const immediateResults = { projects: matchedProjects, sessions: matchedSessions, events: matchedEvents, files: [] }
    setResults(immediateResults)
    setSelectedIndex(getTotalResults(immediateResults) > 0 ? 0 : -1)
    setLoading(true)
    setFileSearchFailed(false)

    try {
      const fileResults = await invoke<SearchResult[]>("search_files_all_projects", { query: trimmed })
      if (searchRequestRef.current !== requestId) return

      const nextResults = {
        projects: matchedProjects,
        sessions: matchedSessions,
        events: matchedEvents,
        files: fileResults.slice(0, 20),
      }
      setResults(nextResults)
      setSelectedIndex(getTotalResults(nextResults) > 0 ? 0 : -1)
    } catch {
      if (searchRequestRef.current !== requestId) return

      setResults(immediateResults)
      setFileSearchFailed(true)
    } finally {
      if (searchRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query, projects, sessions, events), 200)
    return () => clearTimeout(timer)
  }, [query, search, projects, sessions, events])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        onOpenChange(!open)
      }
      if (e.key === "Escape") {
        onOpenChange(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [open, onOpenChange])

  const totalResults = results.projects.length + results.sessions.length + results.events.length + results.files.length
  const allItems = [
    ...results.projects.map((p) => ({ type: "project" as const, data: p })),
    ...results.sessions.map((s) => ({ type: "session" as const, data: s })),
    ...results.events.map((event) => ({ type: "event" as const, data: event })),
    ...results.files.map((f) => ({ type: "file" as const, data: f })),
  ]
  const hasQuery = query.trim().length > 0
  const hasVisibleResults = totalResults > 0
  const activeResultId = selectedIndex >= 0 ? getResultId(selectedIndex) : undefined

  const handleSelect = (item: (typeof allItems)[number]) => {
    if (item.type === "project") {
      onSelectProject(item.data.id)
    } else if (item.type === "session") {
      onSelectSession(item.data)
    } else if (item.type === "event") {
      onSelectEvent(item.data)
    } else if (item.type === "file") {
      void openPath(item.data.file.path).catch(() => undefined)
    }
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (totalResults === 0) return
      setSelectedIndex((i) => (i < 0 ? 0 : (i + 1) % totalResults))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (totalResults === 0) return
      setSelectedIndex((i) => (i < 0 ? totalResults - 1 : (i - 1 + totalResults) % totalResults))
    } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < allItems.length) {
      e.preventDefault()
      handleSelect(allItems[selectedIndex])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 px-3 pt-[14vh] backdrop-blur-sm sm:pt-[18vh]"
      onClick={() => onOpenChange(false)}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="sr-only">Search</h2>
        <div id={statusId} className="sr-only" aria-live="polite">
          {loading ? "Searching" : `${totalResults} results`}
        </div>

        <div className="flex min-h-14 items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(-1)
            }}
            placeholder="Search assessments, sessions, events, files"
            role="combobox"
            aria-expanded={hasVisibleResults}
            aria-controls={resultListId}
            aria-activedescendant={activeResultId}
            aria-describedby={statusId}
            autoComplete="off"
            spellCheck={false}
            className="h-13 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => setQuery("")}
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </div>

        {hasVisibleResults && (
          <ScrollArea className="max-h-[min(60vh,28rem)]">
            <div id={resultListId} role="listbox" aria-label="Search results" className="py-2">
              {results.projects.length > 0 && (
                <div role="group" aria-label="Assessments">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Assessments
                  </div>
                  {results.projects.map((project, idx) => {
                    const subject = getSubjectById(project.subjectId)
                    const globalIdx = idx
                    return (
                      <button
                        key={project.id}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80"
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() => handleSelect({ type: "project", data: project })}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/45 text-sm">
                          {project.icon ?? "📄"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{project.name}</p>
                          {subject && (
                            <span
                              className="rounded px-1.5 py-0.5 text-micro font-medium"
                              style={{ backgroundColor: subject.color + "20", color: subject.color }}
                            >
                              {subject.shortCode}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    )
                  })}
                </div>
              )}

              {results.sessions.length > 0 && (
                <div role="group" aria-label="Study Sessions">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Study Sessions
                  </div>
                  {results.sessions.map((session, idx) => {
                    const project = projects.find((p) => p.id === session.projectId)
                    const subjectLabel = getSessionSubjectIds(session, project)
                      .map((subjectId) => getSubjectById(subjectId)?.shortCode ?? subjectId)
                      .join(", ")
                    const globalIdx = results.projects.length + idx
                    return (
                      <button
                        key={session.id}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80"
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() => handleSelect({ type: "session", data: session })}
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-4 w-4 text-primary/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{session.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{project?.name ?? subjectLabel}</p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    )
                  })}
                </div>
              )}

              {results.events.length > 0 && (
                <div role="group" aria-label="Events">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Events
                  </div>
                  {results.events.map((event, idx) => {
                    const subject = getSubjectById(event.subjectId)
                    const eventInfo = getEventTypeInfo(event.eventType)
                    const globalIdx = results.projects.length + results.sessions.length + idx
                    return (
                      <button
                        key={event.id}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80"
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() => handleSelect({ type: "event", data: event })}
                      >
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <CalendarDays className="h-4 w-4 text-primary/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{event.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span
                              className="rounded px-1.5 py-0.5 text-micro font-medium"
                              style={{ backgroundColor: eventInfo.color + "20", color: eventInfo.color }}
                            >
                              {eventInfo.label}
                            </span>
                            {subject && (
                              <span
                                className="rounded px-1.5 py-0.5 text-micro font-medium"
                                style={{ backgroundColor: subject.color + "20", color: subject.color }}
                              >
                                {subject.shortCode}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    )
                  })}
                </div>
              )}

              {results.files.length > 0 && (
                <div role="group" aria-label="Files">
                  <div className="px-4 pb-1 pt-2 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Files
                  </div>
                  {results.files.map((result, idx) => {
                    const globalIdx = results.projects.length + results.sessions.length + results.events.length + idx
                    return (
                      <button
                        key={result.file.path}
                        id={getResultId(globalIdx)}
                        role="option"
                        aria-selected={selectedIndex === globalIdx}
                        className={cn(
                          "group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/45",
                          selectedIndex === globalIdx && "bg-accent/80"
                        )}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        onClick={() => handleSelect({ type: "file", data: result })}
                      >
                        <FileTypeIcon extension={result.file.extension} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{result.file.name}</p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Folder className="h-3 w-3 shrink-0" />
                            <span className="truncate">{result.projectFolder}</span>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0 tabular-nums">{formatFileSize(result.file.size)}</span>
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-aria-selected:opacity-100" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {!hasQuery && (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <Search className="h-4 w-4 text-muted-foreground/55" />
            <p className="text-sm text-muted-foreground">Start typing to search.</p>
          </div>
        )}

        {hasQuery && totalResults === 0 && loading && (
          <div className="space-y-2 px-4 py-4" aria-label="Searching">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex min-h-12 items-center gap-3 rounded-lg py-2">
                <div className="size-8 rounded-lg bg-muted/60 motion-safe:animate-pulse" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3 w-2/5 rounded bg-muted/70 motion-safe:animate-pulse" />
                  <div className="h-2.5 w-3/5 rounded bg-muted/45 motion-safe:animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {hasQuery && totalResults === 0 && !loading && (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <Search className="h-4 w-4 text-muted-foreground/55" />
            <p className="max-w-72 truncate text-sm text-muted-foreground">
              No results for "{query.trim()}"
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 text-micro text-muted-foreground">
          <div className="hidden items-center gap-3 sm:flex">
            <span>
              <kbd className="rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono">⌘K</kbd> toggle
            </span>
            <span>
              <kbd className="rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono">↵</kbd> open
            </span>
          </div>
          <span className={cn("ml-auto", fileSearchFailed && "text-destructive")}>
            {loading && hasVisibleResults ? "Searching files" : fileSearchFailed ? "File search unavailable" : (
              <>
                <kbd className="rounded border border-border bg-background/70 px-1.5 py-0.5 font-mono">Esc</kbd> close
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  )
}
