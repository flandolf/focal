import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  AlertCircle,
  Bot,
  Loader2,
  Send,
  Sparkles,
  User as UserIcon,
  Wand2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { TRANSITION, staggerContainer, staggerItem } from "@/lib/motion"
import { cn, getLocalDateValue } from "@/lib/utils"
import {
  aiChatCompletion,
  describeAiError,
  VCE_SYSTEM_PREAMBLE,
  type ChatTurn,
} from "@/lib/aiAssistant"
import { getActiveProvider } from "@/lib/providers"

const SUGGESTED_PROMPTS = [
  "Summarise this week's upcoming deadlines in 3 bullet points.",
  "What's an effective 45-minute Methods study block?",
  "Help me plan a revision week for my next SAC.",
  "Explain active recall vs spaced repetition in plain English.",
] as const

const ASSISTANT_WIDTH_KEY = "focal-ai-assistant-width"
const ASSISTANT_WIDTH_DEFAULT = 320 // px — matches Sidebar's collapsed-ish width
const ASSISTANT_WIDTH_MIN = 260
const ASSISTANT_WIDTH_MAX = 640
const ASSISTANT_WIDTH_STEP = 16

interface AiAssistantPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  pending?: boolean
  cancelled?: boolean
}

function clampAssistantWidth(value: number): number {
  if (!Number.isFinite(value)) return ASSISTANT_WIDTH_DEFAULT
  return Math.min(ASSISTANT_WIDTH_MAX, Math.max(ASSISTANT_WIDTH_MIN, value))
}

