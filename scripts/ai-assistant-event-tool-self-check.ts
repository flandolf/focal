import { executeReadOnlyFocalToolCall, parseLooseEventCreateRequest } from "../src/components/AIAssistantPanel"

const draft = parseLooseEventCreateRequest("math methods sac 8 august 1:45pm", "2026-06-19", [
  { id: "mm", name: "Mathematical Methods", shortCode: "MCM", color: "#2563EB" },
])

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
