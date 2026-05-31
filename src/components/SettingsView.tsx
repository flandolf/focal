import { useState, useEffect, useRef, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { ArrowLeft, Loader2, ExternalLink, Search, FolderInput } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { getApiKey, setApiKey, getModel, setModel, getAutoRenameUseFileContent, setAutoRenameUseFileContent } from "@/lib/settings"
import type { ThemeId } from "@/lib/themes"

interface OpenRouterModel {
  id: string
  name: string
  context_length: number
  pricing: { prompt: string; completion: string }
  created: number
  architecture?: { input_modalities?: string[] }
  supported_parameters?: string[]
}

interface SettingsViewProps {
  onBack: () => void
  theme: ThemeId
  dark: boolean
  onSetTheme: (theme: ThemeId) => void
  onToggleDark: () => void
}

function supportsStructuredOutput(model: OpenRouterModel): boolean {
  const params = model.supported_parameters ?? []
  return params.includes("structured_outputs")
}

async function fetchModels(): Promise<OpenRouterModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models")
  if (!res.ok) throw new Error("Failed to fetch models")
  const data: unknown = await res.json()
  const models = (data as { data?: OpenRouterModel[] }).data ?? []
  return models
    .filter((m) => supportsStructuredOutput(m))
    .sort((a, b) => b.created - a.created)
}

