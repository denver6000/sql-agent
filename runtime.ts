import {
  streamSimple,
  type Api,
  type AssistantMessage,
  type Message,
  type Model,
  type Tool,
  type ToolCall,
} from "@mariozechner/pi-ai";
import { BasicContextBuilder, type ContextBuilder } from "./context-builder.js";

export type RuntimeTool = Tool;

export type RuntimeEvent =
  | { type: "user_message"; message: Message }
  | { type: "model_start"; iteration: number }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_start"; contentIndex: number }
  | { type: "tool_call_delta"; contentIndex: number; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "assistant_message"; message: AssistantMessage }
  | { type: "runtime_error"; error: string };

export type RuntimeOptions = {
  model: Model<Api>;
  systemPrompt: string;
  tools?: RuntimeTool[];
  contextBuilder?: ContextBuilder;
  sessionId?: string;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  onEvent?: (event: RuntimeEvent) => Promise<void> | void;
};

export class Runtime {
  private readonly model: Model<Api>;
  private readonly systemPrompt: string;
  private readonly tools: RuntimeTool[];
  private readonly contextBuilder: ContextBuilder;
  private readonly sessionId?: string;
  private readonly getApiKey?: RuntimeOptions["getApiKey"];
  private readonly onEvent?: RuntimeOptions["onEvent"];
  private readonly messages: Message[] = [];

  constructor(options: RuntimeOptions) {
    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools ?? [];
    this.contextBuilder = options.contextBuilder ?? new BasicContextBuilder();
    this.sessionId = options.sessionId;
    this.getApiKey = options.getApiKey;
    this.onEvent = options.onEvent;
  }

  get transcript() {
    return [...this.messages];
  }

  async prompt(text: string, signal?: AbortSignal) {
    const userMessage: Message = { role: "user", content: text, timestamp: Date.now() };
    this.messages.push(userMessage);
    await this.emit({ type: "user_message", message: userMessage });

    await this.emit({ type: "model_start", iteration: 1 });

    const context = await this.contextBuilder.build({
      systemPrompt: this.systemPrompt,
      messages: this.messages,
      tools: this.tools.map(toToolSpec),
    });

    const stream = streamSimple(this.model, context, {
      apiKey: await this.getApiKey?.(this.model.provider),
      sessionId: this.sessionId,
      signal,
    });

    for await (const event of stream) {
      if (event.type === "text_delta") {
        await this.emit({ type: "text_delta", delta: event.delta });
      }

      if (event.type === "toolcall_start") {
        await this.emit({ type: "tool_call_start", contentIndex: event.contentIndex });
      }

      if (event.type === "toolcall_delta") {
        await this.emit({ type: "tool_call_delta", contentIndex: event.contentIndex, delta: event.delta });
      }

      if (event.type === "toolcall_end") {
        await this.emit({ type: "tool_call", toolCall: event.toolCall });
      }

      if (event.type === "error") {
        await this.emit({ type: "runtime_error", error: event.error.errorMessage ?? "Model request failed" });
      }
    }

    const assistantMessage = await stream.result();
    this.messages.push(assistantMessage);
    await this.emit({ type: "assistant_message", message: assistantMessage });

    if (assistantMessage.stopReason === "error" || assistantMessage.stopReason === "aborted") {
      throw new Error(assistantMessage.errorMessage ?? "Model request failed");
    }

    return assistantMessage;
  }

  private async emit(event: RuntimeEvent) {
    await this.onEvent?.(event);
  }
}

function toToolSpec(tool: RuntimeTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}
