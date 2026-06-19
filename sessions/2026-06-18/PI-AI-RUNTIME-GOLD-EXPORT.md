# Pi-AI Runtime Gold Export

Date: 2026-06-18 to 2026-06-19

This is a curated export of the productive architecture session where CodingAgent moved away from `pi-agent-core` and began becoming a custom TypeScript runtime built directly on `@mariozechner/pi-ai`.

This is not a raw transcript. It preserves the gold: the runtime concepts, Clawd-Code and OpenClaw comparisons, decisions made, and next architectural moves.

## Session Thesis

The project started as a personal agent runtime on top of `@mariozechner/pi-agent-core`, but the session clarified a stronger learning direction:

> Use `pi-ai` as the model/provider/streaming substrate, then build the runtime loop, context layer, tool layer, event layer, and eventually policy layer from scratch.

That shift matters because `pi-agent-core` already owns a lot of agent-loop machinery. If the goal is to understand and demonstrate runtime architecture, it is better to build the runtime loop explicitly:

1. Build context.
2. Call model.
3. Stream assistant text and tool-call deltas.
4. Collect finalized tool calls.
5. Resolve tools by name.
6. Execute tools.
7. Append tool result messages.
8. Continue the loop until the model stops.
9. Emit runtime events throughout.

This became the new backbone of the project.

## The Core Deviation From Pi-Agent-Core

Before the pivot, `pi-agent-core` acted like the runtime owner. It handled:

- agent state,
- transcript management,
- context transformation,
- model calls,
- tool-call execution,
- tool-result continuation,
- event emission,
- streaming updates.

That made the project easier to get working, but it also hid the exact runtime mechanics that this portfolio project wants to learn and expose.

After the pivot, `pi-ai` became the lower-level LLM adapter, not the runtime:

- `streamSimple(...)` streams normalized provider events.
- `Context` carries `systemPrompt`, `messages`, and `tools`.
- `Message` includes user, assistant, and `toolResult` messages.
- `ToolCall` appears inside assistant content once the provider has assembled it.
- `ToolResultMessage` is the exact message shape required to feed tool output back to the model.

The custom runtime now owns the agent loop.

## Current Custom Runtime Shape

Current important files:

- `runtime.ts`: custom runtime loop, tool-call collection, tool resolution, tool result creation, event emission.
- `context-builder.ts`: minimal `ContextBuilder` that assembles `pi-ai` `Context`.
- `index.ts`: TUI shell around the runtime, OAuth key resolution, sample tools.
- `package.json`: now depends on `@mariozechner/pi-ai`, `@earendil-works/pi-tui`, and `typebox`.

The runtime currently has this essential shape:

```ts
const userMessage = { role: "user", content: text, timestamp: Date.now() };
messages.push(userMessage);

for each model iteration:
  context = contextBuilder.build({ systemPrompt, messages, tools });
  stream = streamSimple(model, context, options);
  collect text deltas and finalized tool calls;
  assistantMessage = await stream.result();
  messages.push(assistantMessage);

  if no tool calls:
    return assistantMessage;

  for each tool call:
    result = executeToolCall(toolCall);
    messages.push(toolResultMessage);
```

This is the smallest real agent runtime loop.

## What Pi-AI Exposes

`pi-ai` exposes enough to build a runtime, but it does not give a full agent harness.

Useful exposed concepts:

- `streamSimple(model, context, options)`.
- Normalized streaming events:
  - `text_delta`
  - `toolcall_start`
  - `toolcall_delta`
  - `toolcall_end`
  - `done`
  - `error`
- `AssistantMessage`.
- `ToolCall`.
- `ToolResultMessage`.
- `Context`.
- `Tool`.
- OAuth helper support through `@mariozechner/pi-ai/oauth`.

Important lesson:

`streamSimple` gives normalized provider events, not raw wire chunks. For the runtime, that is ideal. The runtime should not care whether OpenAI, Anthropic, Gemini, or another provider emitted different wire formats. It should care about normalized runtime events.

## Why Tool Calls Should Not Execute At Toolcall Start

The user asked whether execution should happen here:

```ts
if (event.type === "toolcall_start") {
  // ToolResolve.call(...)
}
```

The answer was no.

`toolcall_start` is only a stream boundary. At that moment the runtime may not yet have:

- the tool name,
- the full JSON arguments,
- a valid parsed argument object,
- the final tool call ID,
- all tool calls in the same assistant message.

The correct execution point is after `toolcall_end`, or more strictly after the final assistant message has been received.

