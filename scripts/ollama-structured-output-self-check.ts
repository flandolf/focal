import { normalizeStructuredJson, recoverFromModelDrift, validateJsonRootShape } from "../src/lib/providers/shared"

function assertJsonEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`)
  }
}

function assertShapeMatches(value: unknown, message: string): void {
  const shape = validateJsonRootShape(value, textEventsSchema)
  if (!shape.matches) {
    throw new Error(`${message}: missing ${shape.missingRootKeys.join(", ") || "(unknown)"}`)
  }
}

const textEventsSchema = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
      },
    },
  },
  required: ["events"],
}

const event = { title: "Methods SAC", date: "2026-06-22", start_time: "15:30" }

const rootArray = recoverFromModelDrift([event], textEventsSchema).value
assertJsonEqual(rootArray, { events: [event] }, "root array should rewrap under events")
assertShapeMatches(rootArray, "rewrapped root array should match schema root")

const arrayKeyObject = recoverFromModelDrift({ events: { event } }, textEventsSchema).value
assertJsonEqual(arrayKeyObject, { events: [event] }, "events object wrapper should become an events array")
assertShapeMatches(arrayKeyObject, "rewrapped events object should match schema root")

const wrongSingleRoot = recoverFromModelDrift({ event }, textEventsSchema).value
assertJsonEqual(wrongSingleRoot, { events: [event] }, "single wrong root key should rewrap under events")
assertShapeMatches(wrongSingleRoot, "rewrapped wrong root key should match schema root")

const alreadyCorrect = { events: [event] }
assertJsonEqual(recoverFromModelDrift(alreadyCorrect, textEventsSchema).value, alreadyCorrect, "valid events array should be untouched")

const normalized = normalizeStructuredJson("```json\n{\"events\":{\"event\":{\"title\":\"Methods SAC\"}}}\n```", textEventsSchema)
if (!normalized.matches || !normalized.recovered) {
  throw new Error("normalized structured JSON should recover fenced object wrappers")
}
assertJsonEqual(JSON.parse(normalized.content), { events: [{ title: "Methods SAC" }] }, "normalized content should be parseable recovered JSON")

console.warn("ollama structured output check passed")
