import { useCallback, type ReactNode } from "react";
import { Moon, Sun, Monitor, Minus, Plus } from "lucide-react";
import type { ThemeMode } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { isMacOS } from "@/lib/platform";

interface ModeOption {
  value: ThemeMode;
  icon: typeof Sun;
  label: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

interface AppearanceSectionProps {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

function ModeButton({
  selected,
  onSelect,
  icon,
  label,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function AppearanceSection({
  mode,
  setMode,
  zoom,
  onZoomChange,
}: AppearanceSectionProps) {
  const shortcutModifier = isMacOS ? "Cmd" : "Ctrl";

  const handleZoomOut = useCallback(() => {
    onZoomChange(Math.max(zoom - 0.1, 0.75));
  }, [zoom, onZoomChange]);

  const handleZoomIn = useCallback(() => {
    onZoomChange(Math.min(zoom + 0.1, 1.5));
  }, [zoom, onZoomChange]);

  const handleZoomReset = useCallback(() => {
    onZoomChange(1);
  }, [onZoomChange]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div>
          <h2 className="text-sm font-medium">Mode</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            System follows your OS. Light and dark work everywhere.
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          {MODE_OPTIONS.map(({ value, icon: Icon, label }) => (
            <ModeButton
              key={value}
              selected={mode === value}
              onSelect={() => setMode(value)}
              icon={<Icon className="h-4 w-4" />}
              label={label}
            />
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Zoom</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust the overall app scale. Keyboard: {shortcutModifier}+= to
              zoom in, {shortcutModifier}+- to zoom out, {shortcutModifier}+0
              to reset.
            </p>
          </div>
          <span className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.75}
            aria-label="Zoom out"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={zoom}
            onChange={(event) => onZoomChange(parseFloat(event.target.value))}
            aria-label="Zoom level"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted outline-none transition-colors
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background
              [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
              [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-sm"
          />
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 1.5}
            aria-label="Zoom in"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomReset}
            disabled={zoom === 1}
            className="rounded-md border border-input bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </section>
    </div>
  );
}
