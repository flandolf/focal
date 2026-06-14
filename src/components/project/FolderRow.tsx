import { useState, type DragEvent } from "react"
import { Folder, ChevronRight, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem as CtxMenuItem,
  ContextMenuSeparator as CtxMenuSep,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { POPOVER_ITEM_BUTTON_CLASS } from "./shared"
import type { FileTag } from "@/lib/types"

const ALL_TAGS: FileTag[] = ["sac", "notes", "past-paper", "exam", "resource", "other"]

const TAG_LABELS: Record<FileTag, string> = {
  "sac": "SAC",
  "notes": "Notes",
  "past-paper": "Past Paper",
  "exam": "Exam",
  "resource": "Resource",
  "other": "Other",
}

interface FolderRowProps {
  name: string
  fileCount: number
  totalFileCount: number
  onClick: () => void
  onTagAll?: (tag: FileTag) => void
  isFocused?: boolean
  onFileDrop?: (filePath: string) => void
}

export function FolderRow({ name, fileCount, totalFileCount, onClick, onTagAll, isFocused, onFileDrop }: FolderRowProps) {
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Only unset if leaving the row entirely, not entering a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const filePath = e.dataTransfer.getData("application/x-focal-file-path")
    if (filePath && onFileDrop) {
      onFileDrop(filePath)
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label={`Open ${name} folder`}
          className={cn(
            "group flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors min-[1200px]:px-6",
            "border-b border-border/40",
            "bg-amber-500/[0.03] hover:bg-amber-500/[0.06]",
            "dark:bg-amber-400/[0.04] dark:hover:bg-amber-400/[0.08]",
            isFocused && "bg-amber-500/[0.08] dark:bg-amber-400/[0.1]",
            isDragOver && "bg-amber-500/[0.2] ring-2 ring-amber-500/40 dark:bg-amber-400/[0.2] dark:ring-amber-400/40",
          )}
        >
          {/* Checkbox placeholder — keeps alignment with FileRow */}
          <div className="w-6 shrink-0" />

          {/* Folder icon */}
          <div className="flex w-8 shrink-0 items-center justify-center">
            <span
              className="flex size-8 items-center justify-center rounded-lg ring-1 bg-amber-500/10 ring-amber-500/15 transition-colors group-hover:ring-amber-500/25"
              aria-label="Folder"
            >
              <Folder className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </span>
          </div>

          {/* Name + file count */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <p className="text-sm font-medium truncate">{name}</p>
            <span className="text-caption text-muted-foreground/60 tabular-nums">
              {fileCount > 0 ? (
                <>{fileCount} file{fileCount !== 1 ? "s" : ""}</>
              ) : (
                <>{totalFileCount} file{totalFileCount !== 1 ? "s" : ""}</>
              )}
              {totalFileCount > fileCount && (
                <span className="text-muted-foreground/40">
                  {" "}({totalFileCount} total)
                </span>
              )}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
          </div>

          {/* Date placeholder */}
          <div className="w-28 shrink-0" />

          {/* Size placeholder */}
          <div className="w-20 shrink-0" />

          {/* Type placeholder */}
          <div className="w-16 shrink-0" />

          {/* Tags placeholder */}
          <div className="w-24 shrink-0" />

          {/* Tag all button */}
          <div className="flex w-8 shrink-0 items-center justify-center">
            {onTagAll && (
              <Popover
                open={showTagMenu}
                onOpenChange={setShowTagMenu}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    aria-label={`Tag all files in ${name}`}
                    title={`Tag all files in ${name}`}
                  >
                    <Tag className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-36 gap-1 p-1">
                  {ALL_TAGS.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={(e) => {
                        e.stopPropagation()
                        onTagAll(tag)
                        setShowTagMenu(false)
                      }}
                      className={cn(POPOVER_ITEM_BUTTON_CLASS, "capitalize")}
                    >
                      {TAG_LABELS[tag]}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <CtxMenuItem onSelect={onClick}>
          <Folder className="h-4 w-4" />
          Open folder
        </CtxMenuItem>
        {onTagAll && (
          <>
            <CtxMenuSep />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Tag className="h-4 w-4" />
                Tag all files
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-32">
                {ALL_TAGS.map((tag) => (
                  <CtxMenuItem
                    key={tag}
                    onSelect={() => onTagAll(tag)}
                  >
                    {TAG_LABELS[tag]}
                  </CtxMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
