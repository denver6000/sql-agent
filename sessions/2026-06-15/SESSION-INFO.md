# Session Info

- Date: `2026-06-15`
- Topic: Coding agent architecture, runtimes, sessions, subagents, and comparisons across `pi`, `OpenCode`, and `OpenClaw`
- Purpose: Preserve high-signal architectural notes as a reusable knowledge index for future design work

## Main Takeaways

- `pi` is layered as:
  - `pi-ai`: provider/model abstraction
  - `pi-agent-core`: reusable agent loop/runtime
  - `pi-coding-agent`: coding-agent product shell
- `OpenCode` is closer to a coding-agent platform than a reusable low-level runtime library.
- `OpenCode` uses a local HTTP/OpenAPI server plus SSE for its clients; the TUI talks to that local server.
- `OpenCode` supports multiple upstream providers and subscriptions, but its local server is not mainly an OpenAI-compat shim; it is its own orchestration backend.
- `OpenClaw` is broader than a coding CLI. It is a local-first gateway/agent OS with sessions, channels, tasks, runtime routing, and ACP control-plane abstractions.
- `OpenClaw` does not consume upstream `pi-agent-core` as an external dependency. It has an in-repo `@openclaw/agent-core` and wraps it with an OpenClaw-owned runtime facade.
- In `OpenClaw`, a "runtime" is a pluggable turn-execution backend such as `openclaw`, `codex`, `copilot`, or `claude-cli`.

## Recommended Direction

- For a custom coding agent centered on the Pi approach:
  - prefer a new shell around `pi-agent-core`
  - add your own session manager, tool registry, permission layer, skill discovery, and local server later
- Start with simple sessions:
  - durable `SessionEntry`
  - append-only transcript
  - in-memory runtime handle
  - per-session operation queue

## Files In This Archive

- [SESSION-INFO.md](/C:/Users/giyut/Documents/Portfolio/Personal%20Projects/CodingAgent/sessions/2026-06-15/SESSION-INFO.md)
- [SESSION-CONTENTS.md](/C:/Users/giyut/Documents/Portfolio/Personal%20Projects/CodingAgent/sessions/2026-06-15/SESSION-CONTENTS.md)
