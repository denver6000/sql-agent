import { Agent, type AgentEvent, type AgentTool, type AgentToolResult } from "@mariozechner/pi-agent-core";
import {
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
import { NoopRuntimeLogger, type RuntimeLogger } from "./logging.js";

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
  contextBuilder?: ContextBuilder;
  runtimePackage?: RuntimePackage;
  sessionId?: string;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  onEvent?: (event: RuntimeEvent) => Promise<void> | void;
  logger?: RuntimeLogger;
};

export class Runtime {
  private readonly agent: Agent;
  private readonly onEvent?: RuntimeOptions["onEvent"];
  private readonly logger: RuntimeLogger;
  private turnCount = 0;
  private currentPromptTurns = 0;
  private stoppedAfterMaxIterations = false;

  constructor(options: RuntimeOptions) {
    this.onEvent = options.onEvent;
    this.logger = options.logger ?? new NoopRuntimeLogger();
    const maxIterations = options.maxIterations ?? 8;

    const contextBuilder = options.contextBuilder ?? new BasicContextBuilder({ runtimePackage: options.runtimePackage });
    const context = contextBuilder.build({
      systemPrompt: options.systemPrompt,
      messages: [],
      tools: options.tools ?? [],
      runtimePackage: options.runtimePackage,
    });
    if (context instanceof Promise) {
      throw new Error("Async context builders are not supported by the pi-agent-core runtime adapter.");
    }

    this.agent = new Agent({
      initialState: {
        systemPrompt: context.systemPrompt,
        model: options.model,
        tools: (options.tools ?? []).map(toAgentTool),
      },
      getApiKey: options.getApiKey,
      sessionId: options.sessionId,
      afterToolCall: async ({ result }) => {
        const wrapped = unwrapRuntimeToolDetails(result.details);
        if (!wrapped) return undefined;
        return {
          details: wrapped.details,
          isError: wrapped.isError,
        };
      },
      shouldStopAfterTurn: async ({ toolResults }) => {
        if (this.currentPromptTurns < maxIterations || toolResults.length === 0) return false;
        this.stoppedAfterMaxIterations = true;
        return true;
      },
      toolExecution: "sequential",
    });
    this.agent.subscribe((event) => this.handleAgentEvent(event));
  }

  get transcript() {
    return this.agent.state.messages.filter(isLlmMessage);
  }

  async prompt(text: string, signal?: AbortSignal) {
    return this.logger.trace(
      {
        className: "Runtime",
        functionName: "prompt",
        params: {
          text,
          hasSignal: Boolean(signal),
          transcriptLength: this.agent.state.messages.length,
        },
      },
      async () => {
        this.turnCount = 0;
        this.currentPromptTurns = 0;
        this.stoppedAfterMaxIterations = false;
        if (signal) {
          signal.addEventListener("abort", () => this.agent.abort(), { once: true });
        }
        await this.agent.prompt(text);
        if (this.stoppedAfterMaxIterations) {
          throw new Error(`Stopped after ${maxIterations} model iterations.`);
        }
        const last = this.transcript.at(-1);
        if (last?.role === "assistant" && (last.stopReason === "error" || last.stopReason === "aborted")) {
          throw new Error(last.errorMessage ?? "Model request failed");
        }
        return last;
      },
    );
  }

