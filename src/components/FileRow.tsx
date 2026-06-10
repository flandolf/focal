import { formatFileSize, formatDate } from "@/lib/utils"
import React, { useState, useRef, useCallback, useMemo } from "react"
import type { FileInfo, FileTag } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { FileTypeIcon } from "@/components/FileTypeIcon"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { Pencil, X, Check, Star, Plus, MoreHorizontal, Copy, FolderOpen } from "lucide-react"

const ALL_TAGS: FileTag[] = ["sac", "notes", "past-paper", "exam", "resource", "other"]

const TAG_LABELS: Record<FileTag, string> = {
  "sac": "SAC",
  "notes": "Notes",
  "past-paper": "Past Paper",
  "exam": "Exam",
  "resource": "Resource",
  "other": "Other",
}

const TAG_COLORS: Record<string, string> = {
  "sac": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "notes": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "past-paper": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "exam": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "resource": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "other": "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
}

const FILE_ROW_GRID = "grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_2rem] min-[1000px]:grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_3.5rem_2rem]"

interface FileRowProps {
  file: FileInfo
  onOpen?: (file: FileInfo) => void
  onRename?: (file: FileInfo, newName: string) => void
  onRemoveTag?: (file: FileInfo, tag: FileTag) => void
  onAddTag?: (file: FileInfo, tag: FileTag) => void
  onToggleFavorite?: (file: FileInfo) => void
  onShowInFinder?: (file: FileInfo) => void
  onCopyPath?: (file: FileInfo) => void
  onMoveFile?: (file: FileInfo, destFolder: string) => void
  isSelected?: boolean
  onSelectionChange?: (file: FileInfo, selected: boolean) => void
  subfolders?: string[]
  selectionMode?: boolean
}

function FileRowInner({
  file,
  onOpen,
  onRename,
  onRemoveTag,
  onAddTag,
  onToggleFavorite,
  onShowInFinder,
  onCopyPath,
  onMoveFile,
  isSelected = false,
  onSelectionChange,
  subfolders = [],
  selectionMode = false,
}: FileRowProps) {
  const propFileTags = useMemo(
    () => file.tags ?? (file.tag ? [file.tag] : []),
    [file.tags, file.tag],
  )

  const handleOpenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 2) {
      onOpen?.(file)
    }
  }

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const fileTags = propFileTags
  const isFavorite = file.isFavorite ?? false
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

  const [showTagMenu, setShowTagMenu] = useState(false)
  const [showActions, setShowActions] = useState(false)

  const availableTags = useMemo(
    () => ALL_TAGS.filter((t) => !fileTags.includes(t)),
    [fileTags],
  )

  return (
    <div
      className={cn(
        "group grid min-h-16 cursor-default items-center gap-3 py-2.5 transition-colors hover:bg-accent/30 px-3",
        FILE_ROW_GRID,
        isSelected && "bg-accent/50",
      )}
      onMouseDown={handleOpenClick}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked: boolean | "indeterminate") =>
          onSelectionChange?.(file, checked === true)
        }
        onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        className={cn(
          "w-4 h-4 shrink-0 transition-opacity",
          !isSelected && !selectionMode && "opacity-0 group-hover:opacity-100",
        )}
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
              onClick={(e) => {
                e.stopPropagation()
                confirmRename()
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-accent dark:text-emerald-400"
              aria-label="Confirm rename"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                cancelRename()
              }}
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
                onClick={(e) => {
                  e.stopPropagation()
                  startRename()
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Rename ${file.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <span
            className={cn(
              "flex items-center transition-[gap]",
              isFavorite ? "gap-1.5" : "gap-0 group-hover:gap-1.5 focus-within:gap-1.5",
            )}
          >
            <p className="text-caption text-muted-foreground/60 leading-tight">
              {formatDate(file.modified)}
            </p>
            {onToggleFavorite && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(file)
                }}
                className={cn(
                  "flex h-5 shrink-0 items-center justify-center overflow-hidden rounded transition-[width,opacity,color,background-color]",
                  isFavorite
                    ? "w-5 text-amber-500 hover:text-amber-600"
                    : "w-0 text-muted-foreground/30 opacity-0 group-hover:w-5 group-hover:opacity-100 hover:text-amber-500 focus-visible:w-5 focus-visible:opacity-100",
                )}
                aria-label={isFavorite ? "Unfavorite" : "Favorite"}
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={isFavorite ? "currentColor" : "none"}
                />
              </button>
            )}
          </span>
          {fileTags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className={cn(
                "text-micro px-1.5 py-0.5 font-medium transition-colors",
                TAG_COLORS[tag] || TAG_COLORS.other,
                onRemoveTag && "cursor-pointer hover:ring-1 hover:ring-destructive/30",
              )}
              onClick={
                onRemoveTag
                  ? (e: React.MouseEvent) => {
                      e.stopPropagation()
                      onRemoveTag(file, tag)
                    }
                  : undefined
              }
              title={onRemoveTag ? `Click to remove "${tag}" tag` : undefined}
            >
              {tag}
            </Badge>
          ))}
          {onAddTag && availableTags.length > 0 && (
            <Popover
              open={showTagMenu}
              onOpenChange={(open) => {
                setShowTagMenu(open)
                if (open) setShowActions(false)
              }}
            >
              <PopoverTrigger asChild>
                <button
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    setShowActions(false)
                  }}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label="Add tag"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-32 gap-1 p-1">
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAddTag(file, tag)
                      setShowTagMenu(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                      TAG_COLORS[tag],
                    )}
                  >
                    {TAG_LABELS[tag]}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      <span className="text-caption text-muted-foreground/70 font-mono tabular-nums w-20 text-right">
        {formatFileSize(file.size)}
      </span>
      <span className="hidden text-caption text-muted-foreground/55 font-mono uppercase text-right tabular-nums min-[1000px]:block">
        .{file.extension ?? "?"}
      </span>

      {/* Actions menu (⋮) */}
      <div className="relative flex items-center justify-end">
        {(onShowInFinder ?? onCopyPath ?? onMoveFile) && (
          <Popover
            open={showActions}
            onOpenChange={(open) => {
              setShowActions(open)
              if (open) setShowTagMenu(false)
            }}
          >
            <PopoverTrigger asChild>
              <button
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation()
                  setShowTagMenu(false)
                }}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="File actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 gap-1 p-1">
              {onShowInFinder && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onShowInFinder(file)
                    setShowActions(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Show in Finder
                </button>
              )}
              {onCopyPath && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCopyPath(file)
                    setShowActions(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Path
                </button>
              )}
              {onMoveFile && subfolders.length > 0 && (
                <>
                  <div className="my-1 h-px bg-border" />
                  <div className="px-2 py-1 text-micro text-muted-foreground">
                    Move to...
                  </div>
                  {subfolders.map((folder) => (
                    <button
                      key={folder}
                      onClick={(e) => {
                        e.stopPropagation()
                        onMoveFile(file, folder)
                        setShowActions(false)
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      {folder}
                    </button>
                  ))}
                </>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

export const FileRow = React.memo(FileRowInner)
