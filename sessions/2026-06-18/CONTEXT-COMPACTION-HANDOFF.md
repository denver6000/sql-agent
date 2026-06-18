# Context Compaction Handoff

Date: 2026-06-18

This handoff summarizes the practical context-compaction discussion for the next development session. It is intended to preserve the reasoning before implementing context compaction in `ContextBuilder`.

## Current Code State

The latest work introduced early context and UI message abstractions:

- `context/builder.ts` currently defines `ContextBuilder` as a simple in-memory `AgentMessage` record store.
  - It stores `ContextMessageRecord` objects with `id`, `message`, and `createdAt`.
  - It can append messages, return plain `AgentMessage[]`, return raw records, and clear the global store.
- `ui/messages.ts` defines `UiMessageList`, which stores UI-only chat messages as `{ role, text }`.
  - This is separate from the runtime/model transcript.
- `index.ts` constructs an `Agent` with `initialState.systemPrompt`, `model`, and `tools`.

Important distinction:

```text
Agent transcript:
  AgentMessage[]
  Used by pi-agent-core / model calls.

UI transcript:
  UiChatMessage[]
  Used only for display in the TUI.
```

## Key Runtime Finding: System Prompt Is Separate From Messages

`pi-agent-core` stores the system prompt separately from message history.

The relevant runtime flow is:

```text
new Agent({ initialState: { systemPrompt, model, tools } })
↓
createMutableAgentState(initialState)
↓
state.systemPrompt is stored separately from state.messages
↓
each run creates a context snapshot
↓
transformContext receives only context.messages
↓
convertToLlm receives transformed messages
↓
final LLM context is built as:
  {
    systemPrompt: context.systemPrompt,
    messages: llmMessages,
    tools: context.tools,
  }
```

This means context compaction should not treat the system prompt as ordinary message history.

## Rule: System Prompt Is Protected Context

Before implementing compaction, preserve this rule:

```text
The system prompt is part of the instruction layer.
Context compaction must never modify the instruction layer.
Compaction may only rewrite compactable conversation/context records.
```

Practical implication:

- Do not put `initialState.systemPrompt` into the compactable `ContextBuilder` message history.
- Do not summarize or rewrite the system prompt.
- Let `Agent.initialState.systemPrompt` remain the authoritative source for now.
- If the builder later receives the system prompt, it should use it for budgeting/tracing only, not compaction.

## What `transformContext(messages)` Receives

`transformContext` has this shape:

```ts
transformContext?: (
  messages: AgentMessage[],
  signal?: AbortSignal,
) => Promise<AgentMessage[]>;
```

The `messages` parameter is the agent's current transcript/context messages for the next LLM call, before provider conversion.

It may contain:

- user messages
- assistant messages
- tool result messages
- any future custom `AgentMessage` types, if added

It does not contain:

- system prompt
- model
- tools
- provider
- thinking level
- API key
- UI transcript state
- status line
- pending assistant UI placeholder

`transformContext` transforms the request-time messages that the model is about to see. It does not automatically rewrite `agent.state.messages` persistently.

## Request-Time vs Persistent Compaction

Two different compaction strategies were identified:

### A. Request-Time Compaction

```text
Keep full internal transcript.
Compact only the messages sent to the model for the next request.
```

This is what `transformContext` naturally supports.

Pros:

- safer first implementation
- preserves full raw history
- easy to test
- aligns with event-log-first architecture

### B. Persistent Transcript Compaction

```text
Actually rewrite agent.state.messages to replace old turns with a summary.
```

This is more invasive and should come later, if needed.

Recommendation: start with request-time compaction.

## Suggested First Architecture

For the first implementation, keep responsibilities simple:

```text
Agent owns:
  - systemPrompt
  - model
  - tools
  - runtime transcript

ContextBuilder owns:
  - compactable message context
  - message selection
  - summary insertion
  - token/budget metadata
  - trace metadata
```

Initial wiring should likely use `transformContext`:

```ts
const contextBuilder = new ContextBuilder();

const agent = new Agent({
  initialState: {
    systemPrompt,
    model,
    tools: defaultTools,
  },

  transformContext: async (messages, signal) => {
    return await contextBuilder.buildMessages({
      messages,
      signal,
      tokenBudget: {
        maxInputTokens: model.contextWindow,
        reservedOutputTokens: model.maxTokens,
      },
    });
  },

  getApiKey: async (requestedProvider) => {
    return await resolveOAuthApiKey(requestedProvider);
  },
});
```

