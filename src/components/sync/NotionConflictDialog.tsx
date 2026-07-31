import { useState } from "react"
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { NotionSyncSnapshot } from "@/lib/types"

type ConflictResolution = "local" | "notion" | "skip"
type ConflictResolutions = Record<string, ConflictResolution>

const CONFLICT_FIELD_LABELS: Record<string, string> = {
  title: "title",
  startTime: "start time",
  endTime: "end time",
  eventType: "type",
  isFinished: "completion",
  isCompleted: "completion",
  subjectId: "subject",
  description: "description or notes",
  record: "synced details",
}

export interface NotionConflict {
  id: string
  type: "event" | "session"
  title: string
  localId: string
  notionPageId: string
  notionLastEditedTime?: string
  localUpdatedAt?: string
  localSnapshot: NotionSyncSnapshot
  remoteSnapshot: NotionSyncSnapshot
  localBodyHash?: string
  localSubjectIds?: string[]
  conflictingFields: string[]
  localVersion: {
    title: string
    startTime?: string
    endTime?: string
    status?: string
    subject?: string
    eventType?: string
  }
  notionVersion: {
    title: string
    startTime?: string
    endTime?: string
    status?: string
    subject?: string
    eventType?: string
    url?: string
  }
  localUpdates: Record<string, unknown>
  remoteUpdates: Record<string, unknown>
}

interface NotionConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conflicts: NotionConflict[]
  onResolve: (resolutions: ConflictResolutions) => Promise<void>
}

