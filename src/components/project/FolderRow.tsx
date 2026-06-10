import { Folder, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const FILE_ROW_GRID = "grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_2rem] min-[1000px]:grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_3.5rem_2rem]"

interface FolderRowProps {
  name: string
  fileCount: number
  onClick: () => void
}

export function FolderRow({ name, fileCount, onClick }: FolderRowProps) {
  return (
    <button
      type="button"
      aria-label={`Open ${name} folder`}
      className={cn(
        "group grid min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
        FILE_ROW_GRID,
      )}
      onClick={onClick}
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
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <span aria-hidden="true" className="hidden min-[1000px]:block" />
      <span aria-hidden="true" />
    </button>
  )
}