export function SettingsView({ onBack, theme, dark, onSetTheme, onToggleDark }: SettingsViewProps) {
  const [key, setKey] = useState(() => getApiKey() ?? "")
  const [model, setModelState] = useState(() => getModel())
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [modelSearch, setModelSearch] = useState("")
  const [autoRenameUseFileContent, setAutoRenameUseFileContentState] = useState(() => getAutoRenameUseFileContent())
  const didFetchRef = useRef(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ name: string; error?: string } | null>(null)

  useEffect(() => {
    if (didFetchRef.current) return
    didFetchRef.current = true
    setModelsLoading(true)
    fetchModels()
      .then(setModels)
      .catch((e) => setModelsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setModelsLoading(false))
  }, [])

  const handleKeyChange = useCallback((value: string) => {
    setKey(value)
    setApiKey(value)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [])

  const handleModelChange = useCallback((value: string) => {
    setModelState(value)
    setModel(value)
  }, [])

  const handleAutoRenameUseFileContentChange = useCallback((value: boolean) => {
    setAutoRenameUseFileContentState(value)
    setAutoRenameUseFileContent(value)
  }, [])

  const handleImportFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    })

    if (!selected) return

    setImporting(true)
    setImportResult(null)
    try {
      const folderName = await invoke<string>("import_folder_to_project", {
        sourcePath: selected,
      })
      setImportResult({ name: folderName })
    } catch (e) {
      setImportResult({ name: "", error: e instanceof Error ? e.message : String(e) })
    } finally {
      setImporting(false)
    }
  }, [])

  const filteredModels = modelSearch
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : models

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/70 px-6 py-4">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">Settings</h1>
          <p className="text-caption text-muted-foreground">Local preferences and AI renaming.</p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
          <div className="rounded-[1.25rem] border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
            <label className="text-sm font-medium">Theme</label>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([
                { id: "focal" as ThemeId, name: "Focal", lightBg: "bg-slate-100", darkBg: "bg-slate-800", accent: "bg-blue-500" },
                { id: "codex" as ThemeId, name: "Codex", lightBg: "bg-indigo-50", darkBg: "bg-indigo-950", accent: "bg-indigo-400" },
                { id: "claude" as ThemeId, name: "Claude", lightBg: "bg-amber-50", darkBg: "bg-stone-900", accent: "bg-orange-400" },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSetTheme(t.id)
                    if (dark) onToggleDark()
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors",
                    theme === t.id && !dark
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/30 hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-background/60">
                    <div className={cn("h-3 w-3 rounded-sm", t.lightBg)} />
                    <div className={cn("h-3 w-3 rounded-sm", t.accent)} />
                  </div>
                  <span className="text-caption font-medium">{t.name}</span>
                  <span className="text-micro text-muted-foreground">Light</span>
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                { id: "focal" as ThemeId, name: "Focal", bg: "bg-slate-800", accent: "bg-blue-400" },
                { id: "codex" as ThemeId, name: "Codex", bg: "bg-indigo-950", accent: "bg-indigo-400" },
                { id: "claude" as ThemeId, name: "Claude", bg: "bg-stone-900", accent: "bg-orange-400" },
              ]).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSetTheme(t.id)
                    if (!dark) onToggleDark()
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors",
                    theme === t.id && dark
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/30 hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-background/60">
                    <div className={cn("h-3 w-3 rounded-sm", t.bg)} />
                    <div className={cn("h-3 w-3 rounded-sm", t.accent)} />
                  </div>
                  <span className="text-caption font-medium">{t.name}</span>
                  <span className="text-micro text-muted-foreground">Dark</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
            <label className="text-sm font-medium">OpenRouter API Key</label>
            <Input
              type="password"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="sk-or-..."
              className="mt-2 font-mono text-xs"
            />
            <div className="mt-1.5 flex items-start justify-between gap-2">
              <p className="min-w-0 text-caption text-muted-foreground/60">
                Stored locally. Used for AI file renaming.
                {saved && (
                  <span className="ml-1 text-emerald-600 dark:text-emerald-400">Saved</span>
                )}
              </p>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
              >
                Get a key
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
            <label className="text-sm font-medium">AI Model</label>
            <p className="mt-1 text-caption text-muted-foreground/70">
              Showing only models that support structured output.
            </p>
            {modelsLoading ? (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading models...
              </div>
            ) : modelsError ? (
              <div className="mt-2">
                <p className="text-xs text-destructive">{modelsError}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setModelsError(null)
                    setModelsLoading(true)
                    fetchModels()
                      .then(setModels)
                      .catch((e) => setModelsError(e instanceof Error ? e.message : String(e)))
                      .finally(() => setModelsLoading(false))
                  }}
                  className="mt-1 h-7 text-xs"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mt-2">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    placeholder="Search models..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <ScrollArea className="mt-2 h-56 rounded-md border">
                  <div className="p-1">
                    {filteredModels.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">
                        No models match your search.
                      </p>
                    ) : (
                      filteredModels.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleModelChange(m.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded text-sm transition-colors",
                            model === m.id
                              ? "bg-primary/10 text-primary font-medium"
                              : "hover:bg-accent"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{m.name}</span>
                            <span className="text-micro text-muted-foreground shrink-0 tabular-nums">
                              {m.context_length >= 1000
                                ? `${(m.context_length / 1000).toFixed(0)}k`
                                : m.context_length}
                            </span>
                          </div>
                          <p className="text-caption text-muted-foreground/60 mt-0.5 truncate">
                            {m.id}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </>
            )}
          </div>

          <div className="rounded-[1.25rem] border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
            <label className="text-sm font-medium">Auto Rename Context</label>
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 bg-background/30 p-3">
              <input
                type="checkbox"
                checked={autoRenameUseFileContent}
                onChange={(e) => handleAutoRenameUseFileContentChange(e.target.checked)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <p className="text-sm">Read file content for rename suggestions</p>
                <p className="text-caption text-muted-foreground/70 mt-0.5">
                  Uses a short text preview to generate more accurate filenames.
                </p>
              </div>
            </label>
          </div>

          <div className="rounded-[1.25rem] border border-border/70 bg-background/40 p-5 shadow-sm backdrop-blur">
            <label className="text-sm font-medium">Import Folder</label>
            <p className="mt-1 text-caption text-muted-foreground/70">
              Copy an existing folder from your filesystem into the projects directory.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportFolder}
              disabled={importing}
              className="mt-2 gap-1.5"
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FolderInput className="h-4 w-4" />
              )}
              {importing ? "Importing..." : "Choose Folder"}
            </Button>
            {importResult && (
              <p className={cn(
                "mt-2 text-caption",
                importResult.error ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
              )}>
                {importResult.error
                  ? `Import failed: ${importResult.error}`
                  : `Imported "${importResult.name}" successfully`}
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
