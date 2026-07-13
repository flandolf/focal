import { useState, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { staggerContainer, staggerItem } from "@/lib/motion";
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
  const reduceMotion = useReducedMotion() === true;
  const panelVariants = useMemo(() => staggerContainer(0.05, 0.03), []);

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
    <motion.div variants={panelVariants} initial="initial" animate="animate">
      <div className="px-4 pt-2 min-[1200px]:px-5">
        {/* Notes Section */}
        <motion.div variants={staggerItem}>
          <button
            type="button"
            onClick={() => setNotesExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {notesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <StickyNote className="h-3 w-3" />
            Notes
            {project.notes && !notesExpanded && (
              <span className="text-caption text-muted-foreground/60 truncate max-w-50">
                — {project.notes.slice(0, 60)}
                {project.notes.length > 60 ? "…" : ""}
              </span>
            )}
          </button>
          {notesExpanded && (
            <div className="mt-1 px-1">
              <textarea
                placeholder="Add project notes, links, or reminders…"
                value={project.notes ?? ""}
                onChange={(e) => onUpdateNotes(e.target.value)}
                className="flex min-h-15 w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
          )}
        </motion.div>

        {/* Checklist Section */}
        <motion.div variants={staggerItem}>
          <button
            type="button"
            onClick={() => setChecklistExpanded((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {checklistExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <Check className="h-3 w-3" />
            Checklist
            {totalCount > 0 && (
              <span className="text-caption tabular-nums text-muted-foreground/60">
                {completedCount}/{totalCount}
              </span>
            )}
          </button>
          {checklistExpanded && (
            <div className="mt-1 space-y-0.5 px-1">
              {/* Progress bar */}
              {totalCount > 0 && (
                <div className="mb-1.5 h-0.5 w-full overflow-hidden rounded-full bg-muted/50">
                  <motion.div
                    className="h-full rounded-full bg-primary/40"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
                    }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.3, ease: "easeOut" }
                    }
                  />
                </div>
              )}

              {/* Checklist items */}
              {project.checklist?.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={reduceMotion ? undefined : { opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-1.5 rounded-md px-1 py-0.5 group hover:bg-muted/40 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onToggleChecklistItem(item.id)}
                    aria-label={`${item.completed ? "Mark incomplete" : "Mark complete"}: ${item.text}`}
                    aria-pressed={item.completed}
                    className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                      item.completed
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-muted-foreground/30 hover:border-muted-foreground/50",
                    )}
                  >
                    {item.completed && <Check className="h-2.5 w-2.5" />}
                  </button>
                  <span
                    className={cn(
                      "flex-1 text-xs leading-4",
                      item.completed && "line-through text-muted-foreground/60",
                    )}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveChecklistItem(item.id)}
                    aria-label={`Remove checklist item: ${item.text}`}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-all hover:text-destructive hover:bg-destructive/10 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </motion.div>
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
                  size="icon"
                  variant="ghost"
                  onClick={handleAddItem}
                  disabled={!newItemText.trim()}
                  aria-label="Add checklist item"
                  className="h-6 w-6 shrink-0 rounded-md"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
