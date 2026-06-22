# CodingAgent

CodingAgent is a personal SQL agent runtime built on top of `@mariozechner/pi-agent-core` / `@mariozechner/pi-ai`.

The project started as a general coding-agent harness, but it is now being shaped primarily around SQL work: giving an agent a controlled, inspectable workspace for discovering schemas, reading data, and eventually preparing guarded database changes.

## Purpose

This repo is both a working runtime and a learning artifact. Its main goals are:

- understand how agent systems work in practice
- design a clear runtime and tool layer for database-oriented agents
- explore safe SQL execution patterns before expanding into broader integrations
- serve as a portfolio project that makes the architecture easy to inspect

The current center of gravity is a SQL agent, not a generic shell-first coding agent.

## Current Shape

The runtime is split across a few important boundaries:

```text
Agent
  calls sql_workspace_run with Python code cells

Persistent Python workspace
  keeps state across calls
  exposes an injected importable sql facade
  blocks direct bypass imports and dangerous Python names

TypeScript SQL runtime
  owns credentials and backend selection
  is the intended home for SQL policy
  exposes a localhost-only token-protected RPC server
  uses mysql2 for MySQL/MariaDB access

MySQL/MariaDB
  local XAMPP is the first concrete test backend
```

The agent should use the Python SQL facade as its control language:

```python
import sql

db = sql.connect()
print(db.status())
print(db.tables())
print(db.read("SHOW DATABASES", limit=5))
```

The agent should not reach for `mysql.exe`, shell scripts, ad hoc Python database clients, or credentials directly.

## Repository Guide

- `index.ts` starts the TUI runtime, SQL runtime server, Python SQL workspace, and tool registry.
- `runtime.ts` contains the model/tool execution loop.
- `context-builder.ts` injects project instructions and skill metadata into runtime context.
- `package-manager.ts` discovers instruction files and project skills.
- `tools/sql-runtime/` owns SQL backend access, the local RPC server, and the future policy layer.
- `tools/sql-workspace/` owns the persistent Python workspace and the `sql_workspace_run` runtime tool.
- `scripts/run-sql-local.ts` starts the runtime against local MySQL/MariaDB defaults.
- `docs/sql_execution_environment_plan.md` describes the intended SQL safety architecture.
- `docs/sql_runtime_context_handoff.md` records the current SQL runtime boundary and verification state.
- `tests/` contains focused SQL workspace and SQL runtime checks.

## Install

```bash
bun install
```

## Authentication

For Codex-backed model access:

```bash
bun run login:codex
```

Other login helpers are available in `package.json`.

## Run

Start the default runtime:

```bash
bun run start
```

The default SQL workspace backend is `scaffold`, which is useful for exercising the harness without a real database.

To run against local XAMPP MySQL/MariaDB, start the database server first and then run:

```powershell
bun run start:sql-local
```

To select a database:

```powershell
$env:SQL_DATABASE="YourDatabase"
bun run start:sql-local
```

The SQL runtime reads these environment variables:

- `SQL_WORKSPACE_BACKEND`: `scaffold` or `mysql`
- `SQL_HOST`: defaults to `127.0.0.1`
- `SQL_PORT`: defaults to `3306`
- `SQL_USER`: defaults to `root`
- `SQL_PASSWORD`: defaults to empty
- `SQL_DATABASE`: defaults to no selected database
- `PYTHON`: Python executable for the SQL workspace worker

## Useful Commands

```bash
bunx tsc --noEmit -p tsconfig.json
bunx tsc -p tsconfig.json
bun tests/sql-workspace-tool/run.ts
bun tests/sql-workspace-xampp/run.ts
```

`tests/sql-workspace-xampp/run.ts` expects a reachable local MySQL/MariaDB server.

## Current SQL Capabilities

The current implementation supports a SQL workspace facade with:

- `sql.status()`
- `sql.connect()`
- `db.status()`
- `db.recon(...)`
- `db.tables()`
- `db.columns(table)`
- `db.schema(table)`
- `db.read(query, params?, limit?)`
- `db.write(query, params?)`
- `db.execute(query, params?)`

The write path is intentionally early and not production-complete. The active MySQL backend currently routes SQL through the TypeScript runtime, but it does not yet implement the full safety workflow described in `docs/`.

Current behavior includes:

- SQL access through the injected Python `sql` facade
- credential and backend selection in TypeScript instead of generated Python
- MySQL/MariaDB execution through `mysql2`
- scaffold mode for exercising the harness without a real database
- persistent Python namespace state across SQL workspace calls

The planned direction is stricter:

```text
draft -> analyze -> preflight -> approve -> execute -> verify -> log
```

Production-style write preflight, affected-row preview, risk scoring, approval gates, rollback thinking, and audit logs are documented but not fully implemented yet.

## Design Stance

This project treats SQL access as a runtime concern, not as a raw model capability.

Credentials, backend selection, policy, and database execution belong in TypeScript. The generated Python cell is only a compact control surface for the agent. This keeps the architecture inspectable while leaving room for future support such as profiles, approvals, audit logs, remote databases, Firestore, GitHub, and other tool integrations.
