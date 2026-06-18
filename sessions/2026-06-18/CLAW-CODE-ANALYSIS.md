# Claw-Code Reference Analysis For CodingAgent

Date: 2026-06-18

This note analyzes the local `references/claw-code` repository as a learning reference for this project. It intentionally extracts architecture, product patterns, testing strategies, and safety concepts rather than copying implementation details.

The goal is to answer one question:

> What can CodingAgent learn from this reference to become a clearer, safer, more general-purpose agent runtime?

## Executive Summary

`claw-code` is valuable less as a code source and more as a map of the system boundaries a serious agent runtime eventually needs:

- A runtime loop that owns messages, tools, permissions, compaction, usage, hooks, and trace events.
- A session model that survives process restarts, supports resume/fork/rewind, and records enough provenance to debug behavior.
- A prompt/context system where system instructions, project instructions, memory, recent turns, and tool state have explicit ordering and traceability.
- A tool layer with metadata, permission requirements, aliases, schemas, validation, and structured result envelopes.
- A security model where file access, shell execution, hooks, plugins, MCP servers, and credentials are treated as separate risk surfaces.
- A parity/eval harness built around deterministic mock providers and golden event traces, not final assistant prose.
- A product surface with `doctor`, `status`, `context`, `permissions`, `session`, `compact`, `hooks`, `mcp`, `skills`, and similar introspection commands.
- A future path toward personal-assistant capabilities through memory, retrieval, scheduled jobs, external connectors, channel bridges, and multi-agent workflows.

For CodingAgent, the biggest immediate opportunity is not to add many features. It is to make the current runtime boundaries first-class:

1. `ContextBuilder` should become a real request-time context assembler with budget decisions and traces.
2. The thread store should evolve toward append-only session events or JSONL turn records.
3. Tools should move behind a registry with metadata, permission requirements, and structured envelopes.
4. File and shell tools need a permission policy, canonical workspace path validation, and symlink escape checks.
5. The UI should render runtime events, but should not be the source of truth for conversation state.
6. A deterministic mock model and scenario tests should verify context, tools, permissions, and streaming behavior.

## Current CodingAgent Baseline

The local project is a Bun/TypeScript runtime built on `@mariozechner/pi-agent-core`.

Important current files:

- `index.ts`: TUI thread picker, chat UI, provider selection, agent creation, event subscription, thread persistence.
- `context/builder.ts`: early context abstraction that stores `AgentMessage` records in memory.
- `ui/messages.ts`: UI-only message list.
- `threads/store.ts`: JSON thread persistence under `.codingagent/threads`.
- `tools/*.ts`: basic workspace file, grep, find, ls, edit, write, and PowerShell-backed bash tools.
- `docs/pi_agent_context_architecture_summary.md`: design notes for runtime-owned context, compaction, traces, and evals.
- `sessions/2026-06-15`: architecture exploration around `pi-agent-core`, sessions, OpenCode, and OpenClaw.
- `sessions/2026-06-18/CONTEXT-COMPACTION-HANDOFF.md`: current handoff for request-time compaction through `transformContext`.

Current strengths:

- Simple enough to understand quickly.
- Already separates UI messages from agent messages.
- Has persistent threads.
- Has a default tool surface.
- Has an explicit context architecture direction in docs.
- Uses `pi-agent-core`, so it can delegate model/tool streaming mechanics to a lower layer.

Current weak spots:

- `ContextBuilder` is not wired into the runtime.
- Tool registry metadata is minimal.
- All default tools are exposed together.
- File and shell tools do not yet have a permission policy.
- Workspace path validation relies on resolved string checks and does not fully account for symlink escapes.
- Thread persistence is snapshot JSON rather than append-only durable history.
- There is no runtime trace recorder.
- There is no deterministic provider mock/eval harness.
- `tsconfig.json` does not currently include `threads/**/*.ts`, even though `index.ts` imports `threads/store.ts`.
- System prompt, project instructions, model provenance, permission mode, tool selection, and context-building decisions are not recorded as first-class trace data.

## What The Reference Appears To Be

The local `references/claw-code` repository is organized as a reconstruction/parity-style agent CLI project rather than a small library.

Top-level areas:

- `rust/`: canonical Rust workspace.
- `src/`: Python companion/reference/audit helpers.
- `tests/`: Python and harness tests.
- `docs/`: design maps, lifecycle contracts, model compatibility notes, personal assistant roadmap.
- `assets/`, `scripts/`, `.claude/`, `.claw/`, `.github/`: support material.

