import { useCallback, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { addMinutes } from "date-fns"
import { AlertCircle, CalendarPlus, Check, Loader2, Wand2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileTypeIcon } from "@/components/FileTypeIcon"
import { getAiPlannerUseFileContent, getApiKey, getModel, setAiPlannerUseFileContent, getReasoningConfig } from "@/lib/settings"
import { getSubjectById } from "@/lib/utils"
import type { CalendarEvent, EventType, FileInfo, Project } from "@/lib/types"
import { cn } from "@/lib/utils"

interface FileContentPreview {
  file_path: string
  content: string
}

interface PlannedEventDraft {
  title: string
  description?: string
  date: string
  startTime: string
  durationMinutes: number
  eventType: EventType
  sourceFiles: string[]
  approved: boolean
}

interface FileStudyPlannerButtonProps {
  project: Project
  files: FileInfo[]
  selectedFilePaths: Set<string>
  onCreateEvents: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
}

const MAX_FILES_FOR_PLAN = 12
const VALID_EVENT_TYPES = new Set<EventType>(["sac", "exam", "assignment", "gat", "event"])

function getLocalDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getPlanningEndDateValue(deadline?: string): string {
  const fallback = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
  if (!deadline) return getLocalDateValue(fallback)

  const deadlineDate = new Date(deadline)
  if (Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() < Date.now()) {
    return getLocalDateValue(fallback)
  }

  return getLocalDateValue(deadlineDate)
}

function combineDateAndTime(dateValue: string, timeValue: string): Date | null {
  const dateParts = dateValue.split("-").map(Number)
  const timeParts = timeValue.split(":").map(Number)
  if (dateParts.length !== 3 || timeParts.length < 2) return null

  const [year, month, day] = dateParts
  const [hours, minutes] = timeParts
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes)
  ) {
    return null
  }

  const date = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function parsePlanResponse(content: string, fileNames: string[]): PlannedEventDraft[] {
  const parsed: unknown = JSON.parse(content)
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid planner response")
  }

  const items = (parsed as { events?: unknown }).events
  if (!Array.isArray(items)) {
    throw new Error("Planner response missing events array")
  }

  return items.flatMap((item) => {
    if (typeof item !== "object" || item === null) return []
    const record = item as Record<string, unknown>
    const title = typeof record.title === "string" ? record.title.trim() : ""
    const date = typeof record.date === "string" ? record.date.trim() : ""
    const startTime = typeof record.start_time === "string" ? record.start_time.trim() : ""
    const durationMinutes = typeof record.duration_minutes === "number" ? record.duration_minutes : 60
    const eventType = VALID_EVENT_TYPES.has(record.event_type as EventType) ? (record.event_type as EventType) : "event"
    const sourceFiles = Array.isArray(record.source_files)
      ? record.source_files.filter((source): source is string => typeof source === "string" && fileNames.includes(source))
      : []

    if (!title || !date || !startTime) return []

    return [{
      title,
      description: typeof record.description === "string" && record.description.trim()
        ? record.description.trim()
        : undefined,
      date,
      startTime,
      durationMinutes: Math.min(180, Math.max(30, Math.round(durationMinutes / 15) * 15)),
      eventType,
      sourceFiles,
      approved: true,
    }]
  })
}

async function getFileContentPreviews(files: FileInfo[]): Promise<Map<string, string>> {
  const previews = await invoke<FileContentPreview[]>("get_file_content_previews", {
    filePaths: files.map((file) => file.path),
    maxCharsPerFile: 900,
  })

  return new Map(previews.map((preview) => [preview.file_path, preview.content]))
}

