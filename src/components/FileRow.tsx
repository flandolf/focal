import { formatFileSize, formatDate } from "@/lib/utils"
import { useState, useRef, useCallback } from "react"
import type { FileInfo } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { FileTypeIcon } from "@/components/FileTypeIcon"

import { Pencil, X, Check } from "lucide-react"

interface FileRowProps {
  file: FileInfo
  onOpen?: (file: FileInfo) => void
  onRename?: (file: FileInfo, newName: string) => void
  isSelected?: boolean
  onSelectionChange?: (file: FileInfo, selected: boolean) => void
}

export function FileRow({ file, onOpen, onRename, isSelected = false, onSelectionChange }: FileRowProps) {
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
        "group grid min-h-16 grid-cols-[1rem_2rem_minmax(0,1fr)_5rem] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent/30 cursor-default min-[1000px]:grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_3.5rem] min-[1200px]:px-8",
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
      <FileTypeIcon extension={file.extension} />
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
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-accent dark:text-emerald-400"
              aria-label="Confirm rename"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); cancelRename() }}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Cancel rename"
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
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Rename ${file.name}`}
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
      <span className="hidden text-caption text-muted-foreground/55 font-mono uppercase text-right tabular-nums min-[1000px]:block">
        .{file.extension || "?"}
      </span>
    </div>
  )
}