  private async handleAgentEvent(event: AgentEvent) {
    await this.logger.log({
      level: "debug",
      event: "agent_core_event",
      className: "Runtime",
      functionName: "handleAgentEvent",
      params: event,
    });

    if (event.type === "message_start" && isUserMessage(event.message)) {
      await this.emit({ type: "user_message", message: event.message });
    }

    if (event.type === "turn_start") {
      this.turnCount += 1;
      this.currentPromptTurns += 1;
      await this.emit({ type: "model_start", iteration: this.turnCount });
    }

    if (event.type === "message_update") {
      const streamEvent = event.assistantMessageEvent;
      if (streamEvent.type === "text_delta") {
        await this.emit({ type: "text_delta", delta: streamEvent.delta });
      }
      if (streamEvent.type === "toolcall_start") {
        await this.emit({ type: "tool_call_start", contentIndex: streamEvent.contentIndex });
      }
      if (streamEvent.type === "toolcall_delta") {
        await this.emit({ type: "tool_call_delta", contentIndex: streamEvent.contentIndex, delta: streamEvent.delta });
      }
      if (streamEvent.type === "toolcall_end") {
        await this.emit({ type: "tool_call", toolCall: streamEvent.toolCall });
      }
      if (streamEvent.type === "error") {
        await this.emit({ type: "runtime_error", error: streamEvent.error.errorMessage ?? "Model request failed" });
      }
    }

    if (event.type === "message_end" && isAssistantMessage(event.message)) {
      await this.emit({ type: "assistant_message", message: event.message });
      if (event.message.stopReason === "error" || event.message.stopReason === "aborted") {
        await this.emit({ type: "runtime_error", error: event.message.errorMessage ?? "Model request failed" });
      }
    }

    if (event.type === "tool_execution_start") {
      await this.emit({
        type: "tool_execution_start",
        toolCall: {
          type: "toolCall",
          id: event.toolCallId,
          name: event.toolName,
          arguments: event.args,
        },
      });
    }

    if (event.type === "tool_execution_end") {
      await this.emit({
        type: "tool_execution_result",
        toolCall: {
          type: "toolCall",
          id: event.toolCallId,
          name: event.toolName,
          arguments: {},
        },
        message: {
          role: "toolResult",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          content: normalizeAgentToolContent(event.result),
          details: event.result?.details,
          isError: event.isError,
          timestamp: Date.now(),
        },
      });
    }
  }

  private async emit(event: RuntimeEvent) {
    await this.onEvent?.(event);
  }
}

function toAgentTool(tool: RuntimeTool): AgentTool<any, unknown> {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (toolCallId, params, signal) => {
      if (!tool.execute) {
        throw new Error(`No executable tool registered for '${tool.name}'.`);
      }

      const args = params as Record<string, unknown>;
      const result = await tool.execute(args, {
        toolCall: {
          type: "toolCall",
          id: toolCallId,
          name: tool.name,
          arguments: args,
        },
        signal,
      });
      const normalized = normalizeToolExecutionResult(result);

      return {
        content: normalized.content,
        details: {
          __runtimeToolDetails: normalized.details,
          __runtimeToolIsError: normalized.isError,
        },
      };
    },
  };
}

function normalizeToolExecutionResult(result: ToolExecutionResult): {
  content: TextContent[];
  details?: unknown;
  isError: boolean;
} {
  if (typeof result === "string") {
    return {
      content: [{ type: "text", text: result }],
      isError: false,
    };
  }

  return {
    content: typeof result.content === "string" ? [{ type: "text", text: result.content }] : result.content,
    details: result.details,
    isError: result.isError ?? false,
  };
}

function normalizeAgentToolContent(result: AgentToolResult<unknown> | undefined): TextContent[] {
  if (!result?.content) return [];
  return result.content.filter((item): item is TextContent => item.type === "text");
}

function textContentToString(content: TextContent[]) {
  return content.map((item) => item.text).join("\n").trim();
}

function unwrapRuntimeToolDetails(details: unknown) {
  if (!isRecord(details) || !("__runtimeToolIsError" in details)) return undefined;
  return {
    details: details.__runtimeToolDetails,
    isError: details.__runtimeToolIsError === true,
  };
}

function isLlmMessage(message: unknown): message is Message {
  return isUserMessage(message) || isAssistantMessage(message) || isToolResultMessage(message);
}

function isUserMessage(message: unknown): message is Message {
  return isRecord(message) && message.role === "user";
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
  return isRecord(message) && message.role === "assistant";
}

function isToolResultMessage(message: unknown): message is ToolResultMessage {
  return isRecord(message) && message.role === "toolResult";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