async function generatePlan(
  project: Project,
  files: FileInfo[],
  apiKey: string,
  model: string,
  useFileContent: boolean,
): Promise<PlannedEventDraft[]> {
  const fileContentPreviews = useFileContent ? await getFileContentPreviews(files) : new Map<string, string>()
  const fileNames = files.map((file) => file.name)
  const subject = getSubjectById(project.subjectId)
  const today = getLocalDateValue(new Date())
  const planningEnd = getPlanningEndDateValue(project.deadline)
  const fileLines = files.map((file, index) => {
    const preview = fileContentPreviews.get(file.path)
    const details = [
      `${index + 1}. ${file.name}`,
      `Type: ${file.extension || "unknown"}`,
      file.subfolder ? `Folder: ${file.subfolder}` : null,
      preview ? `Content preview:\n"""\n${preview}\n"""` : null,
    ].filter(Boolean)

    return details.join("\n")
  })

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: `You create practical study calendar events for VCE students from an assessment file list.

Rules:
- Return 3 to 6 useful calendar events.
- Schedule dates from ${today} through ${planningEnd}.
- Use the assessment date as the latest meaningful preparation date when it exists.
- Prefer concrete titles, such as "Review Methods SAC Notes" or "Past Paper Error Log".
- Use event_type "event" for study blocks unless the file list clearly describes a real SAC, exam, GAT, or assignment.
- Use 24-hour start_time in HH:mm format.
- Use durations from 30 to 180 minutes in 15-minute increments.
- Only reference source_files from the provided file names.`,
        },
        {
          role: "user",
          content: `Assessment: ${project.name}
Subject: ${subject ? `${subject.name} (${subject.shortCode})` : "No subject"}
Assessment date: ${project.deadline ?? "No assessment date"}

Files:
${fileLines.join("\n\n")}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "study_plan_events",
          strict: true,
          schema: {
            type: "object",
            properties: {
              events: {
                type: "array",
                minItems: 3,
                maxItems: 6,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    date: { type: "string", description: "YYYY-MM-DD" },
                    start_time: { type: "string", description: "HH:mm in 24-hour time" },
                    duration_minutes: { type: "number" },
                    event_type: {
                      type: "string",
                      enum: ["sac", "exam", "assignment", "gat", "event"],
                    },
                    source_files: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: fileNames,
                      },
                    },
                  },
                  required: ["title", "description", "date", "start_time", "duration_minutes", "event_type", "source_files"],
                  additionalProperties: false,
                },
              },
            },
            required: ["events"],
            additionalProperties: false,
          },
        },
      },
      provider: {
        require_parameters: true,
      },
      temperature: 0.25,
      max_tokens: 1800,
      ...getReasoningConfig(),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${text}`)
  }

  const data = await response.json() as { choices?: { message?: { content?: unknown } }[] }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== "string") {
    throw new Error("No structured content in OpenRouter response")
  }

  const drafts = parsePlanResponse(content, fileNames)
  if (drafts.length === 0) {
    throw new Error("Planner did not return usable events")
  }
  return drafts
}

