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
let capturedPull: unknown
const originalFetch = globalThis.fetch
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const bodyText = typeof init?.body === "string" ? init.body : "{}"
  capturedBody = JSON.parse(bodyText)
  if (url.endsWith("/api/tags")) {
    return Promise.resolve(Response.json({ models: [
      { name: "qwen3:8b", size: 5_200_000_000, details: { family: "qwen3", parameter_size: "8.2B", quantization_level: "Q4_K_M" } },
      { name: "nomic-embed-text:latest", details: { family: "nomic-bert" } },
    ] }))
  }
  if (url.endsWith("/api/show")) {
    const model = (capturedBody as { model?: string }).model
    return Promise.resolve(Response.json(model === "qwen3:8b"
      ? { capabilities: ["completion", "tools"], model_info: { "qwen3.context_length": 32768 } }
      : { capabilities: ["embedding"] }))
  }
  if (url.endsWith("/api/version")) return Promise.resolve(Response.json({ version: "0.12.1" }))
  if (url.endsWith("/api/pull")) {
    capturedPull = capturedBody
    return Promise.resolve(Response.json({ status: "success" }))
  }
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
  const { chooseOllamaModel, ollamaProvider, pullOllamaModel } = await import("../src/lib/providers/ollama")
  const models = await ollamaProvider.listModels()
  if (models.length !== 1 || models[0]?.id !== "qwen3:8b") throw new Error("non-chat models were not filtered")
  if (models[0].contextLength !== 32768 || !models[0].capabilities?.includes("tools")) {
    throw new Error("Ollama model details were not discovered")
  }
  if (chooseOllamaModel(models, "") !== "qwen3:8b") throw new Error("tool-capable local model was not selected")
  if (chooseOllamaModel(models, "qwen3:8b") !== null) throw new Error("valid local model selection was replaced")
  const health = await ollamaProvider.healthcheck()
  if (!health.ok || health.version !== "0.12.1" || health.modelCount !== 2) throw new Error("Ollama health details were not parsed")
  await pullOllamaModel("qwen3:8b")
  if ((capturedPull as { model?: string })?.model !== "qwen3:8b") throw new Error("Ollama pull request was not sent")

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
  console.warn("ollama integration check passed")
} finally {
  globalThis.fetch = originalFetch
}
