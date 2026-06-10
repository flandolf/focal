import { useState } from "react"
import { ArrowLeft, Palette as PaletteIcon, EyeOff, Cloud, Brain, Cog, FolderDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import type { ThemeId } from "@/lib/themes"
import type { Project, Subject } from "@/lib/types"
import { AppearanceSection } from "@/components/settings/AppearanceSection"
import { SubjectsSection } from "@/components/settings/SubjectsSection"
import { AIModelSection } from "@/components/settings/AIModelSection"
import { NotionSection } from "@/components/settings/NotionSection"
import { AutoRenameSection } from "@/components/settings/AutoRenameSection"
import { DataSection } from "@/components/settings/DataSection"

type SettingsSection = "appearance" | "subjects" | "notion" | "ai" | "auto-rename" | "data"

interface SettingsViewProps {
  onBack: () => void
  theme: ThemeId
  mode: "light" | "dark" | "system"
  resolvedDark: boolean
  setTheme: (theme: ThemeId) => void
  setMode: (mode: "light" | "dark" | "system") => void
  subjects: Subject[]
  hiddenSubjectIds: string[]
  onToggleSubjectVisibility: (subjectId: string) => void
  onShowAllSubjects: () => void
  onOpenExport?: () => void
  onOpenSubjects?: () => void
  onSyncNotionCalendar?: (onProgress: (msg: string) => void) => Promise<{ created: unknown[]; updated: unknown[]; createdSessions?: unknown[]; updatedSessions?: unknown[]; skipped: number; skippedReasons?: string[]; pushedCreated?: number; pushedUpdated?: number; deleted?: number; pushErrors?: string[] } | null>
  lastSyncTime?: number
  projects?: Project[]
  onFilesChanged?: () => void
}

const SECTION_ITEMS: { id: SettingsSection; label: string; icon: typeof PaletteIcon }[] = [
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "subjects", label: "Subjects", icon: EyeOff },
  { id: "notion", label: "Notion Sync", icon: Cloud },
  { id: "ai", label: "AI Model", icon: Brain },
  { id: "auto-rename", label: "Auto Rename", icon: Cog },
  { id: "data", label: "Data", icon: FolderDown },
]

export function SettingsView({
  onBack,
  theme,
  mode,
  setTheme,
  setMode,
  subjects,
  hiddenSubjectIds,
  onToggleSubjectVisibility,
  onShowAllSubjects,
  onOpenExport,
  onOpenSubjects,
  onSyncNotionCalendar,
  lastSyncTime,
  projects,
  onFilesChanged,
}: SettingsViewProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance")

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3 min-[1200px]:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-heading text-lg font-semibold">Settings</h1>
          <p className="text-caption text-muted-foreground">Local preferences and integrations.</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-48 shrink-0 flex-col border-r border-border/70 py-3 min-[1200px]:w-52">
          <div className="flex-1 space-y-0.5 px-2">
            {SECTION_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors outline-none",
                    "focus-visible:ring-3 focus-visible:ring-ring/50",
                    activeSection === item.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </div>
          <div className="px-4 pb-1 pt-2">
            <p className="text-caption text-muted-foreground/40 select-none">{__APP_VERSION__}</p>
          </div>
        </nav>

        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto max-w-2xl px-6 py-6">
            {activeSection === "appearance" && (
              <AppearanceSection
                theme={theme}
                mode={mode}
                setTheme={setTheme}
                setMode={setMode}
              />
            )}

            {activeSection === "subjects" && (
              <SubjectsSection
                subjects={subjects}
                hiddenSubjectIds={hiddenSubjectIds}
                onToggleSubjectVisibility={onToggleSubjectVisibility}
                onShowAllSubjects={onShowAllSubjects}
              />
            )}

            {activeSection === "ai" && (
              <AIModelSection />
            )}

            {activeSection === "notion" && (
              <NotionSection
                onSyncNotionCalendar={onSyncNotionCalendar}
                lastSyncTime={lastSyncTime}
              />
            )}

            {activeSection === "auto-rename" && (
              <AutoRenameSection
                projects={projects ?? []}
                onFilesChanged={onFilesChanged}
              />
            )}

            {activeSection === "data" && (
              <DataSection
                onOpenExport={onOpenExport}
                onOpenSubjects={onOpenSubjects}
              />
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
