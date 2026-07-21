import { getVersion } from "@tauri-apps/api/app"
import { openFocalDatabase } from "@/lib/storage/database"

interface CountRow {
  count: number
}

interface DiagnosticInput {
  appVersion: string
  generatedAt: string
  runtime: { online: boolean | null; language: string | null; platform: string | null }
  storage: {
    projects: number
    events: number
    sessions: number
    preferences: number
    pendingSyncChanges: number
    importedLegacySources: number
  }
}

async function count(query: string, bindings: unknown[] = []): Promise<number> {
  const rows = await (await openFocalDatabase()).select<CountRow[]>(query, bindings)
  return rows[0]?.count ?? 0
}

export function buildDiagnosticReport(input: DiagnosticInput) {
  const { appVersion, generatedAt } = input
  const { online, language, platform } = input.runtime
  const { projects, events, sessions, preferences, pendingSyncChanges, importedLegacySources } = input.storage
  // ponytail: counts and runtime flags are enough for support; never include user content, paths, IDs, or secrets.
  return {
    diagnosticSchemaVersion: 1,
    generatedAt,
    appVersion,
    runtime: { online, language, platform },
    storage: {
      projects,
      events,
      sessions,
      preferences,
      pendingSyncChanges,
      importedLegacySources,
    },
  }
}

export async function createDiagnosticReport() {
  const [appVersion, projects, events, sessions, preferences, pendingSyncChanges, importedLegacySources] = await Promise.all([
    getVersion().catch(() => "browser-development"),
    count("select count(*) as count from records where kind = $1", ["projects"]),
    count("select count(*) as count from records where kind = $1", ["events"]),
    count("select count(*) as count from records where kind = $1", ["study_sessions"]),
    count("select count(*) as count from preferences"),
    count("select count(*) as count from sync_outbox"),
    count("select count(*) as count from legacy_imports"),
  ])
  return buildDiagnosticReport({
    appVersion,
    generatedAt: new Date().toISOString(),
    runtime: {
      online: typeof navigator === "undefined" ? null : navigator.onLine,
      language: typeof navigator === "undefined" ? null : navigator.language,
      platform: typeof navigator === "undefined" ? null : navigator.platform,
    },
    storage: { projects, events, sessions, preferences, pendingSyncChanges, importedLegacySources },
  })
}