function readPersistedAssistantWidth(): number {
  try {
    const stored = localStorage.getItem(ASSISTANT_WIDTH_KEY)
    if (!stored) return ASSISTANT_WIDTH_DEFAULT
    const parsed = parseInt(stored, 10)
    return clampAssistantWidth(parsed)
  } catch {
    return ASSISTANT_WIDTH_DEFAULT
  }
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export function AIAssistantPanel({ open, onOpenChange }: AiAssistantPanelProps) {
  // ponytail: useReducedMotion returns `boolean | null`; our `?:` truthy
  // check below accepts all three, which keeps the no-motion branch firing
  // before the first paint (when the hook briefly returns `null`).
  const reduceMotion = useReducedMotion()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; hint: string | null } | null>(null)
  const sendAbortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // ponytail: trust the standard `localStorage` API and a single key per
  // preference. Mirrors `focal-app-scale`'s pattern in App.tsx; no need for a
  // dedicated settings util when exactly one line of state needs to persist.
  const [width, setWidth] = useState<number>(() => readPersistedAssistantWidth())
  const [isDragging, setIsDragging] = useState(false)
  // ponytail: a ref holding the in-progress drag's cleanup so a panel
  // unmount (e.g. user closed the dialog mid-drag) still tears down its
  // window-level listeners; otherwise they linger until the next mouseup.
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(ASSISTANT_WIDTH_KEY, String(width))
    } catch {
      // localStorage unavailable (private mode, etc); width still works for the session.
    }
  }, [width])

  // ponytail: native `mousedown` + window-level `mousemove`/`mouseup` keeps
  // the drag smooth when the cursor leaves the handle. Body-cursor lock on
  // `ew-resize` + `userSelect: none` prevent the system cursor from reverting
  // mid-drag and prevent text on the page getting highlighted underneath.
  const handleResizeStart = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      const previousBodyCursor = document.body.style.cursor
      const previousBodyUserSelect = document.body.style.userSelect
      document.body.style.cursor = "ew-resize"
      document.body.style.userSelect = "none"

      const handleMove = (moveEvent: MouseEvent) => {
        // Drag handle is on the LEFT edge, so dragging LEFT grows the panel,
        // dragging RIGHT shrinks it.
        const delta = startX - moveEvent.clientX
        setWidth(clampAssistantWidth(startWidth + delta))
      }
      const handleUp = () => {
        setIsDragging(false)
        document.body.style.cursor = previousBodyCursor
        document.body.style.userSelect = previousBodyUserSelect
        window.removeEventListener("mousemove", handleMove)
        window.removeEventListener("mouseup", handleUp)
        if (resizeCleanupRef.current === handleUp) resizeCleanupRef.current = null
      }

      setIsDragging(true)
      resizeCleanupRef.current = handleUp
      window.addEventListener("mousemove", handleMove)
      window.addEventListener("mouseup", handleUp)
    },
    [width],
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps -- ref read on unmount; effect has empty deps intentionally
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

  const handleResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        // ArrowLeft grows (panel expands to the left).
        setWidth((current) => clampAssistantWidth(current + ASSISTANT_WIDTH_STEP))
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        setWidth((current) => clampAssistantWidth(current - ASSISTANT_WIDTH_STEP))
      }
    },
    [],
  )

  // ponytail: keep a memoised "context day" so the model has temporal grounding
  // without the system prompt needing to query Date.now() (which it can't).
  const contextDay = useMemo(() => getLocalDateValue(new Date()), [])
  const providerName = getActiveProvider().displayName
  const providerMissing = !getActiveProvider().isConfigured()

  // Auto-scroll on new messages.
  useEffect(() => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" })
  }, [messages, pending, reduceMotion])

  const cancel = useCallback(() => {
    sendAbortRef.current?.abort()
    sendAbortRef.current = null
  }, [])

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || pending) return

      const userMsg: Message = { id: makeId(), role: "user", content: trimmed }
      const placeholder: Message = {
        id: makeId(),
        role: "assistant",
        content: "",
        pending: true,
      }
      setMessages((prev) => [...prev, userMsg, placeholder])
      setInput("")
      setError(null)

      const history: ChatTurn[] = [
        { role: "system", content: `${VCE_SYSTEM_PREAMBLE}\n\nToday is ${contextDay}. The user is talking to ${providerName}. Use the user's existing Focal context when relevant, but never invent specific page numbers, marks, or rubric items.` },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: trimmed },
      ]

      sendAbortRef.current = new AbortController()
      setPending(true)
      try {
        const reply = await aiChatCompletion({
          messages: history,
          temperature: 0.4,
          maxTokens: 600,
          signal: sendAbortRef.current.signal,
        })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholder.id ? { id: m.id, role: "assistant", content: reply } : m,
          ),
        )
      } catch (e) {
        const { message, hint, cancelled } = describeAiError(e)
        if (cancelled) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholder.id
                ? { ...m, content: "— cancelled —", pending: false, cancelled: true }
                : m,
            ),
          )
          return
        }
        setMessages((prev) => prev.filter((m) => m.id !== placeholder.id))
        setError({ message, hint })
      } finally {
        sendAbortRef.current = null
        setPending(false)
      }
    },
    [contextDay, messages, pending, providerName],
  )

  // Reset state when the panel closes.
  useEffect(() => {
    if (!open) {
      sendAbortRef.current?.abort()
      sendAbortRef.current = null
      setPending(false)
      setError(null)
    }
  }, [open])

  const handleSubmit = useCallback(() => {
    void send(input)
  }, [input, send])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        void send(input)
      }
    },
    [input, send],
  )

  // Suppress the framer-motion `layout` animation while the user is actively
  // dragging; otherwise the panel lags ~240ms behind the cursor. Reduced-
  // motion users bypass the entrance entirely. The non-drag path reuses
  // `TRANSITION.view` so the bezier + duration stay aligned with the other
  // view changes in `AppRoutes`.
  const panelTransition = isDragging || reduceMotion
    ? ({ duration: 0 } as const)
    : TRANSITION.view

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="ai-panel"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 20 }}
          transition={panelTransition}
          style={{ width: `${width}px` }}
          className="glass-sidebar relative flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border text-sidebar-foreground min-[1200px]:rounded-[1.35rem]"
          role="complementary"
          aria-label="AI Assistant"
        >
          {/* Resize handle — left edge. Drag with mouse, ←/→ keys for keyboard. */}
          <button
            type="button"
            aria-label="Resize AI Assistant width"
            aria-orientation="vertical"
            aria-valuemin={ASSISTANT_WIDTH_MIN}
            aria-valuemax={ASSISTANT_WIDTH_MAX}
            aria-valuenow={width}
            onMouseDown={handleResizeStart}
            onKeyDown={handleResizeKeyDown}
            className="group absolute inset-y-0 left-0 z-20 flex w-2 cursor-ew-resize items-center justify-center bg-transparent outline-none"
          >
            <span
              aria-hidden
              className={cn(
                "h-10 w-0.5 rounded-full bg-sidebar-border opacity-0 transition-opacity",
                isDragging ? "opacity-100 bg-primary/65" : "group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            />
          </button>

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border pl-4 pr-2 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">AI Assistant</p>
                <p className="text-micro text-muted-foreground/70 leading-tight">
                  {providerMissing ? `${providerName} (not configured)` : `via ${providerName}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {pending && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={cancel}
                  aria-label="Cancel"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                aria-label="Close assistant"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3"
          >
            {messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ask anything study-related</p>
                  <p className="max-w-56 text-xs text-muted-foreground">
                    Quick explanations, study techniques, calendar help. Replies stay short so you can move fast.
                  </p>
                </div>
                <motion.div
                  className="grid w-full gap-1.5"
                  variants={staggerContainer(0.05, 0.08)}
                  initial="initial"
                  animate="animate"
                >
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <motion.button
                      key={prompt}
                      type="button"
                      onClick={() => void send(prompt)}
                      disabled={pending}
                      variants={staggerItem}
                      transition={reduceMotion ? { duration: 0 } : undefined}
                      className={cn(
                        "rounded-lg border border-sidebar-border bg-background/45 px-2.5 py-1.5 text-left text-xs transition-colors",
                        "hover:bg-sidebar-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
                        "disabled:opacity-50",
                      )}
                    >
                      {prompt}
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            ) : (
              messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                key="ai-error"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={reduceMotion ? { duration: 0 } : TRANSITION.exit}
                className="flex shrink-0 items-start gap-2 border-t border-sidebar-border bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <p>{error.message}</p>
                  {error.hint && (
                    <p className="mt-0.5 text-destructive/70">{error.hint}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit()
            }}
            className="flex shrink-0 items-end gap-2 border-t border-sidebar-border px-3 py-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={providerMissing ? "Configure AI in Settings to chat" : "Ask anything…"}
              disabled={providerMissing || pending}
              rows={1}
              className={cn(
                "flex-1 resize-none rounded-lg border border-input bg-background/65 px-2.5 py-1.5 text-sm outline-none",
                "transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45",
                "disabled:opacity-50 dark:bg-input/30",
              )}
            />
            <Button
              type="submit"
              size="icon-sm"
              disabled={!input.trim() || pending || providerMissing}
              className="text-background"
              aria-label="Send"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </form>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user"
  const Icon = isUser ? UserIcon : Wand2
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : TRANSITION.view}
      className={cn(
        "flex gap-2",
        isUser ? "flex-row-reverse text-right" : "flex-row",
      )}
    >
      <div
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          isUser
            ? "border-primary/30 bg-primary/15 text-primary"
            : "border-sidebar-border bg-muted/40 text-foreground/70",
        )}
        aria-hidden
      >
        <Icon className="h-3 w-3" />
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-sm bg-primary/15 text-foreground"
            : message.cancelled
              ? "rounded-tl-sm border border-sidebar-border bg-muted/35 italic text-muted-foreground"
              : "rounded-tl-sm bg-background/65 text-foreground",
        )}
      >
        {message.pending ? (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking
          </span>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
      </div>
    </motion.div>
  )
}
