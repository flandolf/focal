import { useCallback } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { platform } from "@tauri-apps/plugin-os"
import { Minus, Plus, Search, Settings, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const IS_MACOS = (() => {
  try {
    return platform() === "macos"
  } catch {
    return false
  }
})()
const SEARCH_SHORTCUT = IS_MACOS ? "⌘K" : "Ctrl K"

const noop = () => { /* no-op */ }

interface TitleBarProps {
  onSearch?: () => void
  onSettings?: () => void
  children?: React.ReactNode
}

interface TrafficLightProps {
  onClick: () => void
  color: string
  ringColor: string
  label: string
  icon: typeof X
}

function TrafficLight({ onClick, color, ringColor, label, icon: Icon }: TrafficLightProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group flex h-3 w-3 items-center justify-center rounded-full opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2"
      style={{ background: color, color: ringColor }}
    >
      <Icon className="hidden h-2.5 w-2.5 stroke-[2.5] group-hover:block" />
    </button>
  )
}

function TrafficLights({
  onClose,
  onMinimize,
  onMaximize,
  className,
}: {
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
  className?: string
}) {
  return (
    <div className={className}>
      <TrafficLight
        onClick={onClose}
        color="#ff5f57"
        ringColor="#4d0000"
        label="Close window"
        icon={X}
      />
      <TrafficLight
        onClick={onMinimize}
        color="#febc2e"
        ringColor="#995700"
        label="Minimize window"
        icon={Minus}
      />
      <TrafficLight
        onClick={onMaximize}
        color="#28c840"
        ringColor="#006500"
        label="Toggle maximize"
        icon={Plus}
      />
    </div>
  )
}

function AppActions({
  onSearch,
  onSettings,
  children,
  className,
}: {
  onSearch: () => void
  onSettings: () => void
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onSearch}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">Search · {SEARCH_SHORTCUT}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onSettings}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label="Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">Settings</TooltipContent>
      </Tooltip>
      {children}
    </div>
  )
}

export function TitleBar({ onSearch = noop, onSettings = noop, children }: TitleBarProps) {
  const handleMinimize = useCallback(() => {
    void getCurrentWindow().minimize()
  }, [])

  const handleToggleMaximize = useCallback(() => {
    void getCurrentWindow().toggleMaximize()
  }, [])

  const handleClose = useCallback(() => {
    void getCurrentWindow().close()
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="relative z-10 flex h-10 shrink-0 items-center border-b bg-background select-none"
    >
      {IS_MACOS ? (
        <TrafficLights
          onClose={handleClose}
          onMinimize={handleMinimize}
          onMaximize={handleToggleMaximize}
          className="flex items-center gap-2 px-4"
        />
      ) : (
        <AppActions
          onSearch={onSearch}
          onSettings={onSettings}
          className="flex items-center gap-1.5 px-4"
        >
          {children}
        </AppActions>
      )}

      <div data-tauri-drag-region className="flex flex-1 items-center justify-center px-4">
        <span data-tauri-drag-region className="text-sm font-medium text-muted-foreground">Focal</span>
      </div>

      {IS_MACOS ? (
        <AppActions
          onSearch={onSearch}
          onSettings={onSettings}
          className="flex items-center gap-1.5 px-4"
        >
          {children}
        </AppActions>
      ) : (
        <TrafficLights
          onClose={handleClose}
          onMinimize={handleMinimize}
          onMaximize={handleToggleMaximize}
          className="flex items-center gap-2 px-4"
        />
      )}
    </div>
  )
}
