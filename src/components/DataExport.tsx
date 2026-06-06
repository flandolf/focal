import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { appDataDir } from "@tauri-apps/api/path"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { Download, Check, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"

interface DataExportProps {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ExportFormat = "json" | "csv"

function getAppDataFilePath(baseDir: string, fileName: string) {
  return `${baseDir.replace(/\/+$/, "")}/${fileName}`
}

export function DataExport({ projects, sessions, events, open, onOpenChange }: DataExportProps) {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [format, setFormat] = useState<ExportFormat>("json")

  const handleExport = () => {
    setExporting(true)
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        version: "0.1.0",
        storageModel: "projects-as-assessments",
        assessments: projects,
        projects,
        sessions,
        events,
      }

      const content =
        format === "json"
          ? JSON.stringify(data, null, 2)
          : toCsv(data)

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `focal-backup-${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setDone(true)
      setTimeout(() => {
        setDone(false)
        onOpenChange(false)
      }, 1500)
    } catch (e) {
      console.error("Export failed:", e)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async () => {
    const confirmed = await confirmDestructiveAction({
      title: "Import backup?",
      description: "This overwrites existing assessments, sessions, and events.",
      actionLabel: "Import",
    })
    if (!confirmed) return
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json"
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setImporting(true)
      try {
        const text = await file.text()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data: Record<string, unknown> = JSON.parse(text)
        const baseDir = await appDataDir()

        const importedAssessments = Array.isArray(data.assessments)
          ? data.assessments
          : Array.isArray(data.projects)
            ? data.projects
            : []

        // Assessments are stored in the legacy projects.json file for migration compatibility.
        if (importedAssessments.length > 0) {
          await writeTextFile(
            getAppDataFilePath(baseDir, "projects.json"),
            JSON.stringify(importedAssessments, null, 2),
          )
          for (const project of importedAssessments as { folder_path: string }[]) {
            if (!project.folder_path) continue
            try {
              await invoke("create_project_with_subfolders", {
                projectName: project.folder_path,
                subfolders: ["SACs", "Notes", "Past-Papers", "Exam-Revision", "Resources"],
              })
            } catch {
              // folder may already exist
            }
          }
        }

        // Restore sessions
        if (data.sessions && Array.isArray(data.sessions)) {
          await writeTextFile(
            getAppDataFilePath(baseDir, "sessions.json"),
            JSON.stringify(data.sessions, null, 2),
          )
        }

        if (data.events && Array.isArray(data.events)) {
          await writeTextFile(
            getAppDataFilePath(baseDir, "events.json"),
            JSON.stringify(data.events, null, 2),
          )
        }

        setDone(true)
        setTimeout(() => {
          setDone(false)
          onOpenChange(false)
          window.location.reload()
        }, 800)
      } catch (err) {
        console.error("Import failed:", err)
      } finally {
        setImporting(false)
      }
    }
    input.click()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export & Backup</DialogTitle>
          <DialogDescription>
            Export all your assessments, sessions, and events.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFormat("json")}
              className={`min-h-10 flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                format === "json"
                  ? "border-primary/35 bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/50"
              }`}
              aria-pressed={format === "json"}
            >
              JSON
            </button>
            <button
              onClick={() => setFormat("csv")}
              className={`min-h-10 flex-1 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                format === "csv"
                  ? "border-primary/35 bg-primary/10 font-medium text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/50"
              }`}
              aria-pressed={format === "csv"}
            >
              CSV
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
            <div className="rounded-lg border border-border/60 bg-background/45 p-3">
              <p className="text-xl font-semibold">{projects.length}</p>
              <p className="text-xs text-muted-foreground">Assessments</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/45 p-3">
              <p className="text-xl font-semibold">{sessions.length}</p>
              <p className="text-xs text-muted-foreground">Sessions</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/45 p-3">
              <p className="text-xl font-semibold">{events.length}</p>
              <p className="text-xs text-muted-foreground">Events</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 gap-2"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : done ? (
                <Check className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {done ? "Exported!" : "Export"}
            </Button>
            <Button variant="outline" onClick={handleImport} disabled={importing} className="gap-2">
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function toCsv(data: {
  projects: Project[]
  sessions: StudySession[]
  events: CalendarEvent[]
}): string {
  const sections: string[] = []

  sections.push("# Assessments")
  sections.push(
    "id,name,description,subject,unit,deadline,deadlineType,folder_path,created_at"
  )
  for (const p of data.projects) {
    sections.push(
      [
        csvEscape(p.id),
        csvEscape(p.name),
        csvEscape(p.description ?? ""),
        csvEscape(p.subjectId ?? ""),
        csvEscape(p.unit ?? ""),
        csvEscape(p.deadline ?? ""),
        csvEscape(p.deadlineType ?? ""),
        csvEscape(p.folder_path),
        csvEscape(p.created_at),
      ].join(",")
    )
  }

  sections.push("")
  sections.push("# Sessions")
  sections.push(
    "id,projectId,subjectIds,title,startTime,endTime,status,topics,notes,confidence,blockers,nextAction,completedAt,created_at"
  )
  for (const s of data.sessions) {
    sections.push(
      [
        csvEscape(s.id),
        csvEscape(s.projectId ?? ""),
        csvEscape(s.subjectIds.join("; ")),
        csvEscape(s.title),
        csvEscape(s.startTime),
        csvEscape(s.endTime),
        csvEscape(s.status),
        csvEscape(s.topics?.join("; ") ?? ""),
        csvEscape(s.notes ?? ""),
        csvEscape(s.confidence ? String(s.confidence) : ""),
        csvEscape(s.blockers ?? ""),
        csvEscape(s.nextAction ?? ""),
        csvEscape(s.completedAt ?? ""),
        csvEscape(s.created_at),
      ].join(",")
    )
  }

  sections.push("")
  sections.push("# Events")
  sections.push(
    "id,title,description,startTime,endTime,eventType,subject,location,isFinished,finishedAt,created_at"
  )
  for (const event of data.events) {
    sections.push(
      [
        csvEscape(event.id),
        csvEscape(event.title),
        csvEscape(event.description ?? ""),
        csvEscape(event.startTime),
        csvEscape(event.endTime ?? ""),
        csvEscape(event.eventType),
        csvEscape(event.subjectId ?? ""),
        csvEscape(event.location ?? ""),
        csvEscape(event.isFinished ? "true" : "false"),
        csvEscape(event.finishedAt ?? ""),
        csvEscape(event.created_at),
      ].join(",")
    )
  }

  return sections.join("\n")
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