export function NotionConflictDialog({
  open,
  onOpenChange,
  conflicts,
  onResolve,
}: NotionConflictDialogProps) {
  const [resolutions, setResolutions] = useState<ConflictResolutions>({})
  const [isResolving, setIsResolving] = useState(false)
  const [resolutionError, setResolutionError] = useState<string | null>(null)

  const handleOpenChange = (nextOpen: boolean) => {
    if (isResolving) return
    if (!nextOpen) {
      setResolutions({})
      setResolutionError(null)
    }
    onOpenChange(nextOpen)
  }

  const handleResolve = (id: string, resolution: ConflictResolution) => {
    setResolutions((previous) => ({ ...previous, [id]: resolution }))
  }

  const submitResolutions = async (nextResolutions: ConflictResolutions) => {
    if (isResolving) return
    setIsResolving(true)
    setResolutionError(null)
    try {
      await onResolve(nextResolutions)
      setIsResolving(false)
      setResolutions({})
      onOpenChange(false)
    } catch (error) {
      setIsResolving(false)
      setResolutionError(error instanceof Error ? error.message : "Could not resolve these conflicts. Try again.")
    }
  }

  const handleResolveAll = async () => {
    const allResolutions: ConflictResolutions = {}
    conflicts.forEach((conflict) => {
      allResolutions[conflict.id] = resolutions[conflict.id] ?? "local"
    })
    await submitResolutions(allResolutions)
  }

  const handleSkipAll = async () => {
    const skipAll: ConflictResolutions = {}
    conflicts.forEach((conflict) => {
      skipAll[conflict.id] = "skip"
    })
    await submitResolutions(skipAll)
  }

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "—"
    const date = new Date(dateString)
    if (!Number.isFinite(date.getTime())) return dateString
    return date.toLocaleString("en-AU", {
      dateStyle: "medium",
      timeStyle: "short",
    })
  }

  const allResolved = conflicts.every((conflict) => resolutions[conflict.id])

  return (
    <Dialog open={open && conflicts.length > 0} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-busy={isResolving}
        className="flex h-[min(90dvh,46rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-2rem)] sm:max-w-3xl"
        showCloseButton={!isResolving}
      >
        <DialogHeader className="shrink-0 border-b py-4 pr-14 pl-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <AlertTriangle aria-hidden="true" className="size-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-heading">Notion sync conflicts</DialogTitle>
              <DialogDescription className="mt-1">
                {conflicts.length} item{conflicts.length === 1 ? "" : "s"} were modified in both Focal and Notion.
                Choose which version to keep for each conflict.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1">
          <ScrollArea
            aria-label="Notion conflicts to review"
            className="min-h-0 flex-1"
            role="region"
          >
            <div className="space-y-3 px-4 py-4 pr-5 sm:px-5 sm:pr-6">
              {conflicts.map((conflict) => {
                const resolution = resolutions[conflict.id]
                return (
                  <div
                    key={conflict.id}
                    className="min-w-0 rounded-xl border border-border/70 bg-background/48 p-4"
                  >
                    <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="shrink-0 text-xs font-medium uppercase text-muted-foreground">
                          {conflict.type}
                        </span>
                        <span className="min-w-0 break-words text-sm font-medium">{conflict.title}</span>
                      </div>
                      {resolution && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                            resolution === "local" && "bg-primary/10 text-primary",
                            resolution === "notion" && "bg-green-500/10 text-green-600 dark:text-green-400",
                            resolution === "skip" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {resolution === "local" ? "Keeping Focal" : resolution === "notion" ? "Keeping Notion" : "Skipped"}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="min-w-0 rounded-lg border border-border/50 bg-muted/30 p-3">
                        <div className="mb-2 text-xs font-medium text-muted-foreground">Focal version</div>
                        <div className="min-w-0 space-y-1 text-sm">
                          <div className="break-words font-medium">{conflict.localVersion.title}</div>
                          <div className="break-words text-xs text-muted-foreground">
                            {formatDateTime(conflict.localVersion.startTime)}
                            {conflict.localVersion.endTime && ` – ${formatDateTime(conflict.localVersion.endTime)}`}
                          </div>
                          {conflict.localVersion.status && (
                            <div className="break-words text-xs text-muted-foreground">
                              Status: {conflict.localVersion.status}
                            </div>
                          )}
                          {conflict.localVersion.subject && (
                            <div className="break-words text-xs text-muted-foreground">
                              Subject: {conflict.localVersion.subject}
                            </div>
                          )}
                          {conflict.localVersion.eventType && (
                            <div className="break-words text-xs text-muted-foreground">
                              Type: {conflict.localVersion.eventType}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 rounded-lg border border-border/50 bg-muted/30 p-3">
                        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">Notion version</span>
                          {conflict.notionVersion.url && (
                            <a
                              href={conflict.notionVersion.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open ${conflict.title} in Notion in a new tab`}
                              className="shrink-0 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <ExternalLink aria-hidden="true" className="size-3" />
                            </a>
                          )}
                        </div>
                        <div className="min-w-0 space-y-1 text-sm">
                          <div className="break-words font-medium">{conflict.notionVersion.title}</div>
                          <div className="break-words text-xs text-muted-foreground">
                            {formatDateTime(conflict.notionVersion.startTime)}
                            {conflict.notionVersion.endTime && ` – ${formatDateTime(conflict.notionVersion.endTime)}`}
                          </div>
                          {conflict.notionVersion.status && (
                            <div className="break-words text-xs text-muted-foreground">
                              Status: {conflict.notionVersion.status}
                            </div>
                          )}
                          {conflict.notionVersion.subject && (
                            <div className="break-words text-xs text-muted-foreground">
                              Subject: {conflict.notionVersion.subject}
                            </div>
                          )}
                          {conflict.notionVersion.eventType && (
                            <div className="break-words text-xs text-muted-foreground">
                              Type: {conflict.notionVersion.eventType}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-muted-foreground">
                      Needs a choice: {conflict.conflictingFields
                        .map((field) => CONFLICT_FIELD_LABELS[field] ?? field)
                        .join(", ")}.
                    </p>

                    <div
                      aria-label={`Resolution for ${conflict.title}`}
                      className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                      role="group"
                    >
                      <Button
                        aria-pressed={resolution === "local"}
                        size="sm"
                        variant={resolution === "local" ? "default" : "outline"}
                        onClick={() => handleResolve(conflict.id, "local")}
                        disabled={isResolving}
                        className="w-full min-w-0"
                      >
                        <CheckCircle2 aria-hidden="true" className="mr-1.5 size-3.5" />
                        Keep Focal
                      </Button>
                      <Button
                        aria-pressed={resolution === "notion"}
                        size="sm"
                        variant={resolution === "notion" ? "default" : "outline"}
                        onClick={() => handleResolve(conflict.id, "notion")}
                        disabled={isResolving}
                        className="w-full min-w-0"
                      >
                        <ExternalLink aria-hidden="true" className="mr-1.5 size-3.5" />
                        Keep Notion
                      </Button>
                      <Button
                        aria-pressed={resolution === "skip"}
                        size="sm"
                        variant={resolution === "skip" ? "default" : "outline"}
                        onClick={() => handleResolve(conflict.id, "skip")}
                        disabled={isResolving}
                        className="w-full sm:w-auto"
                      >
                        Skip
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </DialogBody>

        {resolutionError && (
          <p
            className="shrink-0 border-t border-destructive/20 bg-destructive/10 px-5 py-2 text-xs text-destructive"
            role="alert"
          >
            {resolutionError}
          </p>
        )}

        <DialogFooter className="m-0 shrink-0 rounded-none border-t px-4 py-3 sm:justify-between sm:px-5">
          <Button
            variant="ghost"
            onClick={() => void handleSkipAll()}
            disabled={isResolving}
            className="w-full sm:w-auto"
          >
            Skip all
          </Button>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <DialogClose asChild>
              <Button variant="outline" disabled={isResolving} className="w-full sm:w-auto">
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={() => void handleResolveAll()}
              disabled={!allResolved || isResolving}
              className="w-full sm:w-auto"
            >
              {isResolving
                ? "Resolving…"
                : `Resolve all (${Object.keys(resolutions).length}/${conflicts.length})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
