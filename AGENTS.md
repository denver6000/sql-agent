# CodingAgent

## Project Purpose

This repository is a personal SQL agent runtime built on top of `@mariozechner/pi-agent-core` / `@mariozechner/pi-ai`.

The project began as a general-purpose coding agent harness, but the current direction is a deliberate twist toward SQL-first agent work. The core goal is to build an agent runtime that can safely and clearly help with database tasks such as schema discovery, SQL querying, local database exploration, and eventually guarded database mutations.

This project exists for three reasons:

1. To understand how agent systems work in practice
2. To learn how to design an effective runtime and SQL tool layer
3. To serve as a portfolio project that demonstrates that work clearly

## Repository Context

This codebase should be treated as an experimental but intentional SQL agent runtime. Changes should support learning, extensibility, and a clearer understanding of agent architecture, not just short-term feature delivery.

When making decisions, prefer:

- Clear runtime structure over clever shortcuts
- SQL tooling patterns that can scale from local development to safer production workflows
- Changes that make the agent easier to inspect, debug, and extend
- Solutions that improve understanding of how the system behaves
- Explicit runtime boundaries between model-generated code, SQL access, credentials, and policy

## SQL Runtime Direction

The current architectural boundary is:

```text
Agent
  writes Python code cells
  calls sql_workspace_run

Persistent Python workspace
  exposes an injected sql facade
  keeps namespace state across calls
  blocks direct bypass imports and unsafe Python capabilities

TypeScript SQL runtime
  owns credentials
  owns backend selection
  owns SQL execution
  is the intended home for SQL policy
  exposes a localhost-only token-protected RPC server

MySQL/MariaDB
  local XAMPP first
  remote/profiled databases later
```

Future SQL work should preserve this boundary. The agent should use the `sql` facade rather than shelling out to `mysql.exe`, opening raw driver connections from generated Python, or handling credentials directly.

The intended long-term SQL flow is:

```text
draft -> analyze -> preflight -> approve -> execute -> verify -> log
```

Read-only exploration should remain the normal path. Writes are exceptional and should move toward explicit planning, affected-row previews, approval gates, verification, and audit logs. DDL should generally become a migration or runbook workflow rather than an impulse tool call.

## Implementation Boundaries

When modifying this repository, implement only the behavior or code changes that were explicitly requested or already agreed upon.

If you discover a missing prerequisite, design gap, edge case, bug, refactor, helper, dependency, test, or "obvious" improvement that was not directly requested, do not implement it silently. Pause first, explain the gap, and ask for approval before adding the fix.

This applies even when the extra work seems necessary to complete a basic feature. The intended workflow is for the user to shape the software in detail, so proposed additions should be surfaced as choices before they become code.

Prefer small, inspectable changes that match the user's requested shape over autonomous completion of adjacent work.

## `sessions/`

The [`sessions/`](./sessions/) directory contains detailed records from past development sessions.

These sessions may include:

- questions about agent concepts
- SQL runtime design work
- feature work
- bug investigation and fixes
- architecture exploration

Their purpose is to preserve the development journey and project history so future AI assistance can:

- trace bugs with more context
- implement features in a way that matches the current architecture
- understand why past decisions were made
- build on prior exploration instead of repeating it

## `references/`

The [`references/`](./references/) directory contains external agent-related material used for learning and integration work.

This includes things such as:

- AI harnesses
- coding harnesses
- SQL agent patterns
- other agent projects
- related implementations that may inform this project

These references exist to help compare approaches, borrow strong patterns, and learn from projects that solve similar problems well.

## `docs/`

The [`docs/`](./docs/) directory contains design notes and handoffs for the SQL runtime direction.

Important starting points:

- [`docs/sql_execution_environment_plan.md`](./docs/sql_execution_environment_plan.md)
- [`docs/sql_runtime_context_handoff.md`](./docs/sql_runtime_context_handoff.md)

Use these documents as supporting context when working on SQL execution, SQL workspace behavior, safety policy, approval flows, or future database profiles.

## Guidance For Future Work

If you are modifying this repository, keep the project purpose in view:

- this is primarily a SQL agent runtime now
- this is also a learning artifact and portfolio project
- preserve clarity in architecture and tooling decisions
- keep SQL credentials and execution policy in the runtime layer
- favor extensibility toward safer SQL workflows before broader integrations
- use `sessions/`, `references/`, and `docs/` as supporting context when they are relevant
