import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"
import type { RemoteRow, SyncTable } from "@/lib/sync/types"

const TABLES: SyncTable[] = [
  "projects",
  "events",
  "study_sessions",
  "custom_subjects",
  "hidden_subjects",
  "timetable_config",
  "user_settings",
]

export interface RealtimeChange {
  table: SyncTable
  eventType: "INSERT" | "UPDATE" | "DELETE"
  new: RemoteRow | null
  old: Partial<RemoteRow> | null
}

export function subscribeToSyncTables({
  client,
  userId,
  onChange,
  onReconnectNeeded,
}: {
  client: SupabaseClient
  userId: string
  onChange: (change: RealtimeChange) => void
  onReconnectNeeded: () => void
}): () => void {
  const channels: RealtimeChannel[] = TABLES.map((table) => {
    const channel = client
      .channel(`focal-sync-${table}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          onChange({
            table,
            eventType: payload.eventType,
            new: parseRemotePayload(payload.new),
            old: parseRemotePayload(payload.old),
          })
        },
      )
      .subscribe((status) => {
        const statusText = String(status)
        if (statusText === "CHANNEL_ERROR" || statusText === "TIMED_OUT") {
          onReconnectNeeded()
        }
      })

    return channel
  })

  return () => {
    channels.forEach((channel) => {
      void client.removeChannel(channel)
    })
  }
}

function parseRemotePayload(value: unknown): RemoteRow | null {
  if (typeof value !== "object" || value === null || Object.keys(value).length === 0) return null
  return value as RemoteRow
}
