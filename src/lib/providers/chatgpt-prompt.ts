import type { ModelMessage } from "ai"
import type { ChatCompletionRequest } from "@/lib/providers/types"

type ChatGPTMessage = ChatCompletionRequest["messages"][number]

function toModelMessage(message: Exclude<ChatGPTMessage, { role: "system" }>): ModelMessage {
  if (message.role === "tool") {
    const toolName = message.toolName ?? "unknown"
    return {
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: message.toolCallId ?? toolName,
        toolName,
        output: { type: "text", value: message.content },
      }],
    }
  }
  if (message.role !== "assistant" || !message.toolCalls?.length) {
    return { role: message.role, content: message.content }
  }
  return {
    role: "assistant",
    content: [
      ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
      ...message.toolCalls.map((call, index) => ({
        type: "tool-call" as const,
        toolCallId: call.id ?? `${call.name}-${index}`,
        toolName: call.name,
        input: call.arguments,
      })),
    ],
  }
}

export function toChatGPTPrompt(messages: ChatCompletionRequest["messages"]): {
  instructions?: string
  messages: ModelMessage[]
} {
  const systemMessages = messages.filter((message) => message.role === "system")
  const promptMessages = messages.filter(
    (message): message is Exclude<ChatGPTMessage, { role: "system" }> => message.role !== "system",
  )
  const instructions = systemMessages.map((message) => message.content.trim()).filter(Boolean).join("\n\n")

  return {
    ...(instructions ? { instructions } : {}),
    messages: promptMessages.map((message) => toModelMessage(message)),
  }
}
