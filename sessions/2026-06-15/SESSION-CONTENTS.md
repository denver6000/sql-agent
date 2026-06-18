# Session Contents

## 1. Pi Architecture

The Pi monorepo is split into three clear layers:

- `pi-ai`: unified multi-provider LLM API
- `pi-agent-core`: reusable agent runtime with tool calling, state, streaming, compaction helpers, and session utilities
- `pi-coding-agent`: the actual coding-agent harness with tools, sessions, config, skills, prompt templates, extensions, TUI, RPC, and SDK

Mental model:

```text
pi-coding-agent
  -> pi-agent-core
    -> pi-ai
      -> model providers
```

Implication:

- If you want a reusable engine, the seam is `pi-agent-core`.
- If you want a ready-made coding shell, the seam is `pi-coding-agent`.

## 2. OpenCode Architecture

`OpenCode` is closer to a coding-agent platform than to a small reusable core library.

Important characteristics:

- TUI talks to a local `OpenCode` server
- local protocol is HTTP/OpenAPI + SSE
- the local server owns sessions, tools, permissions, routing, and runtime orchestration
- upstream model providers are behind the local server

Mental model:

```text
TUI / IDE / SDK
  -> local OpenCode server
    -> sessions / tools / permissions / agents
      -> upstream providers
```

It is not primarily a local OpenAI-compatible shim. It is its own agent backend.

OpenCode also has stronger built-ins than Pi around:

- permissions
- subagents
- MCP
- snapshots
- server/SDK model

## 3. Coding Agent Parts

The important architectural parts of a coding agent are:

- client layer
- runtime loop
- model/provider abstraction
- context builder
- tool registry
- permission/policy layer
- workspace/folder discovery
- skill discovery
- documentation/retrieval layer
- MCP bridge
- session store
- memory
- planning/task state
- event/observability stream
- configuration/profiles
- sandbox/execution environment

Useful minimal architecture:

```text
CLI
  -> RuntimeService
    -> ProjectDiscovery
    -> ContextBuilder
    -> SkillRegistry
    -> ToolRegistry
    -> PermissionResolver
    -> pi-agent-core Agent
      -> pi-ai model
```

## 4. Subagents

Subagent delegation is not fully standardized, but the common patterns are:

- agent-as-tool
- handoff
- parallel workers
- child sessions
- independent agent teams

Best fit for a Pi-centered custom build:

- implement subagents as agent-as-tool first

Example:

```text
parent agent
  -> calls task/subagent tool
    -> runtime creates child Agent
    -> child runs with its own context/tools/model/policy
    -> child returns one summarized result
  -> parent continues
```

Key design rules:

- child context should usually be `fresh` or `summary`, not full parent history
- subagents need their own tool allowlist and permission policy
- tasks should be tracked separately from sessions

## 5. Sessions: Why The Architecture Looks Like This

These patterns come from older systems ideas applied to agents:

- durable state vs live handles
- event sourcing / append-only logs
- actor model
- workflow/job systems
- database normalization
- capability-based security
- context-window management
- process supervision

The simplest useful session boundary is:

```text
SessionEntry       = durable metadata
Transcript         = append-only messages/events
RuntimeHandle      = in-memory live Agent instance
SessionActorQueue  = serialize operations per session
```

That is enough to build a robust first version.

## 6. OpenClaw Session Model

`OpenClaw` has a more complex session architecture because it is an agent OS/gateway, not just a coding terminal.

Core idea:

- durable session identity is separate from live runtime state

Main pieces:

- `SessionEntry`: durable metadata record
- `sessionKey`: routing identity
- `sessionId`: transcript identity
- `sessionFile`: JSONL transcript path
- `acp`: runtime metadata for ACP-backed sessions
- `ManagerRuntimeHandleCache`: in-memory runtime handles
- `SessionActorQueue`: per-session serialized operations
- task records: activity ledger for detached work

Useful takeaway:

- session metadata, transcript, runtime handle, and task tracking should not be collapsed into one object

## 7. OpenClaw and Pi Agent Core

`OpenClaw` does not simply import upstream `pi-agent-core`.

What it does instead:

- it has its own in-repo package `@openclaw/agent-core`
- it wraps that in `src/agents/runtime/index.ts`
- it injects OpenClaw-owned runtime dependencies from its own LLM/plugin SDK

Mental model:

```text
OpenClaw agent layer
  -> OpenClaw runtime facade
    -> @openclaw/agent-core
      -> @openclaw/llm-core
        -> OpenClaw provider/plugin runtime
```

So it is best thought of as:

- an internalized or forked derivative agent core
- plus a custom OpenClaw runtime wrapper
- plus a much larger session/tool/channel/task system around it

## 8. OpenClaw "Runtime" Meaning

In `OpenClaw`, "runtime" means the backend that executes prepared turns.

Examples from the docs:

- `openclaw`
- `codex`
- `copilot`
- `claude-cli`

This is deeper than swapping a repository implementation. It is more like swapping an execution engine.

Runtime interface responsibilities include:

- `ensureSession`
- `runTurn`
- `getStatus`
- `setMode`
- `setConfigOption`
- `prepareFreshSession`
- `cancel`
- `close`

Analogy:

```text
outer app shell stays the same
inner turn-execution engine changes
```

So `OpenClaw` is:

```text
gateway + session system + tool bridge + runtime router
```

and each runtime implementation owns different amounts of the actual agent loop.

## 9. Practical Direction For A Custom Agent

If the goal is a custom coding agent centered on the Pi model:

- prefer `pi-agent-core` as the real center
- build your own session manager and tool system around it
- keep the first version small

Recommended first cut:

```text
SessionEntry
Transcript JSONL
RuntimeSessionManager
ToolRegistry
SkillRegistry
PermissionResolver
CLI client
```

Then add:

- local HTTP/SSE server
- MCP bridge
- docs retrieval
- subagent tasks
- memory
- richer session/task indexing

## 10. Working Rules Worth Keeping

- keep durable and live state separate
- make sessions serializable and restart-safe
- do not couple transcripts to runtime objects
- keep subagent work isolated
- track background work separately from conversation state
- prefer explicit adapters at the runtime boundary
- avoid building a huge session model before you have a minimal durable core
