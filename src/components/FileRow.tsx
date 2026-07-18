import { formatFileSize, formatDate } from "@/lib/utils";
import { memo, useState, useRef, useCallback, useMemo } from "react";
import type { FileInfo, FileTag } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
    if (e.target instanceof HTMLElement && e.target.closest("button,input")) return;
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
                <Input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                  onBlur={confirmRename}
                  className="h-7 max-w-sm"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    confirmRename();
                  }}
                  className="shrink-0 text-success"
                  aria-label="Confirm rename"
                >
                  <Check />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelRename();
                  }}
                  className="shrink-0"
                  aria-label="Cancel rename"
                >
                  <X />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium truncate">{file.name}</p>
                {onRename && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename();
                    }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Rename ${file.name}`}
                  >
                    <Pencil />
                  </Button>
                )}
                {onToggleFavorite && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(file);
                    }}
                    className={cn(
                      "shrink-0",
                      isFavorite
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-amber-500 focus-visible:opacity-100",
                    )}
                    aria-label={isFavorite ? "Unfavorite" : "Favorite"}
                  >
                    <Star
                      fill={isFavorite ? "currentColor" : "none"}
                    />
                  </Button>
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
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowActions(false);
                    }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label="Add tag"
                  >
                    <Plus />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-32 gap-1 p-1">
                  {availableTags.map((tag) => (
                    <Button
                      variant="ghost"
                      size="xs"
                      key={tag}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddTag(file, tag);
                        setShowTagMenu(false);
                      }}
                      className={cn(
                        "w-full justify-start",
                        TAG_COLORS[tag],
                      )}
                    >
                      {TAG_LABELS[tag]}
                    </Button>
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setShowTagMenu(false);
                    }}
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label="File actions"
                  >
                    <MoreHorizontal />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 gap-0 p-1">
                  {onOpen && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(file);
                        setShowActions(false);
                      }}
                      className="w-full justify-start"
                    >
                      <FolderOpen />
                      Open
                    </Button>
                  )}
                  {onShowInFinder && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowInFinder(file);
                        setShowActions(false);
                      }}
                      className="w-full justify-start"
                    >
                      <FolderOpen />
                      Show in Finder
                    </Button>
                  )}
                  {onCopyPath && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyPath(file);
                        setShowActions(false);
                      }}
                      className="w-full justify-start"
                    >
                      <Copy />
                      Copy Path
                    </Button>
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
                          <Button
                            variant="ghost"
                            size="xs"
                            key={folder}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveFile(file, folder);
                              setShowActions(false);
                            }}
                            className="w-full justify-start"
                          >
                            <ArrowRight />
                            {displayName}
                          </Button>
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

export const FileRow = memo(FileRowInner);
