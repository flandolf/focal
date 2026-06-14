import { useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { platform } from "@tauri-apps/plugin-os"
import { motion, useReducedMotion } from "framer-motion"
import { Minus, Plus, Search, Settings, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const IS_MACOS = (() => {
  try {
    return platform() === "macos"
  } catch {
    return false
  }
})()

const noop = () => { /* no-op */ }

interface TitleBarProps {
  onSearch?: () => void
  onSettings?: () => void
  children?: React.ReactNode
}

function TrafficLights({
  reduceMotion,
  onClose,
  onMinimize,
  onMaximize,
  className,
  reversed = false,
}: {
  reduceMotion: boolean | null
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
  className?: string
  reversed?: boolean
}) {
  const closeButton = (
    <motion.button
      key="close"
      onClick={onClose}
      whileHover={reduceMotion ? undefined : { scale: 1.1 }}
      whileTap={reduceMotion ? undefined : { scale: 0.9 }}
      className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] text-[#4d0000] opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5f57]/50"
      aria-label="Close window"
    >
      <X className="hidden h-2.5 w-2.5 stroke-[2.5] group-hover:block" />
    </motion.button>
  )

  const minimizeButton = (
    <motion.button
      key="minimize"
      onClick={onMinimize}
      whileHover={reduceMotion ? undefined : { scale: 1.1 }}
      whileTap={reduceMotion ? undefined : { scale: 0.9 }}
      className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#febc2e] text-[#995700] opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#febc2e]/50"
      aria-label="Minimize window"
    >
      <Minus className="hidden h-2.5 w-2.5 stroke-[2.5] group-hover:block" />
    </motion.button>
  )

  const maximizeButton = (
    <motion.button
      key="maximize"
      onClick={onMaximize}
      whileHover={reduceMotion ? undefined : { scale: 1.1 }}
      whileTap={reduceMotion ? undefined : { scale: 0.9 }}
      className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#28c840] text-[#006500] opacity-90 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28c840]/50"
      aria-label="Toggle maximize"
    >
      <Plus className="hidden h-2.5 w-2.5 stroke-[2.5] group-hover:block" />
    </motion.button>
  )

  const buttons = reversed
    ? [minimizeButton, maximizeButton, closeButton]
    : [closeButton, minimizeButton, maximizeButton]

  return (
    <div className={className}>
      {buttons}
    </div>
  )
}

function AppActions({
  onSearch,
  onSettings,
  children,
  reduceMotion,
  className,
}: {
  onSearch: () => void
  onSettings: () => void
  children?: React.ReactNode
  reduceMotion: boolean | null
  className?: string
}) {
  return (
    <div className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={onSearch}
            whileHover={reduceMotion ? undefined : { scale: 1.06 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 560, damping: 28, mass: 0.55 }}
            className="flex h-7 w-7 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background/65 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">Search · ⌘K</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            onClick={onSettings}
            whileHover={reduceMotion ? undefined : { scale: 1.06 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 560, damping: 28, mass: 0.55 }}
            className="flex h-7 w-7 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background/65 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">Settings</TooltipContent>
      </Tooltip>
      {children}
    </div>
  )
}

export function TitleBar({ onSearch = noop, onSettings = noop, children }: TitleBarProps) {
  const reduceMotion = useReducedMotion()

  const handleMinimize = useCallback(() => {
    void invoke("window_minimize")
  }, [])

  const handleToggleMaximize = useCallback(() => {
    void invoke("window_toggle_maximize")
  }, [])

  const handleClose = useCallback(() => {
    void invoke("window_close")
  }, [])

  return (
    <div
      data-tauri-drag-region
      className="app-titlebar flex h-(--app-titlebar-inset) shrink-0 items-center select-none bg-background/60 backdrop-blur-md"
    >
      {/* Left section: traffic lights on macOS, actions on other platforms */}
      {IS_MACOS ? (
        <TrafficLights
          reduceMotion={reduceMotion}
          onClose={handleClose}
          onMinimize={handleMinimize}
          onMaximize={handleToggleMaximize}
          className="flex items-center gap-2 px-4"
        />
      ) : (
        <AppActions
          onSearch={onSearch}
          onSettings={onSettings}
          reduceMotion={reduceMotion}
          className="flex items-center gap-1.5 px-4"
        >
          {children}
        </AppActions>
      )}

      {/* App title — draggable region */}
      <div data-tauri-drag-region className="flex flex-1 items-center justify-center px-4">
        <span data-tauri-drag-region className="text-sm font-medium text-muted-foreground/60">Focal</span>
      </div>

      {/* Right section: actions on macOS, traffic lights on other platforms */}
      {IS_MACOS ? (
        <AppActions
          onSearch={onSearch}
          onSettings={onSettings}
          reduceMotion={reduceMotion}
          className="flex items-center gap-1.5 px-4"
        >
          {children}
        </AppActions>
      ) : (
        <TrafficLights
          reduceMotion={reduceMotion}
          onClose={handleClose}
          onMinimize={handleMinimize}
          onMaximize={handleToggleMaximize}
          reversed={!IS_MACOS}
          className="flex items-center gap-2 px-4"
        />
      )}
    </div>
  )
}