The reference repeatedly emphasizes:

- secure-by-default operation,
- explicit runtime limits,
- strong observability,
- modular tool and provider layers,
- parity harnesses,
- documentation close to implementation,
- project memory/instruction discovery,
- event-driven surfaces rather than UI scraping.

The most relevant transfer is architectural. CodingAgent should not clone the large command surface yet. It should adopt the boundaries that make such a surface possible later.

## Product Lesson

The strongest product lesson is that the assistant is only the visible tip of the runtime. The actual product value comes from:

- how work is represented,
- how state is persisted,
- how failures are classified,
- how permissions are enforced,
- how progress is surfaced,
- how humans approve or redirect,
- how context is curated,
- how tools are selected and audited,
- how recovery happens after failure.

This fits CodingAgent's purpose well. The project is not just a chatbot. It is a learning artifact for understanding agent systems.

## Runtime Loop Findings

The reference runtime has a clear loop:

1. Accept a user turn.
2. Build an API request from system prompt, session messages, tools, and provider config.
3. Stream assistant events.
4. Accumulate assistant content and tool calls.
5. Authorize tool calls through permission policy.
6. Run hooks around tools.
7. Execute tools and append tool results.
8. Continue model iterations until stop condition.
9. Track usage and prompt-cache metadata.
10. Trigger compaction when needed.
11. Emit trace/session events throughout.

Transferable concepts:

- Treat a turn as a structured operation with a start, model iterations, tool executions, stop reason, usage, and trace ID.
- Separate assistant text streaming from persisted assistant messages.
- Make tool-use and tool-result pairing explicit.
- Return a turn summary with assistant messages, tool results, usage, and compaction state.
- Record trace events even when UI rendering is minimal.

CodingAgent application:

- `index.ts` currently subscribes to `Agent` events and updates UI messages. That is fine for rendering, but it should also feed a `RuntimeTraceRecorder`.
- `createThreadAgent` should accept a context/runtime config object rather than directly assembling everything inline.
- `handleUserMessage` should create a `turnId`, record user input, context decisions, selected tools, model provider, and final turn state.

Suggested new modules:

- `runtime/turn.ts`
- `runtime/events.ts`
- `runtime/trace.ts`
- `runtime/createAgent.ts`
- `runtime/sessionRuntime.ts`

## Session Model Findings

The reference models sessions as durable runtime artifacts, not just UI history.

Important session concepts:

- versioned session schema,
- session ID,
- created and updated timestamps,
- workspace root binding,
- model/provider metadata,
- message list,
- prompt history,
- compaction metadata,
- fork metadata,
- liveness/heartbeat information,
- persistence path,
- JSONL-style event durability.

CodingAgent currently persists:

- thread summary index,
- per-thread JSON with `agentMessages` and `uiMessages`.

This works for a first version, but it blurs several concerns:

- conversation state,
- UI display state,
- runtime provenance,
- model settings,
- tool settings,
- context decisions.

Upgrade ideas:

- Keep `ThreadSummary` for listing.
- Add `ThreadEvent` or `SessionEvent` records.
- Store raw turn events append-only, then project them into current thread state.
- Include `workspaceRoot`, `provider`, `model`, `permissionMode`, and `contextVersion`.
- Add a session schema `version`.
- Add `lastTurnId`, `lastEventId`, and `updatedAt`.
- Add future support for `forkedFrom`, `rewoundFrom`, and `compactedFrom`.

Minimal next schema:

```ts
type ThreadEvent =
  | { type: "thread.created"; eventId: string; threadId: string; createdAt: string; workspaceRoot: string }
  | { type: "turn.started"; eventId: string; turnId: string; text: string; createdAt: string }
  | { type: "context.built"; eventId: string; turnId: string; trace: ContextTrace }
  | { type: "assistant.delta"; eventId: string; turnId: string; text: string }
  | { type: "assistant.message"; eventId: string; turnId: string; messageId: string }
  | { type: "tool.started"; eventId: string; turnId: string; toolCallId: string; toolName: string }
  | { type: "tool.finished"; eventId: string; turnId: string; toolCallId: string; status: "ok" | "denied" | "error" }
  | { type: "turn.finished"; eventId: string; turnId: string; status: "ok" | "error"; usage?: unknown };
```

This type is original to CodingAgent. It is included here as a design sketch, not copied from the reference.

## Context And Prompt Findings

The reference treats prompt construction as a runtime service, separate from transcript storage.

