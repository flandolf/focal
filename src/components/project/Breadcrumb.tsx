import { ChevronRight, ChevronLeft, Home } from "lucide-react"
import { cn } from "@/lib/utils"

interface BreadcrumbSegment {
  label: string
  path: string
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[]
  onNavigate: (path: string) => void
  onBack?: () => void
  canGoBack?: boolean
}

export function Breadcrumb({ segments, onNavigate, onBack, canGoBack }: BreadcrumbProps) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Back button */}
      {canGoBack && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
    >
          <ChevronLeft className="h-3 w-3 shrink-0" />
          Back
        </button>
      )}

      {/* Breadcrumb path */}
      <nav aria-label="Breadcrumb" className="flex items-center">
        <ol className="flex items-center gap-0.5">
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1
            return (
              <li key={segment.path} className="flex items-center">
                {index > 0 && (
                  <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground/30 shrink-0" aria-hidden="true" />
                )}
                {isLast ? (
                  <span
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-foreground"
                    aria-current="page"
                  >
                    {index === 0 && <Home className="h-3 w-3" />}
                    {segment.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigate(segment.path)}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/35",
                      index === 0 && "text-muted-foreground/70",
                    )}
                  >
                    {index === 0 && <Home className="h-3 w-3" />}
                    {segment.label}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </div>
  )
}
