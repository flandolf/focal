import { useState, useEffect, useRef, useCallback } from"react"
import { motion, useReducedMotion } from"framer-motion"
import { Plus, Pencil, Trash2, Link, BookOpen, GraduationCap, FileText, Globe, Video, Calculator, Palette, FlaskConical, Music, Dumbbell, ExternalLink } from"lucide-react"
import { Button } from"@/components/ui/button"
import { Input } from"@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from"@/components/ui/dialog"
import { cn } from"@/lib/utils"
import { staggerContainer, staggerItem, hoverLift } from"@/lib/motion"

interface QuickLink {
 id: string
 label: string
 url: string
 icon: string
 color: string
}

const QUICK_LINKS_KEY ="focal-quick-links"

const ICON_OPTIONS = [
 { name:"BookOpen", component: BookOpen },
 { name:"GraduationCap", component: GraduationCap },
 { name:"FileText", component: FileText },
 { name:"Globe", component: Globe },
 { name:"Video", component: Video },
 { name:"Calculator", component: Calculator },
 { name:"Palette", component: Palette },
 { name:"FlaskConical", component: FlaskConical },
 { name:"Music", component: Music },
 { name:"Dumbbell", component: Dumbbell },
 { name:"ExternalLink", component: ExternalLink },
 { name:"Link", component: Link },
]

const COLOR_OPTIONS = [
 { name:"Gray", value:"#71717a" },
 { name:"Red", value:"#ef4444" },
 { name:"Orange", value:"#f97316" },
 { name:"Amber", value:"#f59e0b" },
 { name:"Green", value:"#22c55e" },
 { name:"Teal", value:"#14b8a6" },
 { name:"Blue", value:"#3b82f6" },
 { name:"Indigo", value:"#6366f1" },
 { name:"Purple", value:"#a855f7" },
 { name:"Pink", value:"#ec4899" },
]

const DEFAULT_QUICK_LINK_COLOR ="#71717a"

function getIconComponent(name: string) {
 return ICON_OPTIONS.find((o) => o.name === name)?.component ?? Link
}