Prompt/context layers observed:

- static system prompt,
- dynamic boundary markers,
- environment details,
- project context,
- instruction files,
- configuration,
- recent conversation,
- compacted summaries,
- selected artifacts,
- tool availability,
- model-family-specific adaptations.

CodingAgent's own docs already point in this direction:

1. system/developer instructions,
2. project instructions,
3. policies,
4. compacted summary,
5. memories,
6. artifact summaries,
7. recent conversation,
8. current request.

Recommended `ContextBuilder` evolution:

- Accept the full runtime state for a turn.
- Return messages plus a trace, not just messages.
- Keep system prompt protected and outside model-editable history.
- Preserve the latest user request.
- Preserve tool-use/tool-result pairs.
- Track why each message was included or dropped.
- Track token estimates.
- Support request-time compaction before persistent compaction.
- Add deterministic tests for ordering and retention.

Useful target API:

```ts
type BuildContextInput = {
  threadId: string;
  turnId: string;
  systemPrompt: string;
  messages: AgentMessage[];
  currentUserMessage: string;
  budget: ContextBudget;
  projectContext?: ProjectContext;
  summaries?: ContextSummary[];
  memories?: RetrievedMemory[];
};

type BuildContextOutput = {
  messages: AgentMessage[];
  trace: ContextTrace;
};
```

Immediate implementation path:

- Add `buildMessages(...)` to `context/builder.ts`.
- Wire it through `Agent.transformContext`.
- Start with deterministic recent-window selection.
- Preserve all messages until a configurable estimated budget is exceeded.
- When exceeded, keep latest N messages plus the latest user message.
- Emit a `ContextTrace` listing included and omitted message IDs.

Do not implement persistent summary rewriting first. The 2026-06-18 handoff correctly recommends request-time compaction first.

## Compaction Findings

The reference has a dedicated compaction service that:

- estimates tokens,
- decides whether compaction is needed,
- summarizes older turns,
- preserves recent turns,
- preserves existing summaries,
- stores compaction metadata,
- avoids breaking tool-use/tool-result adjacency.

That last point is critical. A context windowing algorithm that preserves a tool result without the associated tool call can confuse the model and corrupt the conversation.

CodingAgent compaction requirements:

- Never drop the latest user message.
- Never split a tool call from its result.
- Never summarize system/developer/project instructions into ordinary conversation text.
- Record `compaction.started` and `compaction.finished` trace events.
- Store `sourceMessageIds` for summaries.
- Support "why was this message dropped?" debugging.

Minimum compaction trace:

```ts
type ContextTrace = {
  traceId: string;
  threadId: string;
  turnId: string;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  included: Array<{ id: string; reason: string; estimatedTokens: number }>;
  omitted: Array<{ id: string; reason: string; estimatedTokens: number }>;
  summariesUsed: Array<{ id: string; sourceMessageIds: string[] }>;
  warnings: string[];
};
```

## Tool Surface Findings

The reference exposes a large tool universe:

- file read/write/edit,
- grep/glob/find/list,
- bash and PowerShell with validation,
- notebook editing,
- LSP diagnostics/symbols/hover/definition,
- web fetch/search,
- MCP resources/tools/auth/status,
- plugin and skill tools,
- todo/task/team primitives,
- subagent execution,
- plan/worktree modes,
- remote/cron/message tools,
- synthetic/testing tools.

CodingAgent should not add all of these at once. The useful lesson is the metadata model around tools.

Current CodingAgent tools are simple exported objects in `tools/index.ts`. They work, but the runtime lacks enough metadata to reason about them.

Recommended `ToolSpec` fields:

- canonical name,
- aliases,
- description,
- input schema,
- output schema or result kind,
- required permission mode,
- risk level,
- workspace access type,
- network access type,
- whether it can modify files,
- whether it can execute code,
- whether it can reveal secrets,
- availability conditions,
- display name/icon for UI,
- examples for docs/tests.

Suggested design:

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

