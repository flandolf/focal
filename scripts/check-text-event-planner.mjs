import assert from "node:assert/strict"
import { createServer } from "vite"

const server = await createServer({ appType: "custom", server: { middlewareMode: true } })

try {
  const { parseTextEventResponse } = await server.ssrLoadModule("/src/components/TextEventPlanner.tsx")
  const drafts = parseTextEventResponse(`Here you go:\n\`\`\`json
    {"events":[
      {"title":"Methods revision","item_type":"event","date":"2026-06-23","start_time":"3:30pm","duration":"1h 30m","event_type":"homework"},
      {"title":"Methods revision","item_type":"event","date":"2026-06-23","start_time":"15:30","duration_minutes":90,"event_type":"homework"},
      {"title":"Impossible date","item_type":"event","date":"2026-02-31","start_time":"15:30","duration_minutes":60,"event_type":"event"}
    ]}
  \`\`\``, [], [])

  assert.equal(drafts.length, 1, "deduplicates equivalent items and rejects rollover dates")
  assert.equal(drafts[0].startTime, "15:30", "normalises 12-hour times")
  assert.equal(drafts[0].durationMinutes, 90, "parses compact hour/minute durations")
  console.log("Text event planner parser check passed")
} finally {
  await server.close()
}
