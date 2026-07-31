import { normalizeStructuredJson, recoverFromModelDrift, validateJsonRootShape } from "../src/lib/providers/shared"
import { getReasoningConfig } from "../src/lib/settings"

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

const storedSettings = new Map([
  ["focal-reasoning-effort", "low"],
  ["focal-reasoning-max-tokens", "1234"],
])
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: { getItem: (key: string) => storedSettings.get(key) ?? null },
})
const reasoning = getReasoningConfig().reasoning
if (reasoning?.effort !== "low" || reasoning.maxTokens !== 1234 || "max_tokens" in reasoning) {
  throw new Error(`reasoning settings did not use the provider request shape: ${JSON.stringify(reasoning)}`)
}
storedSettings.set("focal-reasoning-effort", "invalid")
storedSettings.set("focal-reasoning-max-tokens", "NaN")
const fallbackReasoning = getReasoningConfig().reasoning
if (fallbackReasoning?.effort !== "medium" || fallbackReasoning.maxTokens !== 8000) {
  throw new Error("invalid persisted reasoning settings must use safe defaults")
}
Reflect.deleteProperty(globalThis, "localStorage")

const assistantSource = await fetch(new URL("../src/lib/aiAssistant.ts", import.meta.url)).then((response) => response.text())
if (!assistantSource.includes("provider.supportsReasoning ? getReasoningConfig() : {}")) {
  throw new Error("AI completions must keep reasoning settings nested under the request reasoning field")
}

console.warn("ollama structured output check passed")
