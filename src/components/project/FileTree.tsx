import { useRef, useCallback } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FolderOpen, Plus, Search, X, Trash2, ArrowUp, ArrowDown, Tag, MoveRight, Loader2, LayoutList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FileRow } from "@/components/FileRow"
import { FolderRow } from "./FolderRow"
import { Breadcrumb } from "./Breadcrumb"
import type { FileInfo, FileTag } from "@/lib/types"
import type { SortKey } from "@/hooks/useProjectFiles"
import { cn } from "@/lib/utils"
import { getSegmentedButtonClassName, POPOVER_ITEM_BUTTON_CLASS } from "./shared"

export type ListItem =
  | { type: "file"; data: FileInfo }
  | { type: "folder"; name: string; path: string; fileCount: number }

const FILE_TABLE_GRID = "grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_2rem] min-[1000px]:grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_3.5rem_2rem]"

interface FileTreeProps {
  files: FileInfo[]
  loading: boolean
  listItems: ListItem[]
  selectedFiles: Set<string>
  searchQuery: string
  setSearchQuery: (q: string) => void
  selectedTags: FileTag[]
  setSelectedTags: (tags: FileTag[]) => void
  selectedSubfolder: string | null
  setSelectedSubfolder: (folder: string | null) => void
  sortKey: SortKey
  sortAsc: boolean
  setSortKey: (key: SortKey) => void
  setSortAsc: (asc: boolean) => void
  allSubfolders: string[]
  showBulkTagMenu: boolean
  setShowBulkTagMenu: (open: boolean) => void
  showBulkMoveMenu: boolean
  setShowBulkMoveMenu: (open: boolean) => void
  onAddFiles: () => void
  onOpenFile: (file: { path: string }) => void
  onRenameFile: (file: FileInfo, newName: string) => void
  onRemoveTag: (file: FileInfo, tag: FileTag) => void
  onAddTag: (file: FileInfo, tag: FileTag) => void
  onToggleFavorite: (file: FileInfo) => void
  onShowInFinder: (file: FileInfo) => void
  onCopyPath: (file: FileInfo) => void
  onMoveFile: (file: FileInfo, destSubfolder: string) => void
  onBulkTag: (tag: FileTag) => void
  onBulkMove: (destSubfolder: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onDeleteSelected: () => void
  onFileSelectionChange: (file: FileInfo, selected: boolean) => void
  onFolderTagAll?: (folderPath: string, tag: FileTag) => void
  /** Breadcrumb navigation */
  breadcrumbSegments: { label: string; path: string }[]
  onBreadcrumbNavigate: (path: string) => void
  onGoBack: () => void
  canGoBack: boolean
}

export function FileTree({
  files,
  loading,
  listItems,
  selectedFiles,
  searchQuery,
  setSearchQuery,
  selectedTags,
  setSelectedTags,
  selectedSubfolder,
  setSelectedSubfolder,
  sortKey,
  sortAsc,
  setSortKey,
  setSortAsc,
  allSubfolders,
  showBulkTagMenu,
  setShowBulkTagMenu,
  showBulkMoveMenu,
  setShowBulkMoveMenu,
  onAddFiles,
  onOpenFile,
  onRenameFile,
  onRemoveTag,
  onAddTag,
  onToggleFavorite,
  onShowInFinder,
  onCopyPath,
  onMoveFile,
  onBulkTag,
  onBulkMove,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
  onFileSelectionChange,
  onFolderTagAll,
  breadcrumbSegments,
  onBreadcrumbNavigate,
  onGoBack,
  canGoBack,
}: FileTreeProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-5 text-center min-[1200px]:px-8">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background/35">
          <FolderOpen className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No files yet</p>
        <p className="text-xs text-muted-foreground mb-5 max-w-56 leading-relaxed">
          Drag and drop files here, or select them from your computer.
        </p>
        <Button variant="secondary" size="sm" onClick={onAddFiles} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Files
        </Button>
      </div>
    )
  }

  return (
    <>
      {/* Navigation bar: breadcrumb + view toggle + sort */}
      <div className="border-t border-border/30 px-5 py-2 min-[1200px]:px-8">
        <div className="flex items-center gap-3">
          {/* Breadcrumb + back */}
          <Breadcrumb
            segments={breadcrumbSegments}
            onNavigate={onBreadcrumbNavigate}
            onBack={onGoBack}
            canGoBack={canGoBack}
          />

          <div className="flex-1" />

          {/* View toggle: Folders vs All */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setSelectedSubfolder("__root__")}
              aria-pressed={selectedSubfolder !== null}
              className={getSegmentedButtonClassName(selectedSubfolder !== null)}
              title="Folder view"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedSubfolder(null)}
              aria-pressed={selectedSubfolder === null}
              className={getSegmentedButtonClassName(selectedSubfolder === null)}
              title="All files"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              className={getSegmentedButtonClassName(false, "flex items-center gap-1 px-2")}
              title={`Sort ${sortAsc ? "descending" : "ascending"}`}
              aria-label={`Sort ${sortAsc ? "descending" : "ascending"}`}
            >
              {sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            </button>
            {(["name", "modified", "size", "extension"] as SortKey[]).map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => {
                  if (sortKey === key) setSortAsc(!sortAsc)
                  else setSortKey(key)
                }}
                aria-pressed={sortKey === key}
                className={getSegmentedButtonClassName(sortKey === key, "px-2")}
              >
                {{ name: "Name", modified: "Date", size: "Size", extension: "Type" }[key]}
              </button>
            ))}
          </div>
        </div>

        {/* Search and tag filters */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 rounded-lg bg-background/45 pl-8 text-xs"
            />
          </div>
          {searchQuery && (
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")} className="h-7 w-7 rounded-lg p-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className="mx-0.5 h-4 w-px bg-border/40" />
          {(["sac", "notes", "past-paper", "exam", "resource"] as FileTag[]).map((tag) => (
            <button
              type="button"
              key={tag}
              onClick={() => setSelectedTags(
                selectedTags.includes(tag)
                  ? selectedTags.filter(t => t !== tag)
                  : [...selectedTags, tag]
              )}
              aria-pressed={selectedTags.includes(tag)}
              className={getSegmentedButtonClassName(
                selectedTags.includes(tag),
                "px-2 py-0.5 text-caption capitalize",
              )}
            >
              {tag}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="rounded-md px-1.5 py-0.5 text-caption text-muted-foreground transition-colors outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className={cn(
        "grid items-center gap-3 border-b border-border/50 bg-muted/25 px-5 py-2.5 text-xs uppercase text-muted-foreground/70 min-[1200px]:px-8",
        FILE_TABLE_GRID,
      )}>
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span>Name</span>
        <span className="text-right">Size</span>
        <span className="hidden text-right min-[1000px]:block">Type</span>
        <span className="sr-only">Actions</span>
      </div>

      {/* Selection bar */}
      {selectedFiles.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-accent/20 px-5 py-2.5 min-[1200px]:gap-3 min-[1200px]:px-8">
          <span className="text-xs font-medium">{selectedFiles.size} selected</span>
          <Button variant="ghost" size="sm" onClick={onSelectAll} className="h-7 px-2 text-xs">
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection} className="h-7 px-2 text-xs">
            Clear
          </Button>

          {/* Bulk tag */}
          <Popover
            open={showBulkTagMenu}
            onOpenChange={(open) => {
              setShowBulkTagMenu(open)
              if (open) setShowBulkMoveMenu(false)
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
              >
                <Tag className="h-3 w-3" />
                Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-36 gap-1 p-1">
              {(["sac", "notes", "past-paper", "exam", "resource", "other"] as FileTag[]).map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => { void onBulkTag(tag); setShowBulkTagMenu(false) }}
                  className={cn(POPOVER_ITEM_BUTTON_CLASS, "capitalize")}
                >
                  {tag}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Bulk move */}
          <Popover
            open={showBulkMoveMenu}
            onOpenChange={(open) => {
              setShowBulkMoveMenu(open)
              if (open) setShowBulkTagMenu(false)
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
              >
                <MoveRight className="h-3 w-3" />
                Move
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-40 gap-1 p-1">
              {allSubfolders.map((folder) => (
                <button
                  type="button"
                  key={folder}
                  onClick={() => { void onBulkMove(folder); setShowBulkMoveMenu(false) }}
                  className={POPOVER_ITEM_BUTTON_CLASS}
                >
                  {folder}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeleteSelected}
            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {/* File list — virtualized */}
      <VirtualFileList
        listItems={listItems}
        selectedFiles={selectedFiles}
        onOpenFile={onOpenFile}
        onRenameFile={onRenameFile}
        onRemoveTag={onRemoveTag}
        onAddTag={onAddTag}
        onToggleFavorite={onToggleFavorite}
        onShowInFinder={onShowInFinder}
        onCopyPath={onCopyPath}
        onMoveFile={onMoveFile}
        onFileSelectionChange={onFileSelectionChange}
        allSubfolders={allSubfolders}
        onFolderClick={setSelectedSubfolder}
        onFolderTagAll={onFolderTagAll}
      />

    </>
  )
}

const ESTIMATED_ROW_HEIGHT = 64

interface VirtualFileListProps {
  listItems: ListItem[]
  selectedFiles: Set<string>
  onOpenFile: (file: { path: string }) => void
  onRenameFile: (file: FileInfo, newName: string) => void
  onRemoveTag: (file: FileInfo, tag: FileTag) => void
  onAddTag: (file: FileInfo, tag: FileTag) => void
  onToggleFavorite: (file: FileInfo) => void
  onShowInFinder: (file: FileInfo) => void
  onCopyPath: (file: FileInfo) => void
  onMoveFile: (file: FileInfo, destSubfolder: string) => void
  onFileSelectionChange: (file: FileInfo, selected: boolean) => void
  onFolderTagAll?: (folderPath: string, tag: FileTag) => void
  allSubfolders: string[]
  onFolderClick: (folder: string) => void
}

function VirtualFileList({
  listItems,
  selectedFiles,
  onOpenFile,
  onRenameFile,
  onRemoveTag,
  onAddTag,
  onToggleFavorite,
  onShowInFinder,
  onCopyPath,
  onMoveFile,
  onFileSelectionChange,
  onFolderTagAll,
  allSubfolders,
  onFolderClick,
}: VirtualFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
  })

  const handleOpenFile = useCallback((file: FileInfo) => {
    onOpenFile(file)
  }, [onOpenFile])

  const handleRenameFile = useCallback((file: FileInfo, newName: string) => {
    onRenameFile(file, newName)
  }, [onRenameFile])

  const handleRemoveTag = useCallback((file: FileInfo, tag: FileTag) => {
    onRemoveTag(file, tag)
  }, [onRemoveTag])

  const handleAddTag = useCallback((file: FileInfo, tag: FileTag) => {
    onAddTag(file, tag)
  }, [onAddTag])

  const handleToggleFavorite = useCallback((file: FileInfo) => {
    onToggleFavorite(file)
  }, [onToggleFavorite])

  const handleShowInFinder = useCallback((file: FileInfo) => {
    onShowInFinder(file)
  }, [onShowInFinder])

  const handleCopyPath = useCallback((file: FileInfo) => {
    onCopyPath(file)
  }, [onCopyPath])

  const handleMoveFile = useCallback((file: FileInfo, destSubfolder: string) => {
    onMoveFile(file, destSubfolder)
  }, [onMoveFile])

  const handleSelectionChange = useCallback((file: FileInfo, selected: boolean) => {
    onFileSelectionChange(file, selected)
  }, [onFileSelectionChange])

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${items[0]?.start ?? 0}px)`,
          }}
        >
          {items.map((virtualItem) => {
            const item = listItems[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="border-b border-border/60"
              >
                {item.type === "folder" ? (                    <FolderRow
                      name={item.name}
                      fileCount={item.fileCount}
                      onClick={() => onFolderClick(item.path)}
                      onTagAll={onFolderTagAll ? (tag) => onFolderTagAll(item.path, tag) : undefined}
                    />
                ) : (
                  <FileRow
                    file={item.data}
                    onOpen={handleOpenFile}
                    onRename={handleRenameFile}
                    onRemoveTag={handleRemoveTag}
                    onAddTag={handleAddTag}
                    onToggleFavorite={handleToggleFavorite}
                    onShowInFinder={handleShowInFinder}
                    onCopyPath={handleCopyPath}
                    onMoveFile={handleMoveFile}
                    isSelected={selectedFiles.has(item.data.path)}
                    onSelectionChange={handleSelectionChange}
                    subfolders={allSubfolders}
                    selectionMode={selectedFiles.size > 0}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
