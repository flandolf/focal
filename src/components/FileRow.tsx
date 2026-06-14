import { formatFileSize, formatDate } from "@/lib/utils";
import React, { useState, useRef, useCallback, useMemo } from "react";
import type { FileInfo, FileTag } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { FileTypeIcon } from "@/components/FileTypeIcon";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem as CtxMenuItem,
  ContextMenuSeparator as CtxMenuSep,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import {
  Pencil,
  X,
  Check,
  Star,
  Plus,
  MoreHorizontal,
  Copy,
  FolderOpen,
  ArrowRight,
} from "lucide-react";

const ALL_TAGS: FileTag[] = [
  "sac",
  "notes",
  "past-paper",
  "exam",
  "resource",
  "other",
];

const TAG_LABELS: Record<FileTag, string> = {
  sac: "SAC",
  notes: "Notes",
  "past-paper": "Past Paper",
  exam: "Exam",
  resource: "Resource",
  other: "Other",
};

const TAG_COLORS: Record<string, string> = {
  sac: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  notes:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "past-paper":
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  exam: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  resource:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300",
};

interface FileRowProps {
  file: FileInfo;
  onOpen?: (file: FileInfo) => void;
  onRename?: (file: FileInfo, newName: string) => void;
  onRemoveTag?: (file: FileInfo, tag: FileTag) => void;
  onAddTag?: (file: FileInfo, tag: FileTag) => void;
  onToggleFavorite?: (file: FileInfo) => void;
  onShowInFinder?: (file: FileInfo) => void;
  onCopyPath?: (file: FileInfo) => void;
  onMoveFile?: (file: FileInfo, destFolder: string) => void;
  isSelected?: boolean;
  onSelectionChange?: (file: FileInfo, selected: boolean) => void;
  subfolders?: string[];
  selectionMode?: boolean;
  isFocused?: boolean;
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
  isFocused = false,
}: FileRowProps) {
  const propFileTags = useMemo(
    () => file.tags ?? (file.tag ? [file.tag] : []),
    [file.tags, file.tag],
  );

  const handleOpenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.detail === 2) {
      onOpen?.(file);
    }
  };

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const fileTags = propFileTags;
  const isFavorite = file.isFavorite ?? false;
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(() => {
    setRenameValue(file.name);
    setIsRenaming(true);
    requestAnimationFrame(() => renameInputRef.current?.select());
  }, [file.name]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
    setRenameValue("");
  }, []);

  const confirmRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== file.name) {
      onRename?.(file, trimmed);
    }
    setIsRenaming(false);
  }, [renameValue, file, onRename]);

  const [showTagMenu, setShowTagMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const availableTags = useMemo(
    () => ALL_TAGS.filter((t) => !fileTags.includes(t)),
    [fileTags],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group relative flex cursor-default items-center gap-3 px-3 py-2 transition-colors min-[1200px]:px-6",
            "border-b border-border/40",
            "hover:bg-accent/25",
            isSelected && "bg-accent/40",
            isFocused && !isSelected && "bg-accent/15",
          )}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-focal-file-path", file.path);
            e.dataTransfer.effectAllowed = "move";
          }}
          onMouseDown={handleOpenClick}
        >
          {/* Checkbox */}
          <div className="flex w-6 shrink-0 items-center justify-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked: boolean | "indeterminate") =>
                onSelectionChange?.(file, checked === true)
              }
              onClick={(e: { stopPropagation: () => void }) =>
                e.stopPropagation()
              }
              className={cn(
                "w-4 h-4 shrink-0 transition-opacity",
                !isSelected &&
                  !selectionMode &&
                  "opacity-0 group-hover:opacity-100",
              )}
            />
          </div>

          {/* Icon */}
          <div className="flex w-8 shrink-0 items-center justify-center">
            <FileTypeIcon extension={file.extension} />
          </div>

          {/* Name */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {isRenaming ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={confirmRename}
                  className="text-sm font-medium bg-background border border-primary/50 rounded-md px-2 py-0.5 w-full max-w-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                  autoFocus
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmRename();
                  }}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-accent dark:text-emerald-400"
                  aria-label="Confirm rename"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelRename();
                  }}
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  aria-label="Cancel rename"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium truncate">{file.name}</p>
                {onRename && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename();
                    }}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    aria-label={`Rename ${file.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {onToggleFavorite && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(file);
                    }}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors",
                      isFavorite
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-amber-500 focus-visible:opacity-100",
                    )}
                    aria-label={isFavorite ? "Unfavorite" : "Favorite"}
                  >
                    <Star
                      className="h-3.5 w-3.5"
                      fill={isFavorite ? "currentColor" : "none"}
                    />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Date */}
          <div className="w-28 shrink-0 text-caption text-muted-foreground/60 tabular-nums truncate">
            {formatDate(file.modified)}
          </div>

          {/* Size */}
          <div className="w-20 shrink-0 text-caption text-muted-foreground/60 font-mono tabular-nums truncate">
            {formatFileSize(file.size)}
          </div>

          {/* Type */}
          <div className="w-16 shrink-0 text-caption text-muted-foreground/50 font-mono uppercase truncate">
            .{file.extension ?? "?"}
          </div>

          {/* Tags */}
          <div className="flex w-24 shrink-0 items-center gap-1 overflow-hidden">
            {fileTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className={cn(
                  "text-micro px-1.5 py-0 font-medium transition-colors shrink-0",
                  TAG_COLORS[tag] || TAG_COLORS.other,
                  onRemoveTag &&
                    "cursor-pointer hover:ring-1 hover:ring-destructive/30",
                )}
                onClick={
                  onRemoveTag
                    ? (e: React.MouseEvent) => {
                        e.stopPropagation();
                        onRemoveTag(file, tag);
                      }
                    : undefined
                }
                title={
                  onRemoveTag ? `Click to remove "${tag}" tag` : undefined
                }
              >
                {tag}
              </Badge>
            ))}
            {onAddTag && availableTags.length > 0 && (
              <Popover
                open={showTagMenu}
                onOpenChange={(open) => {
                  setShowTagMenu(open);
                  if (open) setShowActions(false);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowActions(false);
                    }}
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
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
                        e.stopPropagation();
                        onAddTag(file, tag);
                        setShowTagMenu(false);
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

          {/* Actions */}
          <div className="flex w-8 shrink-0 items-center justify-center">
            {(onShowInFinder ?? onCopyPath ?? onMoveFile) && (
              <Popover
                open={showActions}
                onOpenChange={(open) => {
                  setShowActions(open);
                  if (open) setShowTagMenu(false);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowTagMenu(false);
                    }}
                    className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    aria-label="File actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 gap-0 p-1">
                  {onOpen && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(file);
                        setShowActions(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Open
                    </button>
                  )}
                  {onShowInFinder && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowInFinder(file);
                        setShowActions(false);
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
                        e.stopPropagation();
                        onCopyPath(file);
                        setShowActions(false);
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
                        Move to…
                      </div>
                      {subfolders.map((folder) => {
                        const displayName = folder.split("/").pop() ?? folder
                        return (
                          <button
                            key={folder}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveFile(file, folder);
                              setShowActions(false);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                          >
                            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                            {displayName}
                          </button>
                        )
                      })}
                    </>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {onOpen && (
          <CtxMenuItem onSelect={() => onOpen(file)}>
            <FolderOpen className="h-4 w-4" />
            Open
          </CtxMenuItem>
        )}
        {onRename && (
          <CtxMenuItem onSelect={startRename}>
            <Pencil className="h-4 w-4" />
            Rename
          </CtxMenuItem>
        )}
        {onToggleFavorite && (
          <CtxMenuItem onSelect={() => onToggleFavorite(file)}>
            <Star
              className="h-4 w-4"
              fill={isFavorite ? "currentColor" : "none"}
            />
            {isFavorite ? "Unfavorite" : "Favorite"}
          </CtxMenuItem>
        )}
        {(onAddTag ?? (fileTags.length > 0 && onRemoveTag)) && (
          <>
            <CtxMenuSep />
            {onAddTag && availableTags.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Plus className="h-4 w-4" />
                  Add Tag
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-32">
                  {ALL_TAGS.filter((t) => !fileTags.includes(t)).map((tag) => (
                    <CtxMenuItem key={tag} onSelect={() => onAddTag(file, tag)}>
                      {TAG_LABELS[tag]}
                    </CtxMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            {fileTags.length > 0 && onRemoveTag && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <X className="h-4 w-4" />
                  Remove Tag
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-32">
                  {fileTags.map((tag) => (
                    <CtxMenuItem
                      key={tag}
                      onSelect={() => onRemoveTag(file, tag)}
                    >
                      {TAG_LABELS[tag]}
                    </CtxMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
          </>
        )}
        {(onShowInFinder ??
          onCopyPath ??
          (onMoveFile && subfolders.length > 0)) && (
          <>
            <CtxMenuSep />
            {onShowInFinder && (
              <CtxMenuItem onSelect={() => onShowInFinder(file)}>
                <FolderOpen className="h-4 w-4" />
                Show in Finder
              </CtxMenuItem>
            )}
            {onCopyPath && (
              <CtxMenuItem onSelect={() => onCopyPath(file)}>
                <Copy className="h-4 w-4" />
                Copy Path
              </CtxMenuItem>
            )}
            {onMoveFile && subfolders.length > 0 && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <ArrowRight className="h-4 w-4" />
                  Move to…
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-40">
                  {subfolders.map((folder) => {
                    const displayName = folder.split("/").pop() ?? folder
                    return (
                      <CtxMenuItem
                        key={folder}
                        onSelect={() => onMoveFile(file, folder)}
                      >
                        {displayName}
                      </CtxMenuItem>
                    )
                  })}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FileRow = React.memo(FileRowInner);
