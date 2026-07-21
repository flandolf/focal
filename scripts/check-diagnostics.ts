import { buildDiagnosticReport } from "../src/lib/diagnostics"

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const report = buildDiagnosticReport({
  appVersion: "1.0.0",
  generatedAt: "2026-07-20T00:00:00.000Z",
  runtime: { online: true, language: "en-AU", platform: "test" },
  storage: {
    projects: 2,
    events: 3,
    sessions: 4,
    preferences: 5,
    pendingSyncChanges: 1,
    importedLegacySources: 3,
  },
})

assert(Object.keys(report.runtime).join() === "online,language,platform", "runtime diagnostics allowlist changed")
assert(
  Object.keys(report.storage).join() === "projects,events,sessions,preferences,pendingSyncChanges,importedLegacySources",
  "storage diagnostics allowlist changed",
)
assert(!/(title|note|path|token|secret|email|"id")/i.test(JSON.stringify(report)), "diagnostics exposed user data")