type RegisteredTool = {
  name: string;
  aliases?: string[];
  description: string;
  inputSchema: unknown;
  requiredPermission: PermissionMode;
  risk: ToolRisk;
  access: ToolAccess;
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResultEnvelope>;
};
```

Tool selection should happen per turn:

- default coding tools for coding tasks,
- read-only tools for investigation,
- no write/shell tools in read-only mode,
- connector tools only when configured and relevant,
- future RAG/search tools only when context suggests they are useful.

## Permission And Security Findings

The reference treats security as multiple independent checks:

- permission mode,
- path scope validation,
- symlink escape detection,
- shell command validation,
- hook/plugin/MCP trust,
- credential redaction,
- provider request size limits,
- config validation,
- sandbox diagnostics.

Important security gaps in CodingAgent today:

- `bash` executes PowerShell commands without a permission prompt or policy mode.
- `write` and `edit` can mutate workspace files without a runtime permission mode.
- `resolveWorkspacePath` checks the resolved string path, but does not canonicalize through `realpath` to catch symlink escapes.
- Tool results can include large outputs and potentially secrets.
- There is no redaction layer.
- There is no policy event when a tool is denied.
- There is no `doctor` command to report current safety posture.

Recommended permission model:

- `read-only`: read/list/grep only; no writes; no shell that writes or executes project code.
- `workspace-write`: read/write/edit inside canonical workspace; shell commands require validation and may ask.
- `danger-full-access`: full execution with clear status display.

Recommended path-scope behavior:

- Resolve user input relative to workspace root.
- Normalize path separators.
- Reject parent traversal outside the workspace.
- Use filesystem canonicalization for existing paths.
- For new files, canonicalize the nearest existing parent.
- Reject symlink escapes.
- Keep all validation in a shared path module used by every file tool.

Recommended shell policy:

- Classify commands as read-only, write, destructive, network, unknown.
- Deny or ask for high-risk commands depending on permission mode.
- Treat shell validation as heuristic, not the only security boundary.
- Record shell command, classification, and policy outcome in trace data.

## Hooks Findings

The reference supports hooks around runtime events and tool execution.

Hook concepts:

- pre-tool hook,
- post-tool hook,
- failure hook,
- ability to deny or modify tool input,
- progress events,
- abort signals,
- permission overrides,
- hook output included in trace.

CodingAgent should not rush into plugin hooks yet, but a tiny internal hook interface would make the runtime extensible.

Useful first hooks:

- `beforeToolExecution`,
- `afterToolExecution`,
- `onToolDenied`,
- `onTurnStarted`,
- `onTurnFinished`.

Initial use cases:

- trace recording,
- redaction,
- policy enforcement,
- future plugin integration.

## Plugins, Skills, And MCP Findings

The reference has a layered extension model:

- built-in tools,
- plugin metadata and lifecycle,
- MCP server discovery,
- MCP tool/resource bridge,
- skill discovery and invocation,
- marketplace/install/enable/disable flows,
- degraded startup when optional external servers fail.

Important idea: external tools should fail partially, not poison the whole runtime.

For CodingAgent:

- Start with a local `ToolRegistry`.
- Later add `ConnectorRegistry` for GitHub, Firestore, Google Workspace, etc.
- Treat each connector as optional unless the user explicitly requires it.
- Surface connector health in `status` and `doctor`.
- Redact connector config in logs.
- Keep connector failures structured:
  - `serverName`,
  - `phase`,
  - `required`,
  - `recoverable`,
  - `errorCode`,
  - `message`.

This directly supports the project purpose: broad practical integrations without making the core runtime brittle.

## Provider Compatibility Findings

The reference includes model/provider compatibility handling:

- provider-specific auth,
- base URL routing,
- model aliasing,
- request body size preflight,
- streaming response parsing,
- prompt cache metrics,
- reasoning-token fields,
- provider-specific unsupported fields,
- OpenAI-compatible gateway quirks,
- safe extra parameters.

CodingAgent currently supports Anthropic, GitHub Copilot, and OpenAI Codex provider selection in `index.ts`.

Recommended next step:

- Move model/provider selection into `providers/registry.ts`.
- Store the resolved provider and model in the thread/session.
- Add a `provider.diagnostics` status object.
- Add request preflight for estimated context size.
- Keep provider-specific logic out of UI code.

Useful provider registry shape:

```ts
type ProviderProfile = {
  id: string;
  displayName: string;
  defaultModel: string;
  envVar?: string;
  supportsStreaming: boolean;
  supportsToolUse: boolean;
  maxInputTokens?: number;
  quirks?: string[];
};
```

## Events, Reports, And Observability Findings

The reference strongly separates:

- human-readable panes/logs,
- machine-readable events,
- canonical reports,
- derived projections,
- approvals/tokens.

Key principle:

If a structured event exists, consumers should trust the event over scraped UI text.

CodingAgent should adopt this early. It will make the project easier to debug, test, and extend.

Recommended runtime event names:

- `thread.created`
- `turn.started`
- `context.built`
- `model.request.started`
- `model.stream.delta`
- `model.request.finished`
- `tool.requested`
- `tool.policy.checked`
- `tool.started`
- `tool.finished`
- `tool.denied`
- `compaction.started`
- `compaction.finished`
- `turn.finished`
- `turn.failed`

Each event should include:

- `eventId`,
- `threadId`,
- `turnId` where applicable,
- timestamp,
- emitter,
- version,
- structured payload.

For user-facing debugging:

- `/status`: current thread, provider, model, permission mode, tools, context count.
- `/context`: latest context trace.
- `/tools`: registered tools and availability.
- `/permissions`: current permission mode and policy.
- `/doctor`: config, auth, workspace, thread store, provider reachability, connector health.

## CLI And UX Findings

The reference has a broad command surface. The useful commands for CodingAgent are the introspective ones.

High-value commands:

- `/help`
- `/status`
- `/threads`
- `/new`
- `/context`
- `/compact`
- `/permissions`
- `/tools`
- `/doctor`
- `/export`
- `/resume`

Commands to defer:

- plugin marketplace,
- voice,
- remote/teleport,
- team/task systems,
- advanced PR/review automation,
- background lane boards.

Current TUI interaction in `index.ts` already has a thread picker and basic commands. It is a good place to add small command handlers before building a larger CLI layer.

## RAG And Personal Assistant Findings

The reference includes a roadmap from coding CLI to personal assistant:

- chat/voice surfaces,
- personal/work retrieval,
- MCP/plugins,
- scheduled digests,
- multi-agent reviewer,
- long-lived profile and sessions,
- channel bridges.

For CodingAgent, this maps nicely to the project purpose:

- GitHub access,
- Firestore access,
- Google Workspace access,
- other practical integrations.

Recommended path:

1. Build a reliable local session/runtime core.
2. Add a memory/retrieval interface that can query project docs and sessions.
3. Add one external connector with strong health and permission reporting.
4. Add scheduled digest jobs only after events and sessions are durable.
5. Add channel bridges only after session ownership and identity are clear.

Possible `MemoryRetriever` contract:

```ts
type RetrievalQuery = {
  threadId: string;
  turnId: string;
  query: string;
  scopes: Array<"project-docs" | "sessions" | "workspace" | "personal">;
  limit: number;
};

