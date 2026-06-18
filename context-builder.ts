import type { Context, Message, Tool } from "@mariozechner/pi-ai";

export type ContextBuilderInput = {
  systemPrompt: string;
  messages: Message[];
  tools: Tool[];
};

export interface ContextBuilder {
  build(input: ContextBuilderInput): Promise<Context> | Context;
}

export class BasicContextBuilder implements ContextBuilder {
  build(input: ContextBuilderInput): Context {
    return {
      systemPrompt: input.systemPrompt,
      messages: input.messages,
      tools: input.tools,
    };
  }
}
