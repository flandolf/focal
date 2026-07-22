import { useEffect } from "react"
import { parseISO, differenceInHours } from "date-fns"
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification"
import { toast } from "sonner"
import { getDeadlineTypeInfo } from "@/lib/utils"
import type { CalendarEvent, Project, StudySession } from "@/lib/types"

type NotificationUrgency = "critical" | "warning" | "info"
type LeadWindow = "due-now" | "today" | "tomorrow" | "soon"

interface StudyNotification {
  id: string
  title: string
  body: string
  toastMessage: string
  urgency: NotificationUrgency
  leadWindow: LeadWindow
  hoursUntil: number
}

const MAX_ALERTS_PER_DAY = 5
const MAX_NATIVE_NOTIFICATIONS_PER_DAY = 3
const NOTIFICATION_STATE_KEY = "focal-study-notification-state"
const LEGACY_PROJECT_NOTIFIED_KEY = "focal-notified-deadlines"
const LEGACY_EVENT_NOTIFIED_KEY = "focal-notified-events"
const PERMISSION_PROMPTED_KEY = "focal-notification-permission-prompted"

interface NotificationState {
  sent: Record<string, string[]>
  dailyCounts: Record<string, number>
  dailyNativeCounts: Record<string, number>
}

function getLeadWindow(hoursUntil: number): LeadWindow | null {
  if (hoursUntil <= 0) return null
  if (hoursUntil <= 3) return "due-now"
  if (hoursUntil <= 24) return "today"
  if (hoursUntil <= 48) return "tomorrow"
  if (hoursUntil <= 72) return "soon"
  return null
}

function readNotificationState(): NotificationState {
  try {
    const state = JSON.parse(localStorage.getItem(NOTIFICATION_STATE_KEY) ?? "{}") as Partial<NotificationState>
    return {
      sent: state.sent ?? {},
      dailyCounts: state.dailyCounts ?? {},
      dailyNativeCounts: state.dailyNativeCounts ?? {},
    }
  } catch {
    return { sent: {}, dailyCounts: {}, dailyNativeCounts: {} }
  }
}

function writeNotificationState(state: NotificationState) {
  localStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(state))
}

function getLocalDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getPlural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`
}

function getRelativeLead(hoursUntil: number, leadWindow: LeadWindow) {
  if (leadWindow === "soon") return "in 3 days"
  if (leadWindow === "tomorrow") return `in ${getPlural(Math.ceil(hoursUntil / 24), "day")}`
  return `in ${getPlural(Math.max(1, Math.ceil(hoursUntil)), "hour")}`
}

async function canSendNativeNotifications() {
  try {
    let permissionGranted = await isPermissionGranted()

    if (!permissionGranted && localStorage.getItem(PERMISSION_PROMPTED_KEY) !== "true") {
      localStorage.setItem(PERMISSION_PROMPTED_KEY, "true")
      const permission = await requestPermission()
      permissionGranted = permission === "granted"
    }

    return permissionGranted
  } catch {
    return false
  }
}

function showToast(notification: StudyNotification) {
  const options = { duration: notification.urgency === "critical" ? 6000 : notification.urgency === "warning" ? 5000 : 4000 }

  if (notification.urgency === "critical") {
    toast.error(notification.toastMessage, options)
  } else if (notification.urgency === "warning") {
    toast.warning(notification.toastMessage, options)
  } else {
    toast.info(notification.toastMessage, options)
  }
}

function createProjectNotification(project: Project, now: Date): StudyNotification | null {
  if (!project.deadline || project.isFinished) return null

  const deadlineDate = parseISO(project.deadline)
  if (Number.isNaN(deadlineDate.getTime())) return null

  const hoursUntil = differenceInHours(deadlineDate, now)
  const leadWindow = getLeadWindow(hoursUntil)
  if (!leadWindow) return null

  const relativeLead = getRelativeLead(hoursUntil, leadWindow)
  const label = project.deadlineType ? getDeadlineTypeInfo(project.deadlineType).label : "Assessment"

  return {
    id: `project:${project.id}`,
    title: leadWindow === "due-now" ? `${project.name} is close` : `${label} due ${relativeLead}`,
    body: `${project.name} is due ${relativeLead}. Plan a focused study block before it slips.`,
    toastMessage: `${project.name} is due ${relativeLead}`,
    urgency: leadWindow === "due-now" || leadWindow === "today" ? "critical" : leadWindow === "tomorrow" ? "warning" : "info",
    leadWindow,
    hoursUntil,
  }
}

function createEventNotification(event: CalendarEvent, now: Date): StudyNotification | null {
  if (event.isFinished) return null

  const eventDate = parseISO(event.startTime)
  if (Number.isNaN(eventDate.getTime())) return null

  const hoursUntil = differenceInHours(eventDate, now)
  const leadWindow = getLeadWindow(hoursUntil)
  if (!leadWindow) return null

  const relativeLead = getRelativeLead(hoursUntil, leadWindow)

  return {
    id: `event:${event.id}`,
    title: `${event.title} starts ${relativeLead}`,
    body: "Check what you need and leave enough time to prepare.",
    toastMessage: `${event.title} starts ${relativeLead}`,
    urgency: leadWindow === "due-now" || leadWindow === "today" ? "critical" : leadWindow === "tomorrow" ? "warning" : "info",
    leadWindow,
    hoursUntil,
  }
}

function createSessionNotification(session: StudySession, now: Date): StudyNotification | null {
  if (session.status !== "planned") return null

  const sessionDate = parseISO(session.startTime)
  if (Number.isNaN(sessionDate.getTime())) return null

  const hoursUntil = differenceInHours(sessionDate, now)
  const leadWindow = getLeadWindow(hoursUntil)
  if (!leadWindow || leadWindow === "soon") return null

  const relativeLead = getRelativeLead(hoursUntil, leadWindow)

  return {
    id: `session:${session.id}`,
    title: `Study session ${relativeLead}`,
    body: `${session.title} starts ${relativeLead}. Keep it focused and achievable.`,
    toastMessage: `${session.title} starts ${relativeLead}`,
    urgency: leadWindow === "due-now" ? "critical" : "warning",
    leadWindow,
    hoursUntil,
  }
}

async function dispatchNotifications(notifications: StudyNotification[], now: Date) {
  if (notifications.length === 0) return

  const state = readNotificationState()
  const dayKey = getLocalDayKey(now)
  let dailyAlertCount = state.dailyCounts[dayKey] ?? 0
  let dailyNativeCount = state.dailyNativeCounts[dayKey] ?? 0
  const canSendNative = await canSendNativeNotifications()

  const dueNotifications = notifications
    .filter((notification) => !(state.sent[notification.id] ?? []).includes(notification.leadWindow))
    .sort((a, b) => a.hoursUntil - b.hoursUntil)

  for (const notification of dueNotifications) {
    if (dailyAlertCount >= MAX_ALERTS_PER_DAY) break

    showToast(notification)
    dailyAlertCount += 1

    if (canSendNative && dailyNativeCount < MAX_NATIVE_NOTIFICATIONS_PER_DAY) {
      try {
        sendNotification({
          title: notification.title,
          body: notification.body,
        })
        dailyNativeCount += 1
      } catch {
        // Toasts are still shown when native delivery fails.
      }
    }

    state.sent[notification.id] = [...(state.sent[notification.id] ?? []), notification.leadWindow]
    state.dailyCounts[dayKey] = dailyAlertCount
    state.dailyNativeCounts[dayKey] = dailyNativeCount
    writeNotificationState(state)
  }
}

function migrateLegacyNotificationState() {
  const state = readNotificationState()

  try {
    const notifiedProjects = JSON.parse(localStorage.getItem(LEGACY_PROJECT_NOTIFIED_KEY) ?? "[]") as string[]
    notifiedProjects.forEach((id) => {
      state.sent[`project:${id}`] = state.sent[`project:${id}`] ?? ["soon"]
    })
  } catch {
    // Ignore malformed legacy notification state.
  }

  try {
    const notifiedEvents = JSON.parse(localStorage.getItem(LEGACY_EVENT_NOTIFIED_KEY) ?? "[]") as string[]
    notifiedEvents.forEach((id) => {
      state.sent[`event:${id}`] = state.sent[`event:${id}`] ?? ["soon"]
    })
  } catch {
    // Ignore malformed legacy notification state.
  }

  writeNotificationState(state)
}

export function useDeadlineNotifications(projects: Project[], events: CalendarEvent[] = [], sessions: StudySession[] = []) {
  useEffect(() => {
    const now = new Date()
    migrateLegacyNotificationState()

    const notifications = [
      ...projects.map((project) => createProjectNotification(project, now)),
      ...events.map((event) => createEventNotification(event, now)),
      ...sessions.map((session) => createSessionNotification(session, now)),
    ].filter((notification): notification is StudyNotification => notification !== null)

    void dispatchNotifications(notifications, now)
  }, [projects, events, sessions])
}
