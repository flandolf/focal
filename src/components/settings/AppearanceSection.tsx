import { useCallback, type ReactNode } from "react";
import { Moon, Sun, Monitor, Minus, Plus } from "lucide-react";
import type { ThemeMode } from "@/lib/themes";
import { isMacOS } from "@/lib/platform";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      variant={selected ? "default" : "outline"}
      className="flex-1"
    >
      {icon}
      {label}
    </Button>
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
    <div className="space-y-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Mode</CardTitle>
          <CardDescription>
            System follows your OS. Light and dark work everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {MODE_OPTIONS.map(({ value, icon: Icon, label }) => (
            <ModeButton
              key={value}
              selected={mode === value}
              onSelect={() => setMode(value)}
              icon={<Icon className="h-4 w-4" />}
              label={label}
            />
          ))}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader className="grid-cols-[1fr_auto]">
          <div>
            <CardTitle>Zoom</CardTitle>
            <CardDescription>
              Adjust the overall app scale. Keyboard: {shortcutModifier}+= to
              zoom in, {shortcutModifier}+- to zoom out, {shortcutModifier}+0
              to reset.
            </CardDescription>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 0.75}
            aria-label="Zoom out"
            variant="outline"
            size="icon"
          >
            <Minus />
          </Button>
          <input
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={zoom}
            onChange={(event) => onZoomChange(parseFloat(event.target.value))}
            aria-label="Zoom level"
            className="w-full accent-primary"
          />
          <Button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 1.5}
            aria-label="Zoom in"
            variant="outline"
            size="icon"
          >
            <Plus />
          </Button>
          <Button
            type="button"
            onClick={handleZoomReset}
            disabled={zoom === 1}
            variant="outline"
          >
            Reset
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
