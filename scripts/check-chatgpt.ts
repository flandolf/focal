/// <reference types="node" />

import assert from "node:assert/strict"
import { handleChatGPTRequest, parseEnvList } from "../server/chatgpt"
import { toChatGPTPrompt } from "../src/lib/providers/chatgpt-prompt"
import type { ChatGPTHandler } from "@opencoredev/loginwithchatgpt-server"

assert.deepEqual(parseEnvList(" https://app.example, ,https://tauri.localhost "), [
  "https://app.example",
  "https://tauri.localhost",
])
assert.deepEqual(parseEnvList(undefined), [])

const prompt = toChatGPTPrompt([
  { role: "system", content: "Be concise." },
  { role: "system", content: "Use plain language." },
  { role: "user", content: "Explain this." },
])
assert.equal(prompt.instructions, "Be concise.\n\nUse plain language.")
assert.deepEqual(prompt.messages, [{ role: "user", content: "Explain this." }])

const toolPrompt = toChatGPTPrompt([
  {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call-123", name: "list_events", arguments: {} }],
  },
  {
    role: "tool",
    toolName: "list_events",
    toolCallId: "call-123",
    content: "No events found.",
  },
])
assert.equal(toolPrompt.messages[1]?.role, "tool")
if (toolPrompt.messages[1]?.role === "tool") {
  const firstPart = toolPrompt.messages[1].content[0]
  assert.equal(firstPart?.type, "tool-result")
  if (firstPart?.type === "tool-result") assert.equal(firstPart.toolCallId, "call-123")
}

process.env.LWC_ALLOWED_ORIGINS = "https://app.example"
const fakeAuth = {
  handler: () => Promise.resolve(new Response("ok")),
} as unknown as ChatGPTHandler
const preflight = await handleChatGPTRequest(
  new Request("https://api.example/api/chatgpt/login", {
    method: "OPTIONS",
    headers: {
      Origin: "https://app.example",
      "Access-Control-Request-Headers": "x-login-with-chatgpt-reasoning-effort",
    },
  }),
  fakeAuth,
)
assert.equal(preflight.status, 204)
assert.equal(preflight.headers.get("Access-Control-Allow-Credentials"), "true")
assert.match(preflight.headers.get("Access-Control-Allow-Headers") ?? "", /x-login-with-chatgpt-reasoning-effort/)
const response = await handleChatGPTRequest(
  new Request("https://api.example/api/chatgpt/session", {
    headers: { Origin: "https://app.example" },
  }),
  fakeAuth,
)
assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://app.example")

const errorAuth = {
  handler: () => Promise.resolve(new Response(JSON.stringify({
    error: "responses_request_failed",
    detail: "temperature is not supported for this model",
  }), {
    status: 400,
    headers: { "content-type": "application/json" },
  })),
} as unknown as ChatGPTHandler
const errorResponse = await handleChatGPTRequest(
  new Request("https://api.example/api/chatgpt/responses", {
    method: "POST",
    headers: { Origin: "https://app.example" },
  }),
  errorAuth,
)
const errorBody = await errorResponse.json() as { error?: { message?: string } }
assert.equal(errorBody.error?.message, "temperature is not supported for this model")
