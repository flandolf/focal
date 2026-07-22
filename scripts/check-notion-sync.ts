import {
  isAlreadyArchivedNotionError,
  isRetryableNotionError,
  NotionApiError,
  isRetryableNotionReadError,
  notionReadRetryDelay,
} from "../src/lib/notion/api"
import {
  FOCAL_ID_PROPERTY,
  FOCAL_KIND_PROPERTY,
  focalIdentityProperties,
  createSyncCtx,
  getFocalId,
  getFocalKind,
  richTextValue,
} from "../src/lib/notion/schema"
import { buildPageChildrenForSync, notionWriteRetryDelay } from "../src/lib/notion/push"
import { notionIntentDue, retryNotionIntent } from "../src/lib/notion/outbox"
import { planDuplicateNotionPages } from "../src/lib/notion"
import { pullFromNotion } from "../src/lib/notion/pull"
import type { CalendarEvent } from "../src/lib/types"

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const archiveIntent = {
  dataSourceId: "database",
  kind: "event" as const,
  localId: "event-1",
  operation: "archive" as const,
  pageId: "page-1",
  createdAt: "2026-07-20T00:00:00.000Z",
  retryCount: 0,
}
const retriedIntent = retryNotionIntent(archiveIntent, "offline", "2026-07-20T00:00:00.000Z")
assert(retriedIntent.retryCount === 1, "failed Notion deletes must remain durable for retry")
assert(!notionIntentDue(retriedIntent, "2026-07-20T00:00:04.000Z"), "Notion retries must respect backoff")
assert(notionIntentDue(retriedIntent, "2026-07-20T00:00:05.000Z"), "Notion retries must become due")

assert(isRetryableNotionReadError("NETWORK_ERROR"), "network read failures should retry")
assert(isRetryableNotionReadError("rate_limited"), "rate-limited reads should retry")
assert(!isRetryableNotionReadError("unauthorized"), "authorization failures must fail immediately")
assert(notionReadRetryDelay(0) === 500, "first Notion read retry should wait 500ms")
assert(notionReadRetryDelay(1) === 1000, "Notion read retry delay should back off")
const rateLimitError = new NotionApiError({ code: "rate_limited", message: "slow down", retry_after_ms: 2_500 })
assert(isRetryableNotionError(rateLimitError), "typed transient Notion write errors should retry")
assert(!isRetryableNotionError(new Error("validation failed")), "untyped validation failures must not retry")
assert(notionWriteRetryDelay(rateLimitError, 0, 0) === 2_500, "Notion writes must honor Retry-After")
assert(
  isAlreadyArchivedNotionError({ code: "validation_error", message: "Can't edit block that is archived." }),
  "archiving an already archived Notion page must be idempotent",
)
assert(
  isAlreadyArchivedNotionError({ code: "object_not_found", message: "missing" }),
  "archiving a Notion page that is already gone must be idempotent",
)
assert(richTextValue("x".repeat(2_001)).length === 2, "long Notion text must be split at the API boundary")
assert(
  !isAlreadyArchivedNotionError({ code: "validation_error", message: "Property is invalid" }),
  "unrelated Notion validation errors must still fail",
)
assert(
  buildPageChildrenForSync(undefined, undefined) === undefined,
  "items without a synced body must preserve Notion-only page content",
)
assert(
  JSON.stringify(buildPageChildrenForSync(undefined, "old-hash")) === "[]",
  "removing a previously synced description must clear the Notion page body",
)

const identity = focalIdentityProperties("session-1", "session")
assert(FOCAL_ID_PROPERTY in identity && FOCAL_KIND_PROPERTY in identity, "Notion writes must include stable Focal identity properties")
const identityPage = {
  id: "page-1",
  properties: {
    [FOCAL_ID_PROPERTY]: { type: "rich_text", rich_text: [{ plain_text: "session-1" }] },
    [FOCAL_KIND_PROPERTY]: { type: "rich_text", rich_text: [{ plain_text: "session" }] },
  },
}
assert(getFocalId(identityPage) === "session-1", "Notion Focal IDs must round-trip")
assert(getFocalKind(identityPage) === "session", "Notion Focal kinds must round-trip")
const notionSettings = {
  token: "test",
  dataSourceId: "database",
  titleProperty: "Name",
  dateProperty: "Deadline",
  typeProperty: "Type",
  completedProperty: "Complete",
  subjectProperty: "Subject",
}
const commonProperties = {
  Name: { type: "title", title: [{ plain_text: "Focus" }] },
  Deadline: { type: "date", date: { start: "2026-07-20T01:00:00.000Z", end: "2026-07-20T01:30:00.000Z" } },
  Type: { type: "select", select: { name: "Study Session" } },
  Complete: { type: "checkbox", checkbox: true },
  Subject: { type: "select", select: { name: "Mathematical Methods" } },
}
const untaggedTwin = { id: "legacy-page", properties: commonProperties }
const taggedTwin = { ...identityPage, properties: { ...commonProperties, ...identityPage.properties } }
const duplicatePlan = planDuplicateNotionPages(
  [taggedTwin, untaggedTwin],
  new Set([taggedTwin.id]),
  new Set(),
  notionSettings,
)
assert(duplicatePlan.archiveIds.has("legacy-page"), "a tagged canonical page must replace its untagged legacy twin")
const secondTaggedPage = {
  id: "page-2",
  properties: {
    ...commonProperties,
    [FOCAL_ID_PROPERTY]: { type: "rich_text", rich_text: [{ plain_text: "session-2" }] },
    [FOCAL_KIND_PROPERTY]: { type: "rich_text", rich_text: [{ plain_text: "session" }] },
  },
}
const distinctPlan = planDuplicateNotionPages(
  [taggedTwin, secondTaggedPage],
  new Set(),
  new Set(),
  notionSettings,
)
assert(distinctPlan.archiveIds.size === 0, "distinct tagged Focal items must not be collapsed by matching content")

