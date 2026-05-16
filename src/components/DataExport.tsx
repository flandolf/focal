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
import type { Project, StudySession, GradeEntry } from "@/lib/types"

interface DataExportProps {
  projects: Project[]
  sessions: StudySession[]
  grades: GradeEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ExportFormat = "json" | "csv"

export function DataExport({ projects, sessions, grades, open, onOpenChange }: DataExportProps) {
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
        projects,
        sessions,
        grades,
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

  const handleImport = () => {
    if (!window.confirm("Import will overwrite all existing projects, sessions, and grades. Continue?")) return
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

        // Restore projects
        if (data.projects && Array.isArray(data.projects)) {
          await writeTextFile(`${baseDir}projects.json`, JSON.stringify(data.projects, null, 2))
          for (const project of data.projects as { folder_path: string }[]) {
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
          await writeTextFile(`${baseDir}sessions.json`, JSON.stringify(data.sessions, null, 2))
        }

        // Restore grades
        if (data.grades && Array.isArray(data.grades)) {
          await writeTextFile(`${baseDir}grades.json`, JSON.stringify(data.grades, null, 2))
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export & Backup</DialogTitle>
          <DialogDescription>
            Export all your projects, sessions, and grades.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFormat("json")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                format === "json"
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border text-muted-foreground hover:bg-accent/50"
              }`}
            >
              JSON
            </button>
            <button
              onClick={() => setFormat("csv")}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                format === "csv"
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border text-muted-foreground hover:bg-accent/50"
              }`}
            >
              CSV
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-semibold">{projects.length}</p>
              <p className="text-xs text-muted-foreground">Projects</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-semibold">{sessions.length}</p>
              <p className="text-xs text-muted-foreground">Sessions</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-lg font-semibold">{grades.length}</p>
              <p className="text-xs text-muted-foreground">Grades</p>
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
  grades: GradeEntry[]
}): string {
  const sections: string[] = []

  sections.push("# Projects")
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
    "id,projectId,title,startTime,endTime,status,topics,notes,created_at"
  )
  for (const s of data.sessions) {
    sections.push(
      [
        csvEscape(s.id),
        csvEscape(s.projectId),
        csvEscape(s.title),
        csvEscape(s.startTime),
        csvEscape(s.endTime),
        csvEscape(s.status),
        csvEscape(s.topics?.join("; ") ?? ""),
        csvEscape(s.notes ?? ""),
        csvEscape(s.created_at),
      ].join(",")
    )
  }

  sections.push("")
  sections.push("# Grades")
  sections.push(
    "id,projectId,title,score,maxScore,weight,type,date,notes,created_at"
  )
  for (const g of data.grades) {
    sections.push(
      [
        csvEscape(g.id),
        csvEscape(g.projectId),
        csvEscape(g.title),
        String(g.score),
        String(g.maxScore),
        String(g.weight),
        csvEscape(g.type),
        csvEscape(g.date ?? ""),
        csvEscape(g.notes ?? ""),
        csvEscape(g.created_at),
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