The adopted flow:

1. `toolcall_start`: emit UI/debug event only.
2. `toolcall_delta`: display/debug streamed JSON argument chunks.
3. `toolcall_end`: collect finalized `ToolCall`.
4. `stream.result()`: persist finalized assistant message.
5. Resolve and execute tool calls.
6. Append `ToolResultMessage`.
7. Continue model iteration.

This preserves streaming visibility while keeping execution deterministic.

## Current Tool Execution Implementation

The runtime now has a basic Clawd/OpenClaw-like execution layer:

- `RuntimeTool` extends `pi-ai` `Tool` with optional `execute`.
- `ToolResolver` resolves a tool by name.
- `RuntimeToolRegistry` is the default resolver.
- `executeToolCall(...)` handles:
  - emit `tool_execution_start`,
  - resolve tool by name,
  - return error tool result if missing,
  - run `tool.execute(...)`,
  - catch thrown errors,
  - convert output into `ToolResultMessage`.

Current event additions:

- `tool_execution_start`
- `tool_execution_result`

Current sample tools:

- `bash`
- `read_file`
- `write_file`

Current important limitation:

The tools work, but they are still sample tools. They are not yet policy-aware, permission-gated, symlink-safe, or production-safe.

## Runtime Events And `emit`

`this.emit(...)` is the runtime event broadcaster.

It does not mutate conversation state. It does not call the model. It does not execute tools by itself.

It simply forwards structured runtime events to whatever consumer was passed as `onEvent`.

This keeps the runtime headless:

- TUI can render events.
- A future web UI can render events.
- Tests can assert events.
- A trace recorder can persist events.
- A debugger can inspect events.

This event split is important. UI text should never become the source of truth for runtime state.

## Context Builder Decision

The session clarified that the runtime should not directly own every detail of prompt construction.

Current simple shape:

```ts
type ContextBuilderInput = {
  systemPrompt: string;
  messages: Message[];
  tools: Tool[];
};

interface ContextBuilder {
  build(input: ContextBuilderInput): Promise<Context> | Context;
}
```

This is currently a pass-through builder, but the boundary is correct.

Future `ContextBuilder` should own:

- system prompt assembly,
- project instructions,
- message selection,
- compacted summaries,
- memory retrieval,
- tool visibility,
- tool search results,
- context traces,
- budget decisions.

Important decision:

The runtime should hold a default `ContextBuilder` as a member, but `prompt(...)` should eventually allow per-turn context overrides. The runtime owns the loop; the context builder owns request-time packaging.

## Tool Visibility

The model only knows about tools that are passed in `Context.tools`.

That means tool visibility is a context-building decision, not just an execution-layer decision.

Runtime concepts:

- Tool registry: what the runtime can execute.
- Visible tools: what the model can see this turn.
- Tool resolver: how a finalized model tool call becomes a concrete executor.
- Tool policy: whether this tool call is allowed.

Current implementation exposes all three starter tools.

Future implementation should separate:

- registered tools,
- visible tools,
- deferred tools,
- discovered tools,
- enabled tools,
- permission-allowed tools.

## Clawd-Code Runtime Lessons

The local `references/claw-code` repository is a strong reference for a serious runtime boundary.

The Clawd Rust runtime loop in `rust/crates/runtime/src/conversation.rs` roughly does this:

1. Build API request from system prompt and session messages.
2. Stream model response.
3. Build final assistant message.
4. Extract pending `ToolUse` blocks.
5. Push assistant message into session.
6. Run auto-compaction check.
7. For each pending tool use:
   - run pre-tool hook,
   - allow hook to update input,
   - build permission context,
   - authorize through permission policy,
   - execute via tool executor if allowed,
   - run post-tool hook,
   - create tool result message,
   - push result into session,
   - record tool finished.
8. Continue loop if tools were used.

The core insight:

> Tool execution is not just `call function by name`. It is a traceable pipeline: pre-hook, input mutation, policy, execution, post-hook, result wrapping, persistence, event recording.

That full stack is too much for the current tiny runtime, but the shape is the target.

## Clawd Tool Resolution

Clawd resolves tools through a registry/executor boundary rather than directly switching in the conversation loop.

Important concepts found in `rust/crates/tools/src/lib.rs`:

- `GlobalToolRegistry`
- builtin MVP tool specs,
- runtime tools,
- plugin tools,
- aliases,
- canonical name normalization,
- permission mode per tool,
- `execute(name, input)`,
- searchable tool specs,
- deferred tool specs,
- `ToolSearch`.