const localEvent: CalendarEvent = {
  id: "event-1",
  title: "Local title",
  startTime: "2026-07-20T01:00:00.000Z",
  endTime: "2026-07-20T01:30:00.000Z",
  eventType: "event",
  created_at: "2026-07-19T00:00:00.000Z",
  updated_at: "2026-07-20T00:30:00.000Z",
  source: {
    type: "notion",
    id: "event-page",
    kind: "event",
    lastEditedTime: "2026-07-20T00:00:00.000Z",
  },
}
const remoteEventPage = {
  id: "event-page",
  last_edited_time: "2026-07-20T00:45:00.000Z",
  properties: {
    Name: { type: "title", title: [{ plain_text: "Notion title" }] },
    Deadline: { type: "date", date: { start: localEvent.startTime, end: localEvent.endTime } },
    Type: { type: "select", select: { name: "Event" } },
    Complete: { type: "checkbox", checkbox: false },
    [FOCAL_ID_PROPERTY]: { type: "rich_text", rich_text: [{ plain_text: localEvent.id }] },
    [FOCAL_KIND_PROPERTY]: { type: "rich_text", rich_text: [{ plain_text: "event" }] },
  },
}
const conflictCtx = createSyncCtx(new Set([localEvent.id]), new Set())
pullFromNotion([remoteEventPage], [localEvent], [], notionSettings, [], conflictCtx)
assert(conflictCtx.conflicts === 1, "simultaneous local and Notion edits must produce a conflict")
assert(conflictCtx.updatedEvents.size === 0, "a conflict must not overwrite the local event before resolution")
assert(
  conflictCtx.conflictItems[0]?.remoteUpdates.title === "Notion title",
  "the conflict must retain a separate remote snapshot",
)
const remoteOnlyCtx = createSyncCtx()
pullFromNotion([remoteEventPage], [localEvent], [], notionSettings, [], remoteOnlyCtx)
assert(remoteOnlyCtx.conflicts === 0, "a Notion-only edit should not create a false conflict")
assert(remoteOnlyCtx.updatedEvents.get(localEvent.id)?.title === "Notion title", "a Notion-only edit should pull normally")
const recoveryCtx = createSyncCtx()
pullFromNotion([remoteEventPage], [], [], notionSettings, [], recoveryCtx)
assert(recoveryCtx.created[0]?.id === localEvent.id, "a tagged Notion page must restore its stable Focal id on a new device")

const rustSource = await fetch(new URL("../src-tauri/src/commands/notion.rs", import.meta.url)).then((response) => response.text())
assert(
  rustSource.indexOf("Append the replacement before retiring") < rustSource.indexOf("Sequential deletes avoid"),
  "Notion body replacement must append the new durable copy before deleting the old one",
)
assert(
  rustSource.includes("Notion repeated a pagination cursor"),
  "Notion pagination must stop if the API repeats a cursor",
)
assert(
  rustSource.includes("retry_after_ms,"),
  "Notion query and child-write errors must preserve Retry-After",
)
const pushSource = await fetch(new URL("../src/lib/notion/push.ts", import.meta.url)).then((response) => response.text())
assert(pushSource.includes("processNotionArchiveIntents"), "Notion deletes must use the durable intent outbox")
assert(!pushSource.includes("taggedNotionOrphanIds"), "Notion pages must never be deleted merely because local data is absent")
assert(
  pushSource.includes("Notion create outcome is uncertain; it will be verified on the next sync"),
  "an unverifiable Notion create must not be retried into a duplicate page",
)
assert(
  pushSource.includes("bodyDiffers ? children : undefined"),
  "property-only pushes must preserve body edits made directly in Notion",
)
const notionHookSource = await fetch(new URL("../src/hooks/useNotionSync.ts", import.meta.url)).then((response) => response.text())
assert(
  notionHookSource.includes("id: conflict.notionPageId"),
  "keeping a local conflict must update the captured Notion page rather than create a duplicate",
)

console.warn("Notion sync checks passed")
