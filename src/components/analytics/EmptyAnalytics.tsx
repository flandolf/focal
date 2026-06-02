import { BarChart3, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyAnalyticsProps {
  onNewSession: () => void
}

export function EmptyAnalytics({ onNewSession }: EmptyAnalyticsProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
        <BarChart3 className="h-8 w-8 text-muted-foreground/25" />
      </div>
      <p className="mb-2 max-w-64 text-sm leading-relaxed text-muted-foreground">
        Complete your first study session to see analytics about your study habits.
      </p>
      <Button onClick={onNewSession} size="sm" className="gap-1.5 mt-2">
        <Plus className="h-4 w-4" />
        New Study Session
      </Button>
    </div>
  )
}