function getQuickLinkDestination(url: string) {
 try {
 return new URL(url).hostname.replace(/^www\./,"")
 } catch {
 return url.replace(/^https?:\/\//,"").split(/[/?#]/)[0] || url
 }
}

export function QuickLinks() {
 const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() => {
 const stored = localStorage.getItem(QUICK_LINKS_KEY)
 return stored ? (JSON.parse(stored) as QuickLink[]) : []
 })
 const [linkDialogOpen, setLinkDialogOpen] = useState(false)
 const [editingLink, setEditingLink] = useState<QuickLink | null>(null)
 const [linkLabel, setLinkLabel] = useState("")
 const [linkUrl, setLinkUrl] = useState("")
 const [linkIcon, setLinkIcon] = useState("Link")
 const [linkColor, setLinkColor] = useState(DEFAULT_QUICK_LINK_COLOR)
 const [contextMenu, setContextMenu] = useState<{ x: number; y: number; link: QuickLink } | null>(null)
 const contextMenuRef = useRef<HTMLDivElement>(null)
 const reduceMotion = useReducedMotion() === true

 const handleContextMenu = useCallback((e: React.MouseEvent, link: QuickLink) => {
 e.preventDefault()
 setContextMenu({ x: e.clientX, y: e.clientY, link })
 }, [])

 useEffect(() => {
 if (!contextMenu) return
 const handleClick = () => setContextMenu(null)
 const handleKeyDown = (e: KeyboardEvent) => {
 if (e.key ==="Escape") setContextMenu(null)
 }
 document.addEventListener("click", handleClick)
 document.addEventListener("keydown", handleKeyDown)
 return () => {
 document.removeEventListener("click", handleClick)
 document.removeEventListener("keydown", handleKeyDown)
 }
 }, [contextMenu])

 useEffect(() => {
 localStorage.setItem(QUICK_LINKS_KEY, JSON.stringify(quickLinks))
 }, [quickLinks])

 const handleSaveLink = () => {
 if (!linkLabel.trim() || !linkUrl.trim()) return
 const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`
 if (editingLink) {
 setQuickLinks((prev) =>
 prev.map((l) => (l.id === editingLink.id ? { ...l, label: linkLabel.trim(), url, icon: linkIcon, color: linkColor } : l))
 )
 } else {
 setQuickLinks((prev) => [...prev, { id: crypto.randomUUID(), label: linkLabel.trim(), url, icon: linkIcon, color: linkColor }])
 }
 setLinkDialogOpen(false)
 setEditingLink(null)
 setLinkLabel("")
 setLinkUrl("")
 setLinkIcon("Link")
 setLinkColor(DEFAULT_QUICK_LINK_COLOR)
 }

 const handleDeleteLink = (id: string) => {
 setQuickLinks((prev) => prev.filter((l) => l.id !== id))
 }

 const handleEditLink = (link: QuickLink) => {
 setEditingLink(link)
 setLinkLabel(link.label)
 setLinkUrl(link.url)
 setLinkIcon(link.icon)
 setLinkColor(link.color)
 setLinkDialogOpen(true)
 }

 return (
 <>
 <div>
 <div className="flex items-center justify-between mb-3">
 <h3 className="font-heading text-sm font-semibold flex items-center gap-2">
 <Link className="h-3.5 w-3.5 text-muted-foreground" />
 Quick Links
 </h3>
 {quickLinks.length < 6 && (
 <Button
 variant="ghost"
 size="sm"
 className="h-6 px-2 text-xs"
 onClick={() => {
 setEditingLink(null)
 setLinkLabel("")
 setLinkUrl("")
 setLinkIcon("Link")
 setLinkColor(DEFAULT_QUICK_LINK_COLOR)
 setLinkDialogOpen(true)
 }}
 >
 <Plus className="h-3 w-3 mr-1" />
 Add
 </Button>
 )}
 </div>
 {quickLinks.length === 0 ? (
 <p className="text-xs text-muted-foreground">
 Add shortcuts to subject resources, VCAA pages, or anything you use often.
 </p>
 ) : (
 <motion.div
 className="grid grid-cols-3 gap-2"
 variants={staggerContainer(0.04, 0.05)}
 initial="initial"
 animate="animate"
 >
 {quickLinks.slice(0, 6).map((link) => {
 const IconComp = getIconComponent(link.icon)
 const destination = getQuickLinkDestination(link.url)
 return (
 <motion.div
 key={link.id}
 variants={staggerItem}
 whileHover={hoverLift(reduceMotion)}
 transition={{ type:"spring", stiffness: 480, damping: 32, mass: 0.6 }}
 className="group relative min-w-0"
 >
 <a
 href={link.url}
 target="_blank"
 rel="noopener noreferrer"
 onContextMenu={(e) => handleContextMenu(e, link)}
 className="flex min-w-0 flex-col items-center gap-1.5 rounded-xl border border-border/60 p-3 text-center transition-all hover:border-border hover:shadow-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
 style={{ backgroundColor: link.color +"18" }}
 aria-label={`Open ${link.label}: ${destination}`}
 >
 <IconComp className="h-5 w-5 transition-colors" style={{ color: link.color }} />
 <span className="text-micro w-full truncate transition-colors" style={{ color: link.color }}>
 {link.label}
 </span>
 <span className="w-full truncate text-micro leading-none text-muted-foreground/70">
 {destination}
 </span>
 </a>
 <button
 type="button"
 onClick={() => handleEditLink(link)}
 onContextMenu={(e) => handleContextMenu(e, link)}
 className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/80 backdrop-blur transition-all hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 group-hover:opacity-100"
 aria-label={`Edit ${link.label}`}
 >
 <Pencil className="h-3 w-3" />
 </button>
 </motion.div>
 )
 })}
 </motion.div>
 )}
 </div>

 {contextMenu && (
 <div
 ref={contextMenuRef}
 className="fixed z-50 min-w-35 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
 style={{ top: contextMenu.y, left: contextMenu.x }}
 >
 <button
 className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
 onClick={() => {
 handleEditLink(contextMenu.link)
 setContextMenu(null)
 }}
 >
 <Pencil className="h-3.5 w-3.5" />
 Edit
 </button>
 <button
 className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
 onClick={() => {
 handleDeleteLink(contextMenu.link.id)
 setContextMenu(null)
 }}
 >
 <Trash2 className="h-3.5 w-3.5" />
 Remove
 </button>
 </div>
 )}

 <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{editingLink ?"Edit Link" :"Add Quick Link"}</DialogTitle>
 </DialogHeader>
 <div className="grid gap-4 py-1">
 <div className="grid gap-2">
 <label className="text-control font-medium text-muted-foreground">Icon</label>
 <div className="grid grid-cols-6 gap-2">
 {ICON_OPTIONS.map((opt) => {
 const IconComp = opt.component
 return (
 <button
 key={opt.name}
 type="button"
 onClick={() => setLinkIcon(opt.name)}
 className={cn(
"flex h-10 w-full items-center justify-center rounded-lg border transition-colors",
 linkIcon === opt.name
 ?"border-primary/35 bg-primary/10 text-primary"
 :"border-border/60 bg-background/40 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
 )}
 aria-label={opt.name}
 aria-pressed={linkIcon === opt.name}
 >
 <IconComp className="h-4 w-4" />
 </button>
 )
 })}
 </div>
 </div>
 <div className="grid gap-2">
 <label className="text-control font-medium text-muted-foreground">Color</label>
 <div className="flex flex-wrap gap-2">
 {COLOR_OPTIONS.map((opt) => (
 <button
 key={opt.value}
 type="button"
 onClick={() => setLinkColor(opt.value)}
 className={cn(
"h-8 w-8 rounded-full border-2 transition-transform",
 linkColor === opt.value ?"scale-105 border-foreground" :"border-transparent hover:scale-105"
 )}
 style={{ backgroundColor: opt.value }}
 title={opt.name}
 aria-label={opt.name}
 aria-pressed={linkColor === opt.value}
 />
 ))}
 </div>
 </div>
 <div className="grid gap-2">
 <label className="text-control font-medium text-muted-foreground">Label</label>
 <Input
 placeholder="e.g. VCAA English"
 value={linkLabel}
 onChange={(e) => setLinkLabel(e.target.value)}
 onKeyDown={(e) => e.key ==="Enter" && handleSaveLink()}
 />
 </div>
 <div className="grid gap-2">
 <label className="text-control font-medium text-muted-foreground">URL</label>
 <Input
 placeholder="https://..."
 value={linkUrl}
 onChange={(e) => setLinkUrl(e.target.value)}
 onKeyDown={(e) => e.key ==="Enter" && handleSaveLink()}
 />
 </div>
 </div>
 <DialogFooter>
 <Button variant="ghost" size="sm" onClick={() => setLinkDialogOpen(false)}>
 Cancel
 </Button>
 <Button size="sm" onClick={handleSaveLink} disabled={!linkLabel.trim() || !linkUrl.trim()}>
 {editingLink ?"Save" :"Add"}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </>
 )
}