type RetrievedMemory = {
  id: string;
  scope: string;
  title: string;
  excerpt: string;
  sourcePath?: string;
  score: number;
};
```

## Multi-Agent And Task Findings

The reference includes subagent, task, lane, report, approval, and review ideas.

Transferable concepts:

- A subagent should be a bounded runtime invocation with its own context, tool set, permission mode, and output contract.
- A task should have an ID, owner, status, inputs, evidence, and result.
- Reports should be structured artifacts, not just assistant prose.
- Approval should be a typed runtime event or token, not vague text.
- Background workers need liveness/heartbeat and ownership.

CodingAgent should defer multi-agent execution until:

- session events exist,
- permissions exist,
- tool registry exists,
- context traces exist.

Then add a simple `TaskRunner`:

- one task at a time,
- read-only by default,
- explicit tool set,
- structured result,
- trace linked back to parent turn.

## Testing And Parity Harness Findings

The reference's test strategy is one of the most valuable parts.

Key test patterns:

- deterministic mock provider,
- no live credentials for local smoke tests,
- command help/status tests do not hit providers,
- tool roundtrip tests,
- permission allow/deny tests,
- path traversal and symlink escape tests,
- streaming text tests,
- multi-tool-turn tests,
- auto-compaction tests,
- cost/usage reporting tests,
- config and doctor tests,
- provider compatibility tests.

CodingAgent should add a small eval harness before expanding features.

Priority tests:

1. `ContextBuilder` includes latest user message.
2. `ContextBuilder` preserves system prompt separation.
3. `ContextBuilder` does not split tool call/result pairs.
4. Thread store saves and loads agent/UI messages.
5. Thread store records provider/model metadata.
6. Read tool denies outside-workspace paths.
7. Read tool denies symlink escapes.
8. Write/edit tools deny in `read-only`.
9. Shell tool denies in `read-only`.
10. Tool results are truncated and marked when truncated.
11. Mock model streams assistant text into UI.
12. Mock model requests a tool and receives a structured tool result.
13. `/status` works without credentials.
14. `/doctor` works without credentials.

Test style:

- Prefer deterministic traces and structured assertions.
- Avoid asserting exact assistant prose except for mock provider fixtures.
- Keep no-credential tests fast and local.

## Gaps In CodingAgent Mapped To Upgrades

### Gap: ContextBuilder is currently storage-like

Current:

- Stores messages in memory.
- Can append/get/clear.
- Does not build per-request context.
- Does not emit traces.

Upgrade:

- Turn it into a stateless or lightly stateful context assembler.
- Input should be thread state and budget.
- Output should be messages and trace.

### Gap: UI and runtime state are still close together

Current:

- `UiMessageList` is separate, which is good.
- `index.ts` still manages pending assistant UI and save timing directly.

Upgrade:

- Add a runtime event layer.
- UI subscribes to events.
- Thread store persists events or projected state.

### Gap: Tools lack policy metadata

Current:

- Tools are available as default tools.
- Permission policy is not first-class.

Upgrade:

- Add `ToolRegistry`.
- Add `PermissionPolicy`.
- Add `ToolExecutionContext`.
- Wrap results in `ToolResultEnvelope`.

### Gap: File safety is basic

Current:

- Paths are resolved under workspace by string relationship.

Upgrade:

- Shared canonical path validator.
- Realpath existing targets.
- Realpath nearest existing parent for new files.
- Deny symlink escapes.
- Add tests.

### Gap: Shell is too powerful

Current:

- `bash` tool runs PowerShell commands in workspace.

Upgrade:

- Rename or clarify as PowerShell on Windows.
- Add permission mode.
- Add command classification.
- Add read-only deny/ask behavior.
- Add timeout and output envelope details.

### Gap: Thread persistence is snapshot-only

Current:

- Thread JSON stores current messages and UI messages.

Upgrade:

- Add event log or JSONL turn log.
- Keep snapshot as projection for speed.
- Record schema version and model/provider/permission info.

### Gap: No doctor/status/context introspection

Current:

- Thread picker and basic chat.

Upgrade:

- Add slash command registry.
- Implement `/status`, `/context`, `/tools`, `/doctor`.

### Gap: No eval harness

Current:

- No tests discovered in active project.

Upgrade:

- Add Bun test setup.
- Add mock agent/model behavior where possible.
- Add tool and context tests first.

## Phased Roadmap

### Phase 0: Stabilize The Current Runtime

High impact, low surface area.

- Include `threads/**/*.ts` in `tsconfig.json`.
- Add `ContextBuilder.buildMessages(...)`.
- Wire `ContextBuilder` through `Agent.transformContext`.
- Add deterministic message IDs if missing.
- Add `ContextTrace`.
- Add `/context` to display latest trace.
- Add `RuntimeThread` metadata: provider, model, permission mode, workspace root.
- Add basic tests for context ordering and thread persistence.

Acceptance:

- Existing chat still works.
- New and resumed threads still work.
- Latest user message always reaches the model.
- Context trace can explain included/omitted messages.

### Phase 1: Tool Registry And Permissions

Build the tool layer that future integrations can plug into.

- Add `tools/registry.ts`.
- Add `tools/permissions.ts`.
- Add shared `PathScope` validator.
- Update file tools to use canonical validation.
- Add permission mode to runtime config.
- Set default permission mode to `workspace-write` or `read-only`, depending on desired UX.
- Add tool result envelopes.
- Add deny events.

Acceptance:

- Read-only mode denies write/edit/shell.
- Workspace-write mode allows writes inside workspace.
- Symlink escape tests pass.
- Every tool result has status, output, and metadata.

### Phase 2: Session Events And Trace Store

Make behavior inspectable.

- Add `runtime/events.ts`.
- Add `threads/events.ts` or JSONL log.
- Emit turn/context/tool/model events.
- Keep existing thread snapshot as a projection.
- Add `/status` and `/export`.

Acceptance:

- A completed turn can be reconstructed from events.
- UI rendering does not need to be the source of truth.
- Status shows provider, model, permission mode, thread ID, and tool count.

### Phase 3: Compaction And Context Budgeting

Make long sessions safe.

- Add token estimation.
- Add recent-window selector.
- Preserve tool pairs.
- Add summary placeholder support.
- Record compaction events.
- Add tests for latest user preservation and tool-pair preservation.

Acceptance:

- Long synthetic transcript is reduced deterministically.
- Context trace reports dropped messages.
- System prompt remains protected.

### Phase 4: Provider Registry And Diagnostics

Separate providers from UI.

- Move provider resolution out of `index.ts`.
- Add provider profiles.
- Add env/auth diagnostics.
- Add context-size preflight.
- Add no-credential doctor checks.

Acceptance:

- `/doctor` can report missing API key without crashing.
- Provider/model metadata is persisted.
- Adding a provider does not require editing UI code.

### Phase 5: Memory And Retrieval

Use this repo's docs and sessions as durable memory.

- Add `MemoryRetriever`.
- Index or scan `docs/` and `sessions/`.
- Add retrieval trace entries.
- Add current-task scoped retrieval before model calls.
- Keep retrieved excerpts small and cited by path.

Acceptance:

- A user can ask about an older session and receive context-backed answers.
- Retrieval decisions appear in context trace.
- No unrelated massive docs are injected blindly.

### Phase 6: Connectors And MCP-Style Lifecycle

Move toward a general-purpose assistant.

- Add connector registry.
- Start with one connector, likely GitHub or Firestore.
- Add connector status and health.
- Add redacted config display.
- Make connector failure partial/degraded by default.

Acceptance:

- Broken optional connector does not break chat.
- Status/doctor identifies connector failures.
- Connector tools have permission metadata.

### Phase 7: Background Work And Multi-Agent Tasks

Only after the core is observable.

- Add `Task` model.
- Add one bounded subagent runner.
- Add liveness/heartbeat.
- Add structured task reports.
- Add approval events for risky actions.

Acceptance:

- Parent session can spawn a bounded read-only investigation task.
- Task result links to trace evidence.
- Failure and cancellation are visible.

## Concrete Backlog

Immediate:

- Fix `tsconfig.json` include so `threads/store.ts` is typechecked.
- Add `ContextBuilder.buildMessages(...)`.
- Add `ContextTrace` type.
- Wire `transformContext` in `createThreadAgent`.
- Add `latestContextTrace` to `RuntimeThread`.
- Add `/context` command.
- Add `PermissionMode` type.
- Wrap `defaultTools` creation in a function that accepts permission mode.
- Add shared path validation tests.

Near term:

- Convert `tools/shared.ts` to canonical path validation.
- Add symlink escape tests.
- Add read-only mode and deny write/edit/shell.
- Add `ToolResultEnvelope`.
- Add tool registry metadata.
- Add `/tools` and `/permissions`.
- Add runtime event IDs.
- Add event log persistence.

Mid term:

- Add mock provider/harness.
- Add auto-compaction.
- Add prompt builder for project instructions.
- Discover `AGENTS.md` and future project instruction files deliberately.
- Add session export/import.
- Add provider registry.
- Add `/doctor`.

Long term:

- Add memory retrieval over `docs/` and `sessions/`.
- Add GitHub connector.
- Add Firestore connector.
- Add Google Workspace connector.
- Add connector health model.
- Add scheduled digest loop.
- Add bounded subagent/task runner.

## Suggested Module Layout

```text
context/
  builder.ts
  budget.ts
  trace.ts
  selectors.ts

