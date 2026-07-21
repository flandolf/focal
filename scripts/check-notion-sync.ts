import {
  isAlreadyArchivedNotionError,
  isRetryableNotionReadError,
  notionReadRetryDelay,
} from "../src/lib/notion/api"
import {
  FOCAL_ID_PROPERTY,
  FOCAL_KIND_PROPERTY,
  focalIdentityProperties,
  getFocalId,
  getFocalKind,
} from "../src/lib/notion/schema"
import { buildPageChildrenForSync, retainFailedNotionDeletes, taggedNotionOrphanIds } from "../src/lib/notion/push"
import { planDuplicateNotionPages } from "../src/lib/notion"

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

const retained = retainFailedNotionDeletes(
  new Set(["active"]),
  ["deleted", "retry"],
  new Set(["deleted"]),
)
assert(
  JSON.stringify([...retained].sort()) === JSON.stringify(["active", "retry"]),
  "failed Notion deletions must remain queued for the next sync",
)

assert(isRetryableNotionReadError("NETWORK_ERROR"), "network read failures should retry")
assert(isRetryableNotionReadError("rate_limited"), "rate-limited reads should retry")
assert(!isRetryableNotionReadError("unauthorized"), "authorization failures must fail immediately")
assert(notionReadRetryDelay(0) === 500, "first Notion read retry should wait 500ms")
assert(notionReadRetryDelay(1) === 1000, "Notion read retry delay should back off")
assert(
  isAlreadyArchivedNotionError({ code: "validation_error", message: "Can't edit block that is archived." }),
  "archiving an already archived Notion page must be idempotent",
)
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
assert(
  JSON.stringify(taggedNotionOrphanIds([identityPage], new Set(), new Set(), new Set())) === JSON.stringify(["page-1"]),
  "a tagged Notion page must be archived after its Focal item is deleted",
)
assert(
  taggedNotionOrphanIds([identityPage], new Set(), new Set(["session-1"]), new Set()).length === 0,
  "a tagged Notion page must remain while its Focal item exists",
)

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

console.warn("Notion sync checks passed")