The key idea:

The conversation loop should not know how each tool works. It should know how to ask a tool executor:

```txt
execute(toolName, input) -> output or error
```

That is exactly the direction our `ToolResolver` and `RuntimeTool` started taking.

## Clawd Hooks

Clawd uses hooks because tool calls are a runtime boundary where external control matters.

A tool call is not only a parsed JSON object. It is a proposed side effect.

Hooks allow:

- logging,
- auditing,
- policy checks,
- input rewriting,
- cancellation,
- permission override,
- post-processing output,
- plugin behavior,
- safety feedback,
- trace enrichment.

Pre-tool hook responsibilities:

- inspect tool name and input,
- deny/cancel/fail,
- add messages,
- update input,
- add permission override metadata.

Post-tool hook responsibilities:

- inspect output,
- mark result as error,
- merge hook feedback,
- add warnings or transformed content.

Lesson for CodingAgent:

Do not add public plugin hooks yet, but design internal execution as if hooks will exist:

```ts
beforeToolExecution(...)
authorizeToolExecution(...)
executeTool(...)
afterToolExecution(...)
createToolResultMessage(...)
```

The current `executeToolCall(...)` can evolve into that pipeline.

## Clawd Permissions

Clawd attaches permission requirements to tools.

Examples from its MVP specs:

- `read_file`: `ReadOnly`
- `write_file`: `WorkspaceWrite`
- `edit_file`: `WorkspaceWrite`
- `bash`: `DangerFullAccess`
- `WebSearch`: `DangerFullAccess`
- `Skill`: `ReadOnly`
- `Agent`: `DangerFullAccess`

This is important because permission belongs to the tool definition, not only to UI prompts.

Future CodingAgent permission modes should likely be:

- `read-only`
- `workspace-write`
- `danger-full-access`

And tools should declare:

- required permission,
- file access,
- network access,
- shell access,
- mutation risk,
- secret exposure risk.

## Clawd Tool Search

Clawd has a real `ToolSearch` concept.

This is one of the strongest ideas for this project.

The model should not always see every possible tool. Instead:

- keep core tools visible,
- keep specialized tools deferred,
- expose a read-only `tool_search`,
- let the model discover specialized tools by name or keywords,
- then the context builder can expose selected tools on the next iteration.

Clawd's registry search includes:

- builtin deferred tools,
- runtime tools,
- plugin tools,
- aliases,
- canonical name normalization,
- query normalization,
- result metadata,
- MCP degraded/pending status metadata.

CodingAgent version should start small:

```ts
type ToolSearchResult = {
  name: string;
  description: string;
  reason: string;
};

class ToolRegistry {
  register(tool: RuntimeTool): void;
  resolve(name: string): RuntimeTool | undefined;
  search(query: string, limit?: number): ToolSearchResult[];
  visibleToolsForTurn(input: TurnContext): RuntimeTool[];
}
```

This will become important once GitHub, Firestore, Google Workspace, memory, and other connectors exist.

## Clawd Parallel Tool Calls

There is partial truth to the claim that Clawd supports parallel tool calls, but it must be stated precisely.

Clawd has API passthrough support for provider-specific fields like `parallel_tool_calls` through an `extra_body` style request mechanism. That means it can ask a compatible provider to emit multiple tool calls in one assistant response.

But in the Rust conversation loop observed, local execution of pending tool uses is sequential:

```rust
for (tool_use_id, tool_name, input) in pending_tool_uses {
  ...
  tool_executor.execute(...)
  ...
}
```

So the distinction is:

- multiple tool calls from the model: yes;
- provider-level parallel tool-call generation option: yes;
- obvious local parallel tool execution in that Clawd loop: no, not in the inspected path.

This matters because "parallel tool calls" can mean two very different things:

1. The model emits multiple calls in one message.
2. The runtime executes multiple calls concurrently.

Those should be separate runtime settings.

## OpenClaw Agent-Core Lessons

OpenClaw's `@openclaw/agent-core` is the clearest TypeScript reference for the loop we are now building.

Important packages observed:

- `packages/agent-core`
- `packages/llm-core`
- `packages/llm-runtime`
- `packages/tool-call-repair`
- `packages/plugin-sdk`
- `packages/acp-core`

The most relevant file is:

```txt
references/openclaw-2026.6.6/openclaw-2026.6.6/packages/agent-core/src/agent-loop.ts
```

OpenClaw's loop:

