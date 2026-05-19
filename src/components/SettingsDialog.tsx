import { useState, useEffect, useRef, useCallback } from "react"
import { Sun, Moon, Loader2, ExternalLink, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { getApiKey, setApiKey, getModel, setModel, getAutoRenameUseFileContent, setAutoRenameUseFileContent } from "@/lib/settings"

interface OpenRouterModel {
  id: string
  name: string
  context_length: number
  pricing: { prompt: string; completion: string }
  created: number
  architecture?: { input_modalities?: string[] }
  supported_parameters?: string[]
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dark: boolean
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

export function SettingsDialog({ open, onOpenChange, dark, onToggleDark }: SettingsDialogProps) {
  const [key, setKey] = useState(() => getApiKey() ?? "")
  const [model, setModelState] = useState(() => getModel())
  const [models, setModels] = useState<OpenRouterModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [modelSearch, setModelSearch] = useState("")
  const [autoRenameUseFileContent, setAutoRenameUseFileContentState] = useState(() => getAutoRenameUseFileContent())
  const didFetchRef = useRef(false)

  useEffect(() => {
    if (!open || didFetchRef.current) return
    didFetchRef.current = true
    setModelsLoading(true)
    fetchModels()
      .then(setModels)
      .catch((e) => setModelsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setModelsLoading(false))
  }, [open])

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

  const filteredModels = modelSearch
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.id.toLowerCase().includes(modelSearch.toLowerCase()),
      )
    : models

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure app preferences and AI provider settings.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
          {/* Theme */}
          <div>
            <label className="text-sm font-medium">Theme</label>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={onToggleDark}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-colors",
                  !dark
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                )}
              >
                <Sun className="h-4 w-4" />
                Light
              </button>
              <button
                onClick={onToggleDark}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm transition-colors",
                  dark
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                )}
              >
                <Moon className="h-4 w-4" />
                Dark
              </button>
            </div>
          </div>

          {/* OpenRouter API Key */}
          <div>
            <label className="text-sm font-medium">OpenRouter API Key</label>
            <Input
              type="password"
              value={key}
              onChange={(e) => handleKeyChange(e.target.value)}
              placeholder="sk-or-..."
              className="mt-2 font-mono text-xs"
            />
            <div className="mt-1.5 flex items-start justify-between gap-2">
              <p className="min-w-0 text-[11px] text-muted-foreground/60">
                Stored locally. Used for AI file renaming.
                {saved && (
                  <span className="ml-1 text-emerald-600 dark:text-emerald-400">Saved</span>
                )}
              </p>
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0"
              >
                Get a key
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Model Selector */}
          <div>
            <label className="text-sm font-medium">AI Model</label>
            <p className="mt-1 text-[11px] text-muted-foreground/70">
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
                            <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                              {m.context_length >= 1000
                                ? `${(m.context_length / 1000).toFixed(0)}k`
                                : m.context_length}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
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

          {/* Auto Rename Content Context */}
          <div>
            <label className="text-sm font-medium">Auto Rename Context</label>
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-md border p-3">
              <input
                type="checkbox"
                checked={autoRenameUseFileContent}
                onChange={(e) => handleAutoRenameUseFileContentChange(e.target.checked)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <p className="text-sm">Read file content for rename suggestions</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Uses a short text preview to generate more accurate filenames.
                </p>
              </div>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
