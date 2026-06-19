import { parseTextEventResponse } from "../src/components/TextEventPlanner"
import type { Project, Subject } from "../src/lib/types"

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

const subjects: Subject[] = [
  { id: "math-methods", name: "Mathematical Methods", shortCode: "MM", color: "#2563eb" },
  { id: "english", name: "English", shortCode: "ENG", color: "#dc2626" },
]

const projects: Project[] = [{
  id: "calc-sac",
  name: "Calculus SAC",
  created_at: "2026-06-01T00:00:00.000Z",
  folder_path: "Calculus SAC",
  subjectId: "math-methods",
}]

const drafts = parseTextEventResponse(JSON.stringify({
  events: {
    title: "Calculus revision",
    item_type: "study",
    date: "22/06/2026",
    start_time: "3:30pm",
    duration_minutes: "75",
    event_type: "event",
    subject_id: "Methods",
    subject_ids: ["Mathematical Methods"],
    project_id: "Calculus SAC",
    description: "",
    location: "",
    topics: "derivatives",
  },
}), subjects, projects)

assertEqual(drafts.length, 1, "single object event should parse")
assertEqual(drafts[0].kind, "session", "study item type should become a session")
assertEqual(drafts[0].date, "2026-06-22", "local date should normalize")
assertEqual(drafts[0].startTime, "15:30", "ampm time should normalize")
assertEqual(drafts[0].subjectIds[0], "math-methods", "subject name should resolve to id")
assertEqual(drafts[0].projectId, "calc-sac", "project name should resolve to id")
assertEqual(drafts[0].topics?.[0], "derivatives", "single topic string should normalize to array")

const invalid = parseTextEventResponse(JSON.stringify({
  events: [{
    title: "Bad date",
    item_type: "event",
    date: "not-a-date",
    start_time: "15:30",
    duration_minutes: 60,
    event_type: "event",
    subject_id: "none",
    subject_ids: [],
    project_id: "none",
    description: "",
    location: "",
    topics: [],
  }],
}), subjects, projects)

assertEqual(invalid.length, 0, "invalid dates should be filtered")

console.warn("text event planner check passed")