1. Maintains current agent context.
2. Handles pending steering messages.
3. Streams assistant response.
4. Updates partial assistant message as stream events arrive.
5. Converts `AgentMessage[]` to LLM messages before provider call.
6. Builds LLM context from `systemPrompt`, messages, and tools.
7. Extracts `toolCall` blocks from assistant message.
8. Executes tool calls.
9. Pushes tool result messages.
10. Emits `turn_end`.
11. Allows `prepareNextTurn`.
12. Allows `shouldStopAfterTurn`.
13. Handles follow-up queued messages.

This is very close to what CodingAgent now started to implement.

## OpenClaw Context Transform Lesson

OpenClaw has a useful split:

- `transformContext`: operates on `AgentMessage[]`.
- `convertToLlm`: converts agent messages to provider-compatible `Message[]`.
- final LLM context includes:
  - `systemPrompt`,
  - converted messages,
  - tools.

This validates an earlier lesson from `pi-agent-core`:

> Keep system prompt separate from compactable messages.

For CodingAgent:

- `ContextBuilder` should eventually transform/select messages.
- It should not blindly compact the system prompt.
- It should return a trace explaining its choices.

## OpenClaw Tool Execution Modes

OpenClaw explicitly models:

```ts
type ToolExecutionMode = "sequential" | "parallel";
```

The documented behavior:

- `sequential`: prepare, execute, and finalize each tool call before the next one starts.
- `parallel`: prepare tool calls sequentially, then execute allowed tools concurrently.
- Tool execution end events can appear in completion order.
- Tool result message artifacts are emitted later in assistant source order.

This is a very good design.

Why prepare sequentially?

- resolution is deterministic,
- validation errors are deterministic,
- before-tool hooks can block before side effects,
- the runtime can decide whether any tool forces sequential execution.

Why emit results in source order?

- the model sees a stable order matching its own assistant message,
- tests become easier,
- transcript reconstruction is sane.

CodingAgent should not implement parallel execution immediately, but the target design should be:

1. Prepare all tool calls.
2. If runtime mode is sequential or any tool requires sequential, execute one by one.
3. Otherwise execute safe prepared calls concurrently.
4. Emit progress/end events as they happen.
5. Append tool result messages in original assistant source order.

## OpenClaw Before And After Tool Hooks

OpenClaw has `beforeToolCall` and `afterToolCall` in the agent loop config.

`beforeToolCall` receives:

- assistant message,
- raw tool call,
- validated args,
- current context.

It can return:

```ts
{ block?: boolean; reason?: string }
```

`afterToolCall` receives:

- assistant message,
- tool call,
- args,
- executed result,
- error flag,
- current context.

It can patch:

- content,
- details,
- `isError`,
- `terminate`.

This is a clean TypeScript version of the Clawd hook idea.

Suggested CodingAgent evolution:

```ts
type BeforeToolExecution = (ctx: {
  toolCall: ToolCall;
  tool: RuntimeTool;
  args: unknown;
  context: Context;
}) => Promise<{ block?: boolean; reason?: string } | undefined>;

type AfterToolExecution = (ctx: {
  toolCall: ToolCall;
  tool: RuntimeTool;
  args: unknown;
  result: ToolExecutionResult;
  isError: boolean;
}) => Promise<ToolExecutionPatch | undefined>;
```

Do not expose this as plugin API yet. First use it internally for tracing, policy, and testing.

## OpenClaw Tool Preparation Pipeline

OpenClaw's execution pipeline is especially useful:

1. Find tool by name.
2. Prepare arguments.
3. Validate arguments.
4. Run `beforeToolCall`.
5. If blocked, create immediate error result.
6. Execute prepared tool.
7. Collect progress updates.
8. Run `afterToolCall`.
9. Create `ToolResultMessage`.
10. Emit message start/end events for the result.

CodingAgent currently does only:

1. Resolve by name.
2. Execute.
3. Catch error.
4. Create `ToolResultMessage`.

Next upgrade should add:

- schema validation,
- tool missing result,
- before hook,
- permission check,
- progress callback,
- after hook,
- result envelope.

## Skills

The session clarified the mental model:

> Tool = executable capability.
> Skill = instructional capability.

In common `SKILL.md` standards under `.agents`, `.claude`, and similar directories, the skill file itself usually does not contain callable runtime code.

A `SKILL.md` typically contains:

- when to use the skill,
- workflow instructions,
- files to read,
- tools to prefer,
- constraints,
- output shape,
- references.

