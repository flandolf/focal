import { useState } from"react"
import { createPortal } from"react-dom"
import { AlertTriangle, CheckCircle2, ExternalLink, X } from"lucide-react"
import { Button } from"@/components/ui/button"
import { ScrollArea } from"@/components/ui/scroll-area"
import { cn } from"@/lib/utils"

export interface NotionConflict {
 id: string
 type:"event" |"session"
 title: string
 localId: string
 notionPageId: string
 localVersion: {
 title: string
 startTime?: string
 endTime?: string
 status?: string
 }
 notionVersion: {
 title: string
 startTime?: string
 endTime?: string
 status?: string
 url?: string
 }
}

interface NotionConflictDialogProps {
 open: boolean
 onOpenChange: (open: boolean) => void
 conflicts: NotionConflict[]
 onResolve: (resolutions: Record<string,"local" |"notion" |"skip">) => void
}

export function NotionConflictDialog({
 open,
 onOpenChange,
 conflicts,
 onResolve,
}: NotionConflictDialogProps) {
 const [resolutions, setResolutions] = useState<Record<string,"local" |"notion" |"skip">>({})

 if (!open || conflicts.length === 0) return null

 const handleResolve = (id: string, resolution:"local" |"notion" |"skip") => {
 setResolutions((prev) => ({ ...prev, [id]: resolution }))
 }

 const handleResolveAll = () => {
 const allResolutions: Record<string,"local" |"notion" |"skip"> = {}
 conflicts.forEach((conflict) => {
 allResolutions[conflict.id] = resolutions[conflict.id] ??"local"
 })
 onResolve(allResolutions)
 onOpenChange(false)
 setResolutions({})
 }

 const handleSkipAll = () => {
 const skipAll: Record<string,"local" |"notion" |"skip"> = {}
 conflicts.forEach((conflict) => {
 skipAll[conflict.id] ="skip"
 })
 onResolve(skipAll)
 onOpenChange(false)
 setResolutions({})
 }

 const formatDate = (dateStr?: string) => {
 if (!dateStr) return"—"
 try {
 return new Date(dateStr).toLocaleDateString("en-AU", {
 day:"numeric",
 month:"short",
 year:"numeric",
 })
 } catch {
 return dateStr
 }
 }

 const allResolved = conflicts.every((c) => resolutions[c.id])

 return createPortal(
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
 <div className="mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl p-5">
 <div className="mb-4 flex items-start gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
 <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
 </div>
 <div className="flex-1">
 <h3 className="font-heading text-lg font-semibold">Notion Sync Conflicts</h3>
 <p className="mt-1 text-sm text-muted-foreground">
 {conflicts.length} item{conflicts.length === 1 ?"" :"s"} were modified in both Focal and Notion.
 Choose which version to keep for each conflict.
 </p>
 </div>
 <button
 onClick={() => onOpenChange(false)}
 className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
 <X className="h-4 w-4" />
 </button>
 </div>

 <ScrollArea className="min-h-0 flex-1 -mx-2 px-2">
 <div className="space-y-3">
 {conflicts.map((conflict) => {
 const resolution = resolutions[conflict.id]
 return (
 <div
 key={conflict.id}
 className="rounded-xl border border-border/70 bg-background/48 p-4"
 >
 <div className="mb-3 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-xs font-medium text-muted-foreground uppercase">
 {conflict.type}
 </span>
 <span className="text-sm font-medium">{conflict.title}</span>
 </div>
 {resolution && (
 <span className={cn(
"text-xs font-medium px-2 py-0.5 rounded-full",
 resolution ==="local" &&"bg-primary/10 text-primary",
 resolution ==="notion" &&"bg-green-500/10 text-green-600 dark:text-green-400",
 resolution ==="skip" &&"bg-muted text-muted-foreground",
 )}>
 {resolution ==="local" ?"Keeping Focal" : resolution ==="notion" ?"Keeping Notion" :"Skipped"}
 </span>
 )}
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
 <div className="mb-2 text-xs font-medium text-muted-foreground">Focal Version</div>
 <div className="space-y-1 text-sm">
 <div className="font-medium">{conflict.localVersion.title}</div>
 <div className="text-xs text-muted-foreground">
 {formatDate(conflict.localVersion.startTime)}
 {conflict.localVersion.endTime && ` – ${formatDate(conflict.localVersion.endTime)}`}
 </div>
 {conflict.localVersion.status && (
 <div className="text-xs text-muted-foreground">
 Status: {conflict.localVersion.status}
 </div>
 )}
 </div>
 </div>

 <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
 <div className="mb-2 flex items-center justify-between">
 <span className="text-xs font-medium text-muted-foreground">Notion Version</span>
 {conflict.notionVersion.url && (
 <a
 href={conflict.notionVersion.url}
 target="_blank"
 rel="noopener noreferrer"
 className="text-xs text-muted-foreground hover:text-foreground"
 >
 <ExternalLink className="h-3 w-3" />
 </a>
 )}
 </div>
 <div className="space-y-1 text-sm">
 <div className="font-medium">{conflict.notionVersion.title}</div>
 <div className="text-xs text-muted-foreground">
 {formatDate(conflict.notionVersion.startTime)}
 {conflict.notionVersion.endTime && ` – ${formatDate(conflict.notionVersion.endTime)}`}
 </div>
 {conflict.notionVersion.status && (
 <div className="text-xs text-muted-foreground">
 Status: {conflict.notionVersion.status}
 </div>
 )}
 </div>
 </div>
 </div>

 <div className="mt-3 flex gap-2">
 <Button
 size="sm"
 variant={resolution ==="local" ?"default" :"outline"}
 onClick={() => handleResolve(conflict.id,"local")}
 className={cn("flex-1", resolution ==="local" &&"")}
 >
 <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
 Keep Focal
 </Button>
 <Button
 size="sm"
 variant={resolution ==="notion" ?"default" :"outline"}
 onClick={() => handleResolve(conflict.id,"notion")}
 className={cn("flex-1", resolution ==="notion" &&"")}
 >
 <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
 Keep Notion
 </Button>
 <Button
 size="sm"
 variant={resolution ==="skip" ?"default" :"outline"}
 onClick={() => handleResolve(conflict.id,"skip")}
 className={cn(resolution ==="skip" &&"")}
 >
 Skip
 </Button>
 </div>
 </div>
 )
 })}
 </div>
 </ScrollArea>

 <div className="mt-4 flex justify-between border-t border-border pt-4">
 <Button variant="ghost" onClick={handleSkipAll}>
 Skip All
 </Button>
 <div className="flex gap-2">
 <Button variant="outline" onClick={() => onOpenChange(false)}>
 Cancel
 </Button>
 <Button onClick={handleResolveAll} disabled={!allResolved}>
 Resolve All ({Object.keys(resolutions).length}/{conflicts.length})
 </Button>
 </div>
 </div>
 </div>
 </div>,
 document.body,
 )
}
