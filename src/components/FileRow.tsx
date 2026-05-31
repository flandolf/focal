import { formatFileSize, formatDate } from "@/lib/utils"
import { useState, useRef, useCallback } from "react"
import type { FileInfo } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

import { Pencil, X, Check } from "lucide-react"
const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  jpg: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  jpeg: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  png: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  gif: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  svg: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  webp: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  ico: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  bmp: { label: "img", color: "text-blue-600 dark:text-blue-400" },
  pdf: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  doc: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  docx: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  pptx: { label: "ppt", color: "text-red-600 dark:text-red-400" },
  txt: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  md: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  rtf: { label: "doc", color: "text-amber-600 dark:text-amber-400" },
  js: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  ts: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  jsx: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  tsx: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  py: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  rs: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  go: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  java: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  css: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  html: { label: "cd", color: "text-emerald-600 dark:text-emerald-400" },
  zip: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  tar: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  gz: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  rar: { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  "7z": { label: "arc", color: "text-orange-600 dark:text-orange-400" },
  mp4: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  avi: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  mov: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  mkv: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  webm: { label: "vid", color: "text-violet-600 dark:text-violet-400" },
  mp3: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  wav: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  flac: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  aac: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
  ogg: { label: "aud", color: "text-pink-600 dark:text-pink-400" },
}

function getFileTypeLabel(extension: string): { label: string; color: string } {
  const ext = extension.toLowerCase()
  return TYPE_LABELS[ext] || { label: "fl", color: "text-muted-foreground" }
}

interface FileRowProps {
  file: FileInfo
  onOpen?: (file: FileInfo) => void
  onRename?: (file: FileInfo, newName: string) => void
  isSelected?: boolean
  onSelectionChange?: (file: FileInfo, selected: boolean) => void
}

export function FileRow({ file, onOpen, onRename, isSelected = false, onSelectionChange }: FileRowProps) {
  const { label, color } = getFileTypeLabel(file.extension)
  // Support both new tags array and legacy tag field
  const fileTags = file.tags ?? (file.tag ? [file.tag] : [])
  const TAG_COLORS: Record<string, string> = {
    "sac": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "notes": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    "past-paper": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    "exam": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    "resource": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    "other": "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
  }

  const handleOpenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 2) {
      onOpen?.(file)
    }
  }

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = useCallback(() => {
    setRenameValue(file.name)
    setIsRenaming(true)
    requestAnimationFrame(() => renameInputRef.current?.select())
  }, [file.name])

  const cancelRename = useCallback(() => {
    setIsRenaming(false)
    setRenameValue("")
  }, [])

  const confirmRename = useCallback(() => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== file.name) {
      onRename?.(file, trimmed)
    }
    setIsRenaming(false)
  }, [renameValue, file, onRename])

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-8 py-3 hover:bg-accent/30 transition-colors group cursor-default",
        isSelected && "bg-accent/50"
      )}
      onMouseDown={handleOpenClick}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked: boolean | "indeterminate") => onSelectionChange?.(file, checked === true)}
        onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        className="w-4 h-4 shrink-0"
      />
      <span className={`text-caption font-semibold tracking-wide w-4 text-center leading-none shrink-0 ${color}`}>
        {label}
      </span>
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <div className="flex items-center gap-1">
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename()
                if (e.key === "Escape") cancelRename()
              }}
              onBlur={confirmRename}
              className="text-sm font-medium bg-background border border-primary/50 rounded px-1.5 py-0.5 w-full outline-none focus:border-primary"
              autoFocus
            />
            <button
              onClick={(e) => { e.stopPropagation(); confirmRename() }}
              className="shrink-0 p-0.5 rounded hover:bg-accent text-emerald-600 dark:text-emerald-400"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); cancelRename() }}
              className="shrink-0 p-0.5 rounded hover:bg-accent text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{file.name}</p>
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); startRename() }}
                className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground transition-opacity"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <p className="text-caption text-muted-foreground/60 leading-tight">
            {formatDate(file.modified)}
          </p>
          {fileTags.length > 0 && (
            <div className="flex gap-1">
              {fileTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className={cn("text-micro px-1.5 py-0.5 font-medium", TAG_COLORS[tag] || TAG_COLORS.other)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <span className="text-caption text-muted-foreground/70 font-mono tabular-nums w-20 text-right">
        {formatFileSize(file.size)}
      </span>
      <span className="text-caption text-muted-foreground/50 font-mono uppercase w-12 text-right tabular-nums">
        .{file.extension || "?"}
      </span>
    </div>
  )
}