A skill folder may contain scripts or templates, but those scripts only run if the agent uses an actual executable tool such as `bash`.

For CodingAgent:

- Do not model skills as callable tools at first.
- Model skills as discoverable context modules.
- Later, add a `skill_search` or `load_skill` tool that reads and injects skill instructions.
- Keep the tool executor separate from skill instruction loading.

Suggested types:

```ts
type RuntimeTool = {
  name: string;
  description: string;
  parameters: TSchema;
  execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolExecutionResult>;
};

type Skill = {
  name: string;
  description: string;
  path: string;
  body: string;
  supportingFiles?: string[];
};
```

## CLI Sidebar

The session briefly explored how this could become an `opencode`-style CLI.

The future command shape:

```bash
dmbagent
dmbagent chat
dmbagent login
```

Recommended package shape:

```json
{
  "bin": {
    "dmbagent": "./dist/cli.js"
  }
}
```

Recommended command files:

```txt
src/
  cli.ts
  commands/
    chat.ts
    login.ts
  runtime.ts
  context-builder.ts
```

No installer script is required at first.

Local development:

```bash
bun link
```

or:

```bash
npm link
```

Published usage:

```bash
npm install -g dmbagent
```

or:

```bash
npx dmbagent
```

Important CLI architecture decision:

Move auth out of project-local `auth.json` before releasing. A real CLI should store credentials in a user config directory such as:

- `~/.dmbagent/auth.json`
- `%APPDATA%/dmbagent/auth.json`

## Current Implementation State After Session

Completed:

- Cleared/purged the old pi-agent-core direction.
- Removed reliance on `pi-agent-core`.
- Built a simple `pi-ai` based runtime.
- Added a basic `ContextBuilder`.
- Added TUI chat with `pi-tui`.
- Added OpenAI Codex OAuth key resolution.
- Added raw tool-call stream visibility.
- Added executable starter tools:
  - `bash`
  - `read_file`
  - `write_file`
- Added runtime-side tool execution loop.
- Added `ToolResolver`.
- Added `RuntimeToolRegistry`.
- Added `ToolResultMessage` creation.
- Added runtime events for tool execution.
- Confirmed `bun run build` passes.

Current runtime limitation:

- Tool args are not schema-validated yet.
- Tool permissions are not enforced.
- Tool search/deferred tools are not implemented.
- Tool execution is sequential only.
- Path validation is simple string-prefix validation and should be upgraded.
- Shell execution is too powerful for a real default.
- Session persistence was not rebuilt yet.
- Context tracing is not implemented yet.
- CLI packaging is only conceptual.

## Architecture Lessons To Keep

The custom runtime should be built around these durable boundaries:

### Runtime

Owns:

- transcript,
- model iterations,
- stream handling,
- tool call collection,
- tool result continuation,
- stop conditions,
- runtime events.

Does not own:

- UI rendering,
- provider-specific payload internals,
- every context decision,
- concrete tool implementation details.

### ContextBuilder

Owns:

- context assembly,
- system prompt packaging,
- message selection,
- tool visibility,
- future memory retrieval,
- future compaction,
- context trace.

### ToolRegistry

Owns:

- registered tools,
- aliases,
- resolution,
- metadata,
- search,
- future deferred tools.

### ToolExecutor

Owns:

- argument preparation,
- validation,
- before hook,
- permission check,
- execution,
- after hook,
- result envelope.

### PermissionPolicy

Owns:

- read/write/shell/network authorization,
- workspace path checks,
- user approval later,
- deny reasons,
- policy trace events.

### Event System

Owns:

- model stream events,
- assistant message lifecycle,
- tool execution lifecycle,
- context trace events,
- errors,
- future session persistence.

## Recommended Next Runtime Refactor

Current `runtime.ts` is good for learning, but the next refactor should split it before it grows too large.

Recommended files:

```txt
runtime.ts
runtime-events.ts
tool-registry.ts
tool-executor.ts
tool-result.ts
context-builder.ts
tools/
  bash.ts
  read-file.ts
  write-file.ts
```

Target execution flow:

```ts
const prepared = await toolExecutor.prepare(toolCall, context);
const authorized = await permissionPolicy.authorize(prepared);
const executed = authorized.allowed
  ? await toolExecutor.execute(prepared)
  : deniedToolResult(authorized.reason);
const finalized = await toolExecutor.finalize(executed);
const message = createToolResultMessage(finalized);
```

Keep the current simple code until the next feature forces the split.

## Recommended Next Implementation Order

