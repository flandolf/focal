import { useState } from "react";
import {
  Check,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

interface ProjectChecklistPanelProps {
  project: Project;
  onUpdateNotes: (notes: string) => void;
  onAddChecklistItem: (text: string) => void;
  onToggleChecklistItem: (itemId: string) => void;
  onRemoveChecklistItem: (itemId: string) => void;
}

export function ProjectChecklistPanel({
  project,
  onUpdateNotes,
  onAddChecklistItem,
  onToggleChecklistItem,
  onRemoveChecklistItem,
}: ProjectChecklistPanelProps) {
  const [newItemText, setNewItemText] = useState("");
  const [notesExpanded, setNotesExpanded] = useState(Boolean(project.notes));
  const [checklistExpanded, setChecklistExpanded] = useState(false);

  const handleAddItem = () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    onAddChecklistItem(trimmed);
    setNewItemText("");
  };

  const completedCount =
    project.checklist?.filter((item) => item.completed).length ?? 0;
  const totalCount = project.checklist?.length ?? 0;

  return (
    <div>
      <div className="px-4 pt-2 min-[1200px]:px-5">
        {/* Notes Section */}
        <div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setNotesExpanded((v) => !v)}
            className="w-full justify-start"
          >
            {notesExpanded ? (
              <ChevronDown />
            ) : (
              <ChevronRight />
            )}
            <StickyNote />
            Notes
            {project.notes && !notesExpanded && (
              <span className="text-caption text-muted-foreground/60 truncate max-w-50">
                — {project.notes.slice(0, 60)}
                {project.notes.length > 60 ? "…" : ""}
              </span>
            )}
          </Button>
          {notesExpanded && (
            <div className="mt-1 px-1">
              <Textarea
                placeholder="Add project notes, links, or reminders…"
                value={project.notes ?? ""}
                onChange={(e) => onUpdateNotes(e.target.value)}
                className="min-h-15 resize-none text-xs"
              />
            </div>
          )}
        </div>

        {/* Checklist Section */}
        <div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setChecklistExpanded((v) => !v)}
            className="w-full justify-start"
          >
            {checklistExpanded ? (
              <ChevronDown />
            ) : (
              <ChevronRight />
            )}
            <Check />
            Checklist
            {totalCount > 0 && (
              <span className="text-caption tabular-nums text-muted-foreground/60">
                {completedCount}/{totalCount}
              </span>
            )}
          </Button>
          {checklistExpanded && (
            <div className="mt-1 space-y-0.5 px-1">
              {/* Progress bar */}
              {totalCount > 0 && (
                <div className="mb-1.5 h-0.5 w-full overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full bg-primary/40"
                    style={{ width: `${(completedCount / totalCount) * 100}%` }}
                  />
                </div>
              )}

              {/* Checklist items */}
              {project.checklist?.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={item.completed}
                    onClick={() => onToggleChecklistItem(item.id)}
                    aria-label={`${item.completed ? "Mark incomplete" : "Mark complete"}: ${item.text}`}
                    className="size-3.5"
                  />
                  <span
                    className={cn(
                      "flex-1 text-xs leading-4",
                      item.completed && "line-through text-muted-foreground/60",
                    )}
                  >
                    {item.text}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemoveChecklistItem(item.id)}
                    aria-label={`Remove checklist item: ${item.text}`}
                    className="shrink-0 text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}

              {/* Add new item */}
              <div className="flex items-center gap-1.5 px-1 pt-0.5">
                <Input
                  placeholder="Add a task…"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddItem();
                    }
                  }}
                  className="h-6 text-xs"
                />
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={handleAddItem}
                  disabled={!newItemText.trim()}
                  aria-label="Add checklist item"
                  className="shrink-0"
                >
                  <Plus />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