runtime/
  createAgent.ts
  events.ts
  sessionRuntime.ts
  trace.ts
  turn.ts

threads/
  store.ts
  events.ts
  projections.ts

tools/
  index.ts
  registry.ts
  permissions.ts
  pathScope.ts
  result.ts
  bash.ts
  read.ts
  write.ts
  edit.ts

providers/
  registry.ts
  diagnostics.ts

commands/
  registry.ts
  status.ts
  context.ts
  tools.ts
  doctor.ts

memory/
  retriever.ts
  sessions.ts
  docs.ts
```

This is intentionally modest. It gives the current project clearer bones without turning it into a giant clone.

## Command Surface Recommendations

Start with:

- `/help`: list local commands.
- `/threads`: existing thread picker behavior.
- `/new`: create thread.
- `/status`: thread, provider, model, permission mode, message counts.
- `/context`: latest context trace.
- `/tools`: available tools and permission requirements.
- `/permissions`: current permission mode.
- `/doctor`: auth/config/workspace/thread-store checks.

Later:

- `/compact`
- `/export`
- `/resume`
- `/memory`
- `/connectors`
- `/tasks`

## Safety Checklist

Before adding external connectors:

- Tool permission mode exists.
- Path scope validator exists.
- Shell policy exists.
- Tool results are structured.
- Sensitive config is redacted.
- Thread/session metadata records provider and permission mode.
- Doctor/status can report misconfiguration.
- Tests run without live credentials.

Before adding background tasks:

- Event log exists.
- Turn IDs and task IDs exist.
- Cancellation path exists.
- Liveness/heartbeat exists.
- Approval event model exists.
- Task outputs are structured.

Before adding memory/RAG:

- Context trace exists.
- Retrieval trace exists.
- Source paths are preserved.
- Excerpt size limits exist.
- Secret redaction exists.

## Design Principles To Adopt

- Runtime owns context.
- UI renders events.
- Tools are registered capabilities, not loose functions.
- Permissions are policy decisions, not UI conventions.
- Session history is a durable artifact.
- Every risky action should have a structured reason and outcome.
- Context selection should be explainable.
- Provider quirks belong in a provider layer.
- External connectors should degrade independently.
- Tests should target traces, not assistant prose.
- Project docs and sessions are first-class memory sources.

## Concepts To Avoid Or Defer

Avoid now:

- Copying the reference command surface wholesale.
- Building plugin marketplace mechanics before tool policy exists.
- Adding background workers before events and liveness exist.
- Treating shell validation as a complete security boundary.
- Persistently rewriting history before request-time compaction works.
- Injecting all `docs/` and `sessions/` into every prompt.
- Adding many connectors before status/doctor can explain failures.

Defer:

- voice,
- remote execution,
- multi-agent lane boards,
- marketplace/plugin install flow,
- advanced report projection,
- full MCP lifecycle,
- complex provider compatibility matrices.

## Recommended First Implementation Sequence

The shortest path to meaningful progress:

1. Fix `tsconfig.json` so all active source is typechecked.
2. Add a real `ContextBuilder.buildMessages`.
3. Wire it into `Agent.transformContext`.
4. Add `ContextTrace` and `/context`.
5. Add a permission mode type.
6. Add canonical path scope validation.
7. Put write/edit/shell behind permission checks.
8. Add tool result envelopes.
9. Add tests for context and path safety.
10. Add `/status` and `/doctor`.

This sequence directly advances the project purpose:

- clearer runtime architecture,
- safer tools,
- inspectable behavior,
- better learning artifact,
- stronger foundation for GitHub/Firestore/Google Workspace.

## Reference Source Map

Useful local reference areas for future study:

- `references/claw-code/README.md`: project orientation.
- `references/claw-code/PHILOSOPHY.md`: product philosophy and orchestration ideas.
- `references/claw-code/USAGE.md`: CLI and command behavior.
- `references/claw-code/SECURITY.md`: risk taxonomy.
- `references/claw-code/concept.md`: architecture split between CLI, lean harness, and RAG service.
- `references/claw-code/ROADMAP.md`: phased reliability and automation plan.
- `references/claw-code/docs/g002-security-verification-map.md`: security verification map.
- `references/claw-code/docs/g003-boot-session-verification-map.md`: boot/session lifecycle.
- `references/claw-code/docs/g004-events-reports-contract.md`: event/report contracts.
- `references/claw-code/docs/g007-mcp-lifecycle-mapping.md`: MCP degraded startup and lifecycle.
- `references/claw-code/docs/MODEL_COMPATIBILITY.md`: provider compatibility concerns.
- `references/claw-code/docs/navigation-file-context.md`: explicit file context guidance.
- `references/claw-code/docs/personal-assistant-roadmap.md`: path from coding agent to assistant.
- `references/claw-code/rust/README.md`: canonical crate map.
- `references/claw-code/rust/MOCK_PARITY_HARNESS.md`: deterministic mock/eval harness.
- `references/claw-code/rust/runtime/src/`: runtime, sessions, compaction, permissions, prompt, MCP, hooks.
- `references/claw-code/rust/tools/src/`: tool registry and tool execution concepts.
- `references/claw-code/src/reference_data/`: command/tool surface snapshots.
- `references/claw-code/tests/`: parity, permission, CLI, and provider tests.

## Final Recommendation

Use `claw-code` as an architecture checklist, not as a blueprint to copy.

CodingAgent's best next version would be a small but serious runtime:

- typed sessions,
- explainable context,
- safe tools,
- permission-aware execution,
- traceable turns,
- deterministic tests,
- useful status/doctor commands.

Once those pieces exist, the project can grow naturally into the broader assistant described in `AGENTS.md`: GitHub, Firestore, Google Workspace, memory, scheduled work, and multi-agent workflows. Without those pieces, adding integrations would make the runtime harder to understand. With them, every new capability becomes another registered, observable, policy-aware tool.