1. Move sample tools out of `index.ts`.
2. Add `tool-registry.ts`.
3. Add `tool-result.ts`.
4. Add basic JSON-schema validation with TypeBox if convenient.
5. Add `ToolExecutionEnvelope`.
6. Add `PermissionMode`.
7. Add path-scope validator.
8. Put `write_file` and `bash` behind permission metadata.
9. Add `ContextTrace`.
10. Add session persistence.
11. Add `tool_search`.
12. Add skill discovery as context, not callable code.

This order keeps the project educational and inspectable.

## Suggested Types For Next Iteration

```ts
type PermissionMode = "read-only" | "workspace-write" | "danger-full-access";

type ToolRisk = "low" | "medium" | "high";

type ToolAccess = {
  readsWorkspace?: boolean;
  writesWorkspace?: boolean;
  executesShell?: boolean;
  usesNetwork?: boolean;
  mayExposeSecrets?: boolean;
};

type RegisteredTool = Tool & {
  aliases?: string[];
  requiredPermission: PermissionMode;
  risk: ToolRisk;
  access: ToolAccess;
  executionMode?: "sequential" | "parallel";
  execute(args: unknown, context: ToolExecutionContext): Promise<ToolExecutionResult>;
};
```

```ts
type ToolExecutionEnvelope = {
  toolCall: ToolCall;
  toolName: string;
  args: unknown;
  startedAt: number;
  finishedAt: number;
  content: TextContent[];
  details?: unknown;
  isError: boolean;
  error?: string;
  policy?: {
    allowed: boolean;
    reason?: string;
    permissionMode: PermissionMode;
  };
};
```

```ts
type ContextTrace = {
  traceId: string;
  includedMessages: Array<{ index: number; role: string; reason: string }>;
  omittedMessages: Array<{ index: number; role: string; reason: string }>;
  visibleTools: Array<{ name: string; reason: string }>;
  warnings: string[];
};
```

## Key Reference Map

OpenClaw:

- `references/openclaw-2026.6.6/openclaw-2026.6.6/packages/agent-core/src/agent-loop.ts`
  - best TypeScript reference for the loop, tool execution, sequential/parallel execution, and tool result messages.
- `references/openclaw-2026.6.6/openclaw-2026.6.6/packages/agent-core/src/types.ts`
  - contracts for tool execution mode, hooks, context transform, and tool result patching.
- `references/openclaw-2026.6.6/openclaw-2026.6.6/packages/agent-core/src/harness/types.ts`
  - higher-level harness events and hook result maps.

Clawd-Code:

- `references/claw-code/rust/crates/runtime/src/conversation.rs`
  - Rust runtime loop, tool-use extraction, hooks, permission policy, compaction check.
- `references/claw-code/rust/crates/runtime/src/hooks.rs`
  - pre/post tool hook concepts.
- `references/claw-code/rust/crates/runtime/src/permissions.rs`
  - permission model.
- `references/claw-code/rust/crates/runtime/src/permission_enforcer.rs`
  - enforcement layer.
- `references/claw-code/rust/crates/tools/src/lib.rs`
  - global tool registry, tool specs, aliases, permissions, tool search.
- `references/claw-code/rust/crates/api/src/types.rs`
  - API request options and provider-specific passthrough fields.

Local project:

- `runtime.ts`
  - current custom runtime loop.
- `context-builder.ts`
  - current minimal context builder.
- `index.ts`
  - current TUI, OAuth resolution, and starter tool definitions.
- `sessions/2026-06-18/CLAW-CODE-ANALYSIS.md`
  - broader Clawd architecture analysis.
- `sessions/2026-06-18/CONTEXT-COMPACTION-HANDOFF.md`
  - earlier context compaction and system-prompt separation handoff.

## Final Session Takeaway

The project now has a better identity.

It is no longer just "an agent using pi-agent-core." It is becoming:

> A small, inspectable TypeScript agent runtime that uses `pi-ai` for provider access while owning context, tools, events, permissions, sessions, and learning-oriented architecture itself.

The best references split cleanly:

- OpenClaw teaches the TypeScript loop mechanics.
- Clawd teaches the runtime philosophy: policy, hooks, traceability, search, safety, and extension boundaries.
- `pi-ai` supplies the provider abstraction and normalized stream.

The next version should not add lots of flashy tools. It should make the tool layer and context layer more honest:

- registry,
- validation,
- permission metadata,
- result envelopes,
- context traces,
- then persistence.

That is the path from a working harness to a serious runtime.
