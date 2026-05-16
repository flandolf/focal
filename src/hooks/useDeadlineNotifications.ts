import { useEffect } from "react"
import { parseISO, differenceInHours } from "date-fns"
import { toast } from "sonner"
import type { Project } from "@/lib/types"

export function useDeadlineNotifications(projects: Project[]) {
  useEffect(() => {
    const now = new Date()
    const notifiedKey = "focal-notified-deadlines"
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const notified = new Set(JSON.parse(localStorage.getItem(notifiedKey) ?? "[]"))

    // Check for upcoming deadlines
    projects.forEach((p) => {
      if (!p.deadline || notified.has(p.id)) return

      const deadlineDate = parseISO(p.deadline)
      const hoursUntil = differenceInHours(deadlineDate, now)

      // Show notification if deadline is within 72 hours and not yet passed
      if (hoursUntil > 0 && hoursUntil <= 72) {
        // Only notify once per deadline
        notified.add(p.id)
        localStorage.setItem(notifiedKey, JSON.stringify(Array.from(notified)))

        if (hoursUntil <= 24) {
          toast.error(
            `⚠️ ${p.name} is due in ${hoursUntil} hour${hoursUntil !== 1 ? "s" : ""}!`,
            { duration: 6000 }
          )
        } else if (hoursUntil <= 48) {
          toast.warning(
            `📌 ${p.name} is due in ${Math.ceil(hoursUntil / 24)} day${Math.ceil(hoursUntil / 24) !== 1 ? "s" : ""}`,
            { duration: 5000 }
          )
        } else {
          toast.info(
            `📅 Reminder: ${p.name} due in 3 days`,
            { duration: 4000 }
          )
        }
      }
    })
  }, [projects])
}