function buildEventDescription(draft: PlannedEventDraft): string | undefined {
  const parts = [
    draft.description,
    draft.sourceFiles.length > 0 ? `Source files: ${draft.sourceFiles.join(", ")}` : undefined,
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join("\n\n") : undefined
}

export function FileStudyPlannerButton({
  project,
  files,
  selectedFilePaths,
  onCreateEvents,
}: FileStudyPlannerButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<PlannedEventDraft[]>([])
  const [useFileContent, setUseFileContent] = useState(() => getAiPlannerUseFileContent())
  const apiKeyMissing = !getApiKey()

  const filesForPlan = useMemo(() => {
    const scopedFiles = selectedFilePaths.size > 0
      ? files.filter((file) => selectedFilePaths.has(file.path))
      : files
    return scopedFiles.slice(0, MAX_FILES_FOR_PLAN)
  }, [files, selectedFilePaths])

  const handleOpen = useCallback(() => {
    setUseFileContent(getAiPlannerUseFileContent())
    setDrafts([])
    setError(null)
    setOpen(true)
  }, [])

  const handleGenerate = useCallback(async () => {
    const key = getApiKey()
    if (!key) {
      setError("OpenRouter API key not configured. Set it in Settings.")
      return
    }
    if (filesForPlan.length === 0) {
      setError("No files available for planning.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const nextDrafts = await generatePlan(project, filesForPlan, key, getModel(), useFileContent)
      setDrafts(nextDrafts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [filesForPlan, project, useFileContent])

  const toggleDraft = useCallback((index: number) => {
    setDrafts((current) => current.map((draft, idx) => (
      idx === index ? { ...draft, approved: !draft.approved } : draft
    )))
  }, [])

  const handleApply = useCallback(async () => {
    const approvedDrafts = drafts.filter((draft) => draft.approved)
    if (approvedDrafts.length === 0) return

    const events = approvedDrafts.flatMap((draft) => {
      const start = combineDateAndTime(draft.date, draft.startTime)
      if (!start) return []
      const end = addMinutes(start, draft.durationMinutes)
      return [{
        title: draft.title,
        description: buildEventDescription(draft),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        eventType: draft.eventType,
        subjectId: project.subjectId,
        location: project.name,
      }]
    })

    if (events.length === 0) {
      setError("The generated dates could not be converted into calendar events.")
      return
    }

    setApplying(true)
    setError(null)
    try {
      await onCreateEvents(events)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }, [drafts, onCreateEvents, project.name, project.subjectId])

  const approvedCount = drafts.filter((draft) => draft.approved).length
  const scopedLabel = selectedFilePaths.size > 0
    ? `${filesForPlan.length} selected file${filesForPlan.length !== 1 ? "s" : ""}`
    : `${filesForPlan.length} visible file${filesForPlan.length !== 1 ? "s" : ""}`

  if (files.length === 0) return null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="h-8 gap-1.5 rounded-lg bg-background/45"
      >
        <Wand2 className="h-4 w-4" />
        <span className="max-[1100px]:hidden">AI Plan</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Plan Events from Files</DialogTitle>
            <DialogDescription>
              Generate calendar drafts from {scopedLabel}. Review them before adding anything.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {apiKeyMissing && (
              <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                OpenRouter API key not configured. Go to Settings to set it up.
              </p>
            )}

            {error && (
              <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
              <div className="rounded-lg border border-border/70 bg-background/35 p-3">
                <p className="text-xs font-medium">Planning inputs</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {filesForPlan.slice(0, 6).map((file) => (
                    <span
                      key={file.path}
                      className="inline-flex max-w-44 items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-micro text-muted-foreground"
                    >
                      <FileTypeIcon extension={file.extension} className="size-4 rounded" iconClassName="size-2.5" />
                      <span className="truncate">{file.name}</span>
                    </span>
                  ))}
                  {filesForPlan.length > 6 && (
                    <span className="rounded-md bg-muted/60 px-2 py-1 text-micro text-muted-foreground">
                      +{filesForPlan.length - 6} more
                    </span>
                  )}
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/35 p-3">
                <span className="min-w-0">
                  <span className="block text-xs font-medium">Read text previews</span>
                  <span className="block text-caption text-muted-foreground">Uses short excerpts from text-like files.</span>
                </span>
                <input
                  type="checkbox"
                  checked={useFileContent}
                  onChange={(event) => {
                    const enabled = event.target.checked
                    setUseFileContent(enabled)
                    setAiPlannerUseFileContent(enabled)
                  }}
                  className="h-4 w-4 shrink-0"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleGenerate}
                disabled={loading || apiKeyMissing || filesForPlan.length === 0}
                size="sm"
                className="gap-1.5"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {loading ? "Generating..." : "Generate Drafts"}
              </Button>
              {drafts.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {approvedCount} of {drafts.length} approved
                </span>
              )}
            </div>

            {drafts.length > 0 && (
              <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border/70">
                <div className="divide-y divide-border/60">
                  {drafts.map((draft, index) => (
                    <div
                      key={`${draft.title}-${draft.date}-${draft.startTime}`}
                      className={cn(
                        "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-3 bg-background/40 px-3 py-3",
                        !draft.approved && "opacity-55",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleDraft(index)}
                        className={cn(
                          "mt-0.5 flex h-4 w-4 items-center justify-center rounded border transition-colors",
                          draft.approved
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30 hover:border-muted-foreground/60",
                        )}
                        aria-label={draft.approved ? "Reject event draft" : "Approve event draft"}
                      >
                        {draft.approved && <Check className="h-3 w-3" />}
                      </button>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{draft.title}</p>
                        {draft.description && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{draft.description}</p>
                        )}
                        {draft.sourceFiles.length > 0 && (
                          <p className="mt-1 truncate text-micro text-muted-foreground/70">
                            {draft.sourceFiles.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium tabular-nums">{draft.date}</p>
                        <p className="mt-0.5 text-micro text-muted-foreground tabular-nums">
                          {draft.startTime} / {draft.durationMinutes}m
                        </p>
                        <span className="mt-1 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-micro text-muted-foreground">
                          {draft.eventType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={approvedCount === 0 || applying}
              className="gap-1.5"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {applying ? "Adding..." : `Add ${approvedCount} Event${approvedCount !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
