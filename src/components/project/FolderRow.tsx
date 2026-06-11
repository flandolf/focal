import { useState } from "react"
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

const FILE_ROW_GRID = "grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_2rem] min-[1000px]:grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_3.5rem_2rem]"

interface FolderRowProps {
  name: string
  fileCount: number
  onClick: () => void
  onTagAll?: (tag: FileTag) => void
}

export function FolderRow({ name, fileCount, onClick, onTagAll }: FolderRowProps) {
  const [showTagMenu, setShowTagMenu] = useState(false)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick() }}
      aria-label={`Open ${name} folder`}
      className={cn(
        "group grid min-h-16 w-full cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35",
        FILE_ROW_GRID,
      )}
    >
      <span aria-hidden="true" className="w-4" />
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 bg-amber-500/10 ring-amber-500/15"
        aria-label="Folder"
      >
        <Folder className="size-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <p className="text-sm font-medium truncate">{name}</p>
        <span className="text-caption text-muted-foreground/60 tabular-nums">
          {fileCount} file{fileCount !== 1 ? "s" : ""}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
      </div>
      <span aria-hidden="true" className="hidden min-[1000px]:block" />

      {/* Tag all files in folder — appears on hover */}
      <div className="flex items-center justify-end">
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
