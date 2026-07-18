import { useState, useEffect, useId } from"react"
import { motion, useReducedMotion } from"framer-motion"
import { openUrl } from"@tauri-apps/plugin-opener"
import { toast } from"sonner"
import { Plus, Pencil, Trash2, Link, BookOpen, GraduationCap, FileText, Globe, Video, Calculator, Palette, FlaskConical, Music, Dumbbell, ExternalLink } from"lucide-react"
import { Button } from"@/components/ui/button"
import { Input } from"@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from"@/components/ui/dialog"
import { cn, isRecord } from"@/lib/utils"
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

function getStoredQuickLinks(): QuickLink[] {
 try {
 const stored = localStorage.getItem(QUICK_LINKS_KEY)
 if (!stored) return []
 const parsed: unknown = JSON.parse(stored)
 return Array.isArray(parsed)
 ? parsed.filter(
 (link): link is QuickLink =>
 isRecord(link) &&
 ["id","label","url","icon","color"].every(
 (field) => typeof link[field] ==="string",
 ),
 )
 : []
 } catch {
 return []
 }
}

export function QuickLinks() {
 const [quickLinks, setQuickLinks] = useState<QuickLink[]>(getStoredQuickLinks)
 const [linkDialogOpen, setLinkDialogOpen] = useState(false)
 const [editingLink, setEditingLink] = useState<QuickLink | null>(null)
 const [linkLabel, setLinkLabel] = useState("")
 const [linkUrl, setLinkUrl] = useState("")
 const [linkIcon, setLinkIcon] = useState("Link")
 const [linkColor, setLinkColor] = useState(DEFAULT_QUICK_LINK_COLOR)
 const reduceMotion = useReducedMotion() === true
 const fieldId = useId()

 useEffect(() => {
 localStorage.setItem(QUICK_LINKS_KEY, JSON.stringify(quickLinks))
 }, [quickLinks])

 const handleSaveLink = () => {
 if (!linkLabel.trim() || !linkUrl.trim()) return
 const rawUrl = linkUrl.trim()
 const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
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
 <h3 className="flex items-center gap-2 text-sm font-semibold">
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
 <Button
 type="button"
 onClick={() => void openUrl(link.url).catch(() => {
 toast.error(`Couldn't open "${link.label}". Check the saved URL and try again.`)
 })}
 variant="outline"
 className="h-auto min-w-0 flex-col items-center gap-1.5 p-3 text-center whitespace-normal"
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
 </Button>
 <Button
 type="button"
 onClick={() => handleEditLink(link)}
 variant="outline"
 size="icon-xs"
 className="absolute right-1.5 top-1.5 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
 aria-label={`Edit ${link.label}`}
 >
 <Pencil className="h-3 w-3" />
 </Button>
 </motion.div>
 )
 })}
 </motion.div>
 )}
 </div>

 <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
 <DialogContent className="sm:max-w-lg">
 <DialogHeader>
 <DialogTitle>{editingLink ?"Edit Link" :"Add Quick Link"}</DialogTitle>
 </DialogHeader>
 <form
 onSubmit={(event) => {
 event.preventDefault()
 handleSaveLink()
 }}
 >
 <div className="grid gap-4 py-1">
 <div className="grid gap-2">
 <label className="text-control font-medium text-muted-foreground">Icon</label>
 <div className="grid grid-cols-6 gap-2">
 {ICON_OPTIONS.map((opt) => {
 const IconComp = opt.component
 return (
 <Button
 key={opt.name}
 type="button"
 onClick={() => setLinkIcon(opt.name)}
 variant={linkIcon === opt.name ? "default" : "outline"}
 size="icon-lg"
 className="w-full"
 aria-label={opt.name}
 aria-pressed={linkIcon === opt.name}
 >
 <IconComp className="h-4 w-4" />
 </Button>
 )
 })}
 </div>
 </div>
 <div className="grid gap-2">
 <label className="text-control font-medium text-muted-foreground">Color</label>
 <div className="flex flex-wrap gap-2">
 {COLOR_OPTIONS.map((opt) => (
 <Button
 key={opt.value}
 type="button"
 onClick={() => setLinkColor(opt.value)}
 variant="outline"
 size="icon"
 className={cn("rounded-full", linkColor === opt.value && "ring-2 ring-ring")}
 style={{ backgroundColor: opt.value }}
 title={opt.name}
 aria-label={opt.name}
 aria-pressed={linkColor === opt.value}
 />
 ))}
 </div>
 </div>
 <div className="grid gap-2">
 <label htmlFor={`${fieldId}-label`} className="text-control font-medium text-muted-foreground">Label</label>
 <Input
 id={`${fieldId}-label`}
 required
 placeholder="e.g. VCAA English"
 value={linkLabel}
 onChange={(e) => setLinkLabel(e.target.value)}
 />
 </div>
 <div className="grid gap-2">
 <label htmlFor={`${fieldId}-url`} className="text-control font-medium text-muted-foreground">URL</label>
 <Input
 id={`${fieldId}-url`}
 type="url"
 pattern="https?://.+"
 required
 placeholder="https://..."
 value={linkUrl}
 onChange={(e) => setLinkUrl(e.target.value)}
 />
 </div>
 </div>
 <DialogFooter>
 {editingLink && (
 <Button
 type="button"
 variant="destructive"
 size="sm"
 className="sm:mr-auto"
 onClick={() => {
 handleDeleteLink(editingLink.id)
 setEditingLink(null)
 setLinkDialogOpen(false)
 }}
 >
 <Trash2 className="h-3.5 w-3.5" />
 Remove
 </Button>
 )}
 <Button type="button" variant="ghost" size="sm" onClick={() => setLinkDialogOpen(false)}>
 Cancel
 </Button>
 <Button type="submit" size="sm" disabled={!linkLabel.trim() || !linkUrl.trim()}>
 {editingLink ?"Save" :"Add"}
 </Button>
 </DialogFooter>
 </form>
 </DialogContent>
 </Dialog>
 </>
 )
}
