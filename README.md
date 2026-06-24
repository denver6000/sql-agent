# SQL Agent

SQL Agent built on top of `pi-agent-core` and `pi-ai`.

This is a local SQL agent runtime for experimenting with agent-driven database exploration. It is intended for local development and learning, and has not been tested in a production environment.

## Setup

Install dependencies:

```bash
bun install
```

Authenticate the Codex/OpenAI provider used by the runtime:

```bash
bun run login:codex
```

## SQL Credentials

Configure a local phpMyAdmin-style MySQL/MariaDB connection:

```bash
bun run sql-credentials
```

The script will prompt for:

- host
- port
- username
- password
- optional database

It tests the connection before saving credentials to:

```text
config/sql-credentials.local.json
```

That file is local-only and should not be committed.

## Run

Start the agent:

```bash
bun run start
```

Start with the local MySQL backend enabled:

```bash
bun run start:sql-local
```

Use `/exit`, `/quit`, `Esc`, or `Ctrl+C` to stop the TUI.
