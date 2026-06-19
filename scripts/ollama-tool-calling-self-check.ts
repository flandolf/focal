const storage = new Map<string, string>([
  ["focal-ollama-base-url", "http://localhost:11434"],
  ["focal-ollama-model", "qwen3"],
])

export {}

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  },
})

let capturedBody: unknown
const originalFetch = globalThis.fetch
globalThis.fetch = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const bodyText = typeof init?.body === "string" ? init.body : "{}"
  capturedBody = JSON.parse(bodyText)
  return Promise.resolve(new Response(JSON.stringify({
    message: {
      content: "",
      tool_calls: [{
        type: "function",
        function: {
          name: "create_event",
          arguments: { title: "Math Methods SAC", eventType: "sac" },
        },
      }],
    },
    done_reason: "stop",
  }), { status: 200, headers: { "Content-Type": "application/json" } }))
}

try {
  const { ollamaProvider } = await import("../src/lib/providers/ollama")
  const result = await ollamaProvider.chatCompletion({
    model: "qwen3",
    messages: [{ role: "user", content: "create an event" }],
    tools: [{
      type: "function",
      function: {
        name: "create_event",
        description: "Create an event",
        parameters: { type: "object", properties: { title: { type: "string" } } },
      },
    }],
  })

  if (!capturedBody || typeof capturedBody !== "object") throw new Error("missing request body")
  const body = capturedBody as { tools?: unknown }
  if (!Array.isArray(body.tools) || body.tools.length !== 1) throw new Error("tools were not sent to Ollama")
  if (result.toolCalls?.[0]?.name !== "create_event") throw new Error("tool call name was not parsed")
  if (result.toolCalls[0].arguments.title !== "Math Methods SAC") throw new Error("tool call arguments were not parsed")
} finally {
  globalThis.fetch = originalFetch
}
