import {
  streamSimple,
  type Api,
  type AssistantMessage,
  type Message,
  type Model,
  type TextContent,
  type Tool,
  type ToolCall,
  type ToolResultMessage,
} from "@mariozechner/pi-ai";
import { BasicContextBuilder, type ContextBuilder } from "./context-builder.js";
import type { RuntimePackage } from "./package-manager.js";

export type ToolExecutionContext = {
  toolCall: ToolCall;
  signal?: AbortSignal;
};

export type ToolExecutionResult =
  | string
  | {
      content: string | TextContent[];
      details?: unknown;
      isError?: boolean;
    };

export type RuntimeTool = Tool & {
  execute?: (
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult> | ToolExecutionResult;
};

export type ToolResolver = {
  resolve(toolName: string): RuntimeTool | undefined;
};

export type RuntimeEvent =
  | { type: "user_message"; message: Message }
  | { type: "model_start"; iteration: number }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_start"; contentIndex: number }
  | { type: "tool_call_delta"; contentIndex: number; delta: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_execution_start"; toolCall: ToolCall }
  | { type: "tool_execution_result"; toolCall: ToolCall; message: ToolResultMessage }
  | { type: "assistant_message"; message: AssistantMessage }
  | { type: "runtime_error"; error: string };

export type RuntimeOptions = {
  model: Model<Api>;
  systemPrompt: string;
  tools?: RuntimeTool[];
  maxIterations?: number;
  toolResolver?: ToolResolver;
  contextBuilder?: ContextBuilder;
  runtimePackage?: RuntimePackage;
  sessionId?: string;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  onEvent?: (event: RuntimeEvent) => Promise<void> | void;
};

export class Runtime {
  private readonly model: Model<Api>;
  private readonly systemPrompt: string;
  private readonly tools: RuntimeTool[];
  private readonly maxIterations: number;
  private readonly toolResolver: ToolResolver;
  private readonly contextBuilder: ContextBuilder;
  private readonly runtimePackage?: RuntimePackage;
  private readonly sessionId?: string;
  private readonly getApiKey?: RuntimeOptions["getApiKey"];
  private readonly onEvent?: RuntimeOptions["onEvent"];
  private readonly messages: Message[] = [];

  constructor(options: RuntimeOptions) {
    this.model = options.model;
    this.systemPrompt = options.systemPrompt;
    this.tools = options.tools ?? [];
    this.maxIterations = options.maxIterations ?? 8;
    this.toolResolver = options.toolResolver ?? new RuntimeToolRegistry(this.tools);
    this.runtimePackage = options.runtimePackage;
    this.contextBuilder =
      options.contextBuilder ?? new BasicContextBuilder({ runtimePackage: options.runtimePackage });
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

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      await this.emit({ type: "model_start", iteration });

      const context = await this.contextBuilder.build({
        systemPrompt: this.systemPrompt,
        messages: this.messages,
        tools: this.tools.map(toToolSpec),
        runtimePackage: this.runtimePackage,
      });

      const stream = streamSimple(this.model, context, {
        apiKey: await this.getApiKey?.(this.model.provider),
        sessionId: this.sessionId,
        signal,
      });

      const toolCalls: ToolCall[] = [];

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
          toolCalls.push(event.toolCall);
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

      if (toolCalls.length === 0) return assistantMessage;

      for (const toolCall of toolCalls) {
        const resultMessage = await this.executeToolCall(toolCall, signal);
        this.messages.push(resultMessage);
        await this.emit({ type: "tool_execution_result", toolCall, message: resultMessage });
      }
    }

    throw new Error(`Stopped after ${this.maxIterations} model iterations.`);
  }

  private async emit(event: RuntimeEvent) {
    await this.onEvent?.(event);
  }

  private async executeToolCall(toolCall: ToolCall, signal?: AbortSignal): Promise<ToolResultMessage> {
    await this.emit({ type: "tool_execution_start", toolCall });

    const tool = this.toolResolver.resolve(toolCall.name);
    if (!tool?.execute) {
      return createToolResultMessage(toolCall, `No executable tool registered for '${toolCall.name}'.`, true);
    }

    try {
      const result = await tool.execute(toolCall.arguments, { toolCall, signal });
      return createToolResultMessage(toolCall, result);
    } catch (error) {
      return createToolResultMessage(toolCall, error instanceof Error ? error.message : String(error), true);
    }
  }
}

class RuntimeToolRegistry implements ToolResolver {
  private readonly toolsByName = new Map<string, RuntimeTool>();

  constructor(tools: RuntimeTool[]) {
    for (const tool of tools) {
      this.toolsByName.set(tool.name, tool);
    }
  }

  resolve(toolName: string) {
    return this.toolsByName.get(toolName);
  }
}

function toToolSpec(tool: RuntimeTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function createToolResultMessage(
  toolCall: ToolCall,
  result: ToolExecutionResult,
  defaultIsError = false,
): ToolResultMessage {
  const normalized =
    typeof result === "string"
      ? { content: result, isError: defaultIsError }
      : { ...result, isError: result.isError ?? defaultIsError };

  const content =
    typeof normalized.content === "string"
      ? [{ type: "text" as const, text: normalized.content }]
      : normalized.content;

  return {
    role: "toolResult",
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    content,
    details: typeof result === "string" ? undefined : result.details,
    isError: normalized.isError,
    timestamp: Date.now(),
  };
}
