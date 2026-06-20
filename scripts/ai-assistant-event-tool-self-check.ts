import { buildAssistantOverview, executeReadOnlyFocalToolCall, extractFollowUpPrompts, parseLooseEventCreateRequest } from "../src/components/AIAssistantPanel"

const draft = parseLooseEventCreateRequest("math methods sac 8 august 1:45pm", "2026-06-19", [
  { id: "mm", name: "Mathematical Methods", shortCode: "MCM", color: "#2563EB" },
])

const overview = buildAssistantOverview(
  [{
    id: "methods-sac",
    name: "Methods SAC",
    deadline: "2026-06-22",
    created_at: "2026-06-01",
    folder_path: "methods-sac",
  }],
  [{
    id: "session-1",
    subjectIds: ["mm"],
    title: "Methods revision",
    startTime: "2026-06-20T10:00:00",
    endTime: "2026-06-20T10:45:00",
    status: "planned",
    created_at: "2026-06-01",
  }],
  "2026-06-20",
)
if (overview.title !== "Methods SAC is due in 2 days") throw new Error(`Unexpected overview title: ${overview.title}`)
if (!overview.detail.includes("45 min")) throw new Error(`Unexpected overview detail: ${overview.detail}`)

const reply = extractFollowUpPrompts("Start with Methods.\n\n[[follow-up: Plan that session for me]]\n[[follow-up: Show my other deadlines]]")
if (reply.content !== "Start with Methods.") throw new Error(`Unexpected cleaned reply: ${reply.content}`)
if (reply.followUps.length !== 2 || reply.followUps[0] !== "Plan that session for me") {
  throw new Error(`Unexpected follow-ups: ${reply.followUps.join(", ")}`)
}

if (!draft) throw new Error("expected loose event draft")
if (draft.title !== "Math Methods SAC") throw new Error(`bad title: ${draft.title}`)
if (draft.eventType !== "sac") throw new Error(`bad event type: ${draft.eventType}`)
if (draft.subjectId !== "mm") throw new Error(`bad subject: ${draft.subjectId}`)
if (!draft.startTime) throw new Error("missing start time")
if (!draft.startTime.startsWith("2026-08-08T")) throw new Error(`bad date: ${draft.startTime}`)

const deadlineReply = executeReadOnlyFocalToolCall(
  { name: "list_deadlines", arguments: { query: "math methods sac", startDate: "2026-08-06", endDate: "2026-08-06" } },
  {
    projects: [
      {
        id: "p1",
        name: "Methods SAC",
        deadline: "2026-08-06",
        deadlineType: "sac",
        subjectId: "mm",
        created_at: "2026-06-01",
        folder_path: "Methods SAC",
      },
    ],
    subjects: [{ id: "mm", name: "Mathematical Methods", shortCode: "MCM", color: "#2563EB" }],
    today: "2026-06-19",
  },
)

if (!deadlineReply) throw new Error("expected deadline reply")
if (deadlineReply.includes("do not have information")) throw new Error(`bad deadline reply: ${deadlineReply}`)
if (!deadlineReply.includes("Methods SAC")) throw new Error(`missing deadline: ${deadlineReply}`)
if (!deadlineReply.includes("2026-08-06")) throw new Error(`missing deadline date: ${deadlineReply}`)

const nextSacsReply = executeReadOnlyFocalToolCall(
  { name: "list_deadlines", arguments: { query: "sac", range: "all_upcoming" } },
  {
    projects: [
      {
        id: "p1",
        name: "Methods SAC",
        deadline: "2026-08-06",
        deadlineType: "sac",
        subjectId: "mm",
        created_at: "2026-06-01",
        folder_path: "Methods SAC",
      },
    ],
    subjects: [{ id: "mm", name: "Mathematical Methods", shortCode: "MCM", color: "#2563EB" }],
    today: "2026-06-19",
  },
)

if (!nextSacsReply?.includes("Methods SAC")) throw new Error(`next SAC lookup failed: ${nextSacsReply}`)

const overFilteredReply = executeReadOnlyFocalToolCall(
  { name: "list_deadlines", arguments: { query: "math methods sac", range: "next_14_days" } },
  {
    projects: [
      {
        id: "p1",
        name: "Methods SAC",
        deadline: "2026-08-06",
        deadlineType: "sac",
        subjectId: "mm",
        created_at: "2026-06-01",
        folder_path: "Methods SAC",
      },
    ],
    subjects: [{ id: "mm", name: "Mathematical Methods", shortCode: "MCM", color: "#2563EB" }],
    today: "2026-06-19",
  },
)

if (!overFilteredReply?.includes("outside that range")) throw new Error(`missing outside-range hint: ${overFilteredReply}`)
if (!overFilteredReply.includes("2026-08-06")) throw new Error(`outside-range SAC date missing: ${overFilteredReply}`)

const subjectReply = executeReadOnlyFocalToolCall(
  { name: "list_subjects", arguments: { query: "math methods" } },
  {
    subjects: [{ id: "mm", name: "Mathematical Methods", shortCode: "MCM", color: "#2563EB" }],
    today: "2026-06-19",
  },
)

if (!subjectReply?.includes("call list_deadlines next")) throw new Error(`missing subject follow-up hint: ${subjectReply}`)
