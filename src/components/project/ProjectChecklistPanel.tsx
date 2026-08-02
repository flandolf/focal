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
import { buildVcePrepSummary, getMissingVcePrepSteps } from "@/lib/vcePrep";
import type { Project, StudySession } from "@/lib/types";

interface ProjectChecklistPanelProps {
  project: Project;
  sessions: StudySession[];
  onUpdateNotes: (notes: string) => void;
  onAddChecklistItem: (text: string) => void;
  onAddChecklistItems: (texts: string[]) => void | Promise<void>;
  onToggleChecklistItem: (itemId: string) => void;
  onRemoveChecklistItem: (itemId: string) => void;
}

export function ProjectChecklistPanel({
  project,
  sessions,
  onUpdateNotes,
  onAddChecklistItem,
  onAddChecklistItems,
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
  const vceSummary = buildVcePrepSummary(project, sessions);
  const missingPrepSteps = getMissingVcePrepSteps(project);
  const dueLabel = vceSummary.daysUntilDeadline === null
    ? "No due date"
    : vceSummary.daysUntilDeadline < 0
      ? `${Math.abs(vceSummary.daysUntilDeadline)}d overdue`
      : vceSummary.daysUntilDeadline === 0
        ? "Due today"
        : `Due in ${vceSummary.daysUntilDeadline}d`;

  const handleAddPrepSteps = () => {
    if (missingPrepSteps.length === 0) return;
    void onAddChecklistItems(missingPrepSteps);
  };

  return (
    <div>
      <div className="px-4 pt-2 min-[1200px]:px-5">
        {project.deadlineType && (
          <div className="mb-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold">VCE prep</span>
              <span className="text-muted-foreground">{dueLabel}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <span><strong className="text-foreground">{vceSummary.completedChecklistCount}/{vceSummary.totalChecklistCount}</strong> steps</span>
              <span><strong className="text-foreground">{Math.round(vceSummary.completedStudyMinutes / 6) / 10}h</strong> studied</span>
              <span><strong className="text-foreground">{vceSummary.latestConfidence ? `${vceSummary.latestConfidence}/5` : "—"}</strong> confidence</span>
            </div>
            {missingPrepSteps.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="mt-2"
                onClick={handleAddPrepSteps}
              >
                Add {missingPrepSteps.length} VCE prep step{missingPrepSteps.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
        )}

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
