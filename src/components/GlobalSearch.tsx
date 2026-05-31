import { useState, useEffect, useCallback, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { openPath } from "@tauri-apps/plugin-opener"
import { Search, X, FileText, Folder, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatFileSize, getSubjectById } from "@/lib/utils"
import type { Project, StudySession, SearchResult } from "@/lib/types"
import { cn } from "@/lib/utils"

interface GlobalSearchProps {
  projects: Project[]
  sessions: StudySession[]
  onSelectProject: (id: string) => void
  onSelectSession: (session: StudySession) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SearchResults {
  projects: Project[]
  sessions: StudySession[]
  files: SearchResult[]
}

export function GlobalSearch({
  projects,
  sessions,
  onSelectProject,
  onSelectSession,
  open,
  onOpenChange,
}: GlobalSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults>({ projects: [], sessions: [], files: [] })
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("")
      setResults({ projects: [], sessions: [], files: [] })
      setSelectedIndex(-1)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const search = useCallback(async (q: string, projs: Project[], sess: StudySession[]) => {
    if (!q.trim()) {
      setResults({ projects: [], sessions: [], files: [] })
      return
    }

    const lower = q.toLowerCase()

    const matchedProjects = projs.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.description?.toLowerCase().includes(lower) ?? false) ||
        (getSubjectById(p.subjectId)?.name.toLowerCase().includes(lower) ?? false)
    )

    const matchedSessions = sess.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        (s.description?.toLowerCase().includes(lower) ?? false) ||
        (s.topics?.some((t) => t.toLowerCase().includes(lower)) ?? false)
    )

    setLoading(true)
    try {
      const fileResults = await invoke<SearchResult[]>("search_files_all_projects", { query: q })
      setResults({
        projects: matchedProjects,
        sessions: matchedSessions,
        files: fileResults.slice(0, 20),
      })
    } catch {
      setResults({ projects: matchedProjects, sessions: matchedSessions, files: [] })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(query, projects, sessions), 200)
    return () => clearTimeout(timer)
  }, [query, search, projects, sessions])

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

  const totalResults = results.projects.length + results.sessions.length + results.files.length
  const allItems = [
    ...results.projects.map((p) => ({ type: "project" as const, data: p })),
    ...results.sessions.map((s) => ({ type: "session" as const, data: s })),
    ...results.files.map((f) => ({ type: "file" as const, data: f })),
  ]

  const handleSelect = (item: (typeof allItems)[number]) => {
    if (item.type === "project") {
      onSelectProject(item.data.id)
    } else if (item.type === "session") {
      onSelectSession(item.data)
    } else if (item.type === "file") {
      openPath(item.data.file.path).catch(console.error)
    }
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, totalResults - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && selectedIndex >= 0 && selectedIndex < allItems.length) {
      e.preventDefault()
      handleSelect(allItems[selectedIndex])
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[20vh]"
      onClick={() => onOpenChange(false)}
    >
      <div
        ref={containerRef}
        className="w-full max-w-2xl bg-background border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(-1)
            }}
            placeholder="Search projects, sessions, files..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-12 text-base shadow-none"
          />
          {query && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setQuery("")}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {totalResults > 0 && (
          <ScrollArea className="max-h-[60vh]">
            <div className="py-2">
              {results.projects.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Projects
                  </div>
                  {results.projects.map((project, idx) => {
                    const subject = getSubjectById(project.subjectId)
                    const globalIdx = idx
                    return (
                      <button
                        key={project.id}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors",
                          selectedIndex === globalIdx && "bg-accent"
                        )}
                        onClick={() => handleSelect({ type: "project", data: project })}
                      >
                        <span className="text-base">{project.icon ?? "📄"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{project.name}</p>
                          {subject && (
                            <span
                              className="text-micro px-1.5 py-0.5 rounded font-medium"
                              style={{ backgroundColor: subject.color + "20", color: subject.color }}
                            >
                              {subject.shortCode}
                            </span>
                          )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </button>
                    )
                  })}
                </div>
              )}

              {results.sessions.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Study Sessions
                  </div>
                  {results.sessions.map((session, idx) => {
                    const project = projects.find((p) => p.id === session.projectId)
                    const globalIdx = results.projects.length + idx
                    return (
                      <button
                        key={session.id}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors",
                          selectedIndex === globalIdx && "bg-accent"
                        )}
                        onClick={() => handleSelect({ type: "session", data: session })}
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-blue-500/60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{session.title}</p>
                          {project && <p className="text-xs text-muted-foreground">{project.name}</p>}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </button>
                    )
                  })}
                </div>
              )}

              {results.files.length > 0 && (
                <div>
                  <div className="px-4 py-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground">
                    Files
                  </div>
                  {results.files.map((result, idx) => {
                    const globalIdx = results.projects.length + results.sessions.length + idx
                    return (
                      <button
                        key={result.file.path}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50 transition-colors",
                          selectedIndex === globalIdx && "bg-accent"
                        )}
                        onClick={() => handleSelect({ type: "file", data: result })}
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.file.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Folder className="h-3 w-3" />
                            <span className="truncate">{result.projectFolder}</span>
                            <span>·</span>
                            <span>{formatFileSize(result.file.size)}</span>
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {query && totalResults === 0 && !loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">No results found</div>
        )}

        {loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">Searching...</div>
        )}

        <div className="flex items-center justify-between px-4 py-2.5 border-t text-micro text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">⌘K</kbd> toggle
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">↵</kbd> open
            </span>
          </div>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}