The important part is that `transformContext` returns `AgentMessage[]` and does not handle the system prompt directly.

## Context Layers To Model Later

Eventually, `ContextBuilder` should evolve beyond a message store and model context as layers:

```text
Instruction layer:
  authoritative, protected, verbatim

Conversation layer:
  compactable, summarized over time

Memory layer:
  retrieved/selected, not blindly trusted

Artifact layer:
  referenced/selected, exact content fetched on demand

Tool layer:
  selected/gated, not compacted

Trace layer:
  records what happened, not sent wholesale to model
```

Potential future type shape:

```ts
type ContextPackage = {
  instructionLayer: {
    systemPrompt: string;
    projectInstructions?: string;
    runtimePolicy?: string;
  };

  conversationLayer: {
    recentMessages: AgentMessage[];
    compactedSummary?: AgentMessage;
  };

  memoryLayer: {
    memories: AgentMemory[];
  };

  artifactLayer: {
    artifacts: ArtifactContext[];
  };

  toolLayer: {
    tools: AgentTool<any>[];
  };

  budget: ContextBudget;
  trace: ContextTrace;
};
```

## Compactability Categories

Useful design split:

```ts
type ContextLayerKind =
  | "instruction"
  | "conversation"
  | "toolResult"
  | "memory"
  | "artifact"
  | "toolDefinition";

type Compactability = "protected" | "selectable" | "compactable";
```

Recommended behavior:

```text
instruction:
  protected

conversation:
  compactable

toolResult:
  compactable after resolved/stale

memory:
  selectable, not treated as truth

artifact:
  selectable/reference-based

toolDefinition:
  selectable/gated, not summarized
```

## Invariants To Add Before Real Summarization

Before adding any LLM summarizer, add deterministic tests/invariants:

1. `transformContext` returns `AgentMessage[]`.
2. The latest user message is retained verbatim.
3. Recent turns are retained verbatim.
4. The latest unresolved tool call/result pair is retained verbatim.
5. The system prompt is never compacted or rewritten.
6. Full raw history is preserved outside request-time compaction.
7. Compaction decisions are traceable by message IDs.

Example tests:

```ts
test("buildContext preserves system prompt verbatim", () => {
  const built = builder.buildContext({
    systemPrompt: "Never send external messages without confirmation.",
    messages: hugeMessageHistory,
  });

  expect(built.instructions.systemPrompt).toBe(
    "Never send external messages without confirmation.",
  );
});
```

```ts
test("request-time compaction keeps latest user message", async () => {
  const compacted = await builder.buildMessages({
    messages: hugeMessageHistoryWithCurrentUserMessage,
    tokenBudget: smallBudget,
  });

  expect(compacted.at(-1)).toMatchObject({ role: "user" });
});
```

## Server-Side Compaction Finding

OpenAI server-side compaction exists for Responses API via `context_management` and `compact_threshold`, but the current `pi-ai` OpenAI Codex provider does not expose it as a typed/supported option.

Observed current state:

- OAuth authentication for OpenAI Codex is supported through `@mariozechner/pi-ai/oauth`.
- The Codex provider builds request payloads itself.
- The exposed `OpenAICodexResponsesOptions` does not include `context_management`.
- There is an `onPayload` hook that could theoretically inject experimental payload fields, but this should be treated as unsupported until tested.

Recommendation: implement local/runtime compaction first rather than depending on server-side compaction.

## Recommended Next Session Plan

1. Rename or clarify the current `ContextBuilder` role mentally as a message/context record store.
2. Add a `buildMessages(...)` method that accepts `AgentMessage[]` and returns `AgentMessage[]`.
3. Wire `buildMessages(...)` into `Agent.transformContext`.
4. Start with deterministic windowing, not LLM summarization.
5. Add trace metadata or at least record selected/dropped message IDs.
6. Add tests for protected latest user message and system-prompt non-involvement.
7. Only after deterministic compaction is stable, introduce summary generation.

## One-Sentence Handoff

The next implementation should treat `ContextBuilder` as a request-time message context builder wired through `Agent.transformContext`, while leaving `initialState.systemPrompt` as a protected instruction layer owned by `pi-agent-core` and never compacted.
