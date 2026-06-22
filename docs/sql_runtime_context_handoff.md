# SQL Runtime Context Handoff

Date: 2026-06-20

This is the session-gold handoff for the SQL execution environment work. It preserves the architecture decisions, implementation state, verification results, and next moves so the next session can resume without re-litigating the boundary.

## Session Thesis

The SQL environment should be separated from the agent.

The agent should not own credentials, choose database hosts, run `mysql.exe`, or know whether the active environment is local XAMPP, remote MySQL, or a future production profile.

The selected architecture is:

```text
Agent
  writes Python code strings
  calls sql_workspace_run

Persistent Python worker
  receives code over stdin
  executes code with exec() in one long-lived namespace
  exposes only an injected sql facade

TypeScript SQL Runtime HTTP RPC server
  owns credentials
  owns mysql2 connection pool
  owns recon/read/write policy
  selects the active SQL environment

MySQL/MariaDB
  local XAMPP for testing first
  remote/prod profile later
```

The important correction from the session:

> XAMPP is only the local database server for testing. The access layer must use a real TypeScript MySQL client library, not the XAMPP CLI.

## Current Implementation State

The TypeScript runtime now uses `mysql2/promise`.

Current source files:

- `tools/sql-runtime/runtime.ts`
  - Defines `SqlRuntime`.
  - Supports `backend: "scaffold" | "mysql"`.
  - Uses `mysql.createPool(...)` from `mysql2/promise`.
  - Owns `sql.status`, `sql.profiles`, `sql.connect`, `db.status`, `db.recon`, `db.describe_table`, `db.read`, `db.write`, and `db.execute`.
  - `db.read` currently allows only read-only `SELECT`, `SHOW`, `DESCRIBE`/`DESC`, and `EXPLAIN`.
  - `db.write` currently allows `INSERT`, `UPDATE`, and `DELETE`; `UPDATE` and `DELETE` require a `WHERE` clause.
  - `db.execute` allows create-only DDL plus the same DML writes.
  - Full production preflight/risk scoring/approval workflow is not implemented yet.

- `tools/sql-runtime/server.ts`
  - Starts a local HTTP JSON-RPC server on `127.0.0.1`.
  - Requires a bearer token.
  - Dispatches RPC calls into `SqlRuntime`.

- `tools/sql-workspace/worker.py`
  - Persistent Python process.
  - Reads JSON lines from stdin.
  - Executes user code in the same namespace across calls.
  - Injects a fake/importable `sql` module into `sys.modules`.
  - The `sql` facade calls TypeScript SQL Runtime over HTTP.
  - Blocks bypass imports and dangerous names such as `subprocess`, `os`, raw `open`, `exec`, `eval`, etc.

- `tools/sql-workspace/runner.ts`
  - TypeScript process manager for the Python worker.
  - Sends code strings to worker stdin.
  - Receives JSON responses from stdout.

- `tools/sql-workspace/index.ts`
  - Registers the runtime tool `sql_workspace_run`.
  - Tool description tells the agent to use `import sql`, `db = sql.connect()`, `db.recon(...)`, `db.read(...)`, `db.write(...)`, and `db.execute(...)`.

- `index.ts`
  - Starts the SQL runtime server and the Python SQL workspace runner with the TUI.
  - Defaults to `SQL_WORKSPACE_BACKEND=scaffold`.
  - No longer auto-detects or executes `C:\xampp\mysql\bin\mysql.exe`.

- `scripts/run-sql-local.ts`
  - One-command local SQL launcher.
  - Sets:
    - `SQL_WORKSPACE_BACKEND=mysql`
    - `SQL_HOST=127.0.0.1`
    - `SQL_PORT=3306`
    - `SQL_USER=root`
    - `SQL_PASSWORD=`
    - `SQL_DATABASE=`
  - Imports the main TUI.

- `package.json`
  - Adds `mysql2`.
  - Adds `start:sql-local`.

## How To Run Locally

Start XAMPP MySQL/MariaDB first, then run:

```powershell
bun run start:sql-local
```

To target a specific local database:

```powershell
$env:SQL_DATABASE="Test"
bun run start:sql-local
```

Inside the agent, the intended generated Python shape is:

```python
import sql

db = sql.connect()
print(db.status())
print(db.read("SHOW DATABASES", limit=5))
recon = db.recon("understand the active schema")
print(recon.summary())
```

For local create-only DDL, the intended shape is:

```python
import sql

db = sql.connect()
print(db.execute("CREATE DATABASE IF NOT EXISTS AgentDatabase"))
print(db.execute("CREATE TABLE IF NOT EXISTS AgentDatabase.users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL)"))
```

For local DML writes, the intended shape is:

```python
import sql

db = sql.connect()
print(db.write("INSERT INTO AgentDatabase.users (name, email) VALUES (?, ?)", ["Ada", "ada@example.test"]))
print(db.write("UPDATE AgentDatabase.users SET name = ? WHERE email = ?", ["Ada Updated", "ada@example.test"]))
print(db.write("DELETE FROM AgentDatabase.users WHERE email = ?", ["ada@example.test"]))
```

The agent should not generate:

```python
import subprocess
```

or direct CLI calls to `mysql.exe`.

## Verification Done

Commands that passed:

```powershell
bun tests/sql-workspace-tool/run.ts
bun tests/sql-workspace-xampp/run.ts
bunx tsc --noEmit -p tsconfig.json
bunx tsc -p tsconfig.json
```

Important observed results:

- Scaffold test shows persistent Python namespace works.
- Repeated `sql.connect()` returns the same Python handle and TypeScript runtime connect count stays at `1`.
- `import subprocess` is rejected by the worker safety check.
- XAMPP test reaches local MariaDB through `backend: "mysql"` and `driver: "mysql2"`.
- Local server observed: `10.4.32-MariaDB`, user `root@localhost`.
- `db.read("SHOW DATABASES", limit=5)` returned real local schemas.
- `db.execute(...)` created `AgentDatabase` and the `users`, `projects`, and `tasks` tables through the TypeScript `mysql2` runtime.
- `SHOW TABLES FROM AgentDatabase` confirmed `projects`, `tasks`, and `users`.
- `db.write(...)` inserted, updated, selected, and deleted a test row through the TypeScript `mysql2` runtime.
- A broad `DELETE FROM AgentDatabase.users` without `WHERE` was rejected.

One broad text scan accidentally walked into `node_modules` and timed out with permission noise; ignore that result. A narrower owned-file scan showed only expected `mysql2`, `createPool`, `SQL_WORKSPACE_BACKEND`, and the safety regression test containing `import subprocess`.

## Current Boundary

This has been implemented:

```text
Python = programmable control language
TypeScript = SQL access layer
MySQL credentials = runtime concern
Agent = caller of sql facade only
```

This has not been implemented yet:

```text
write preflight
affected-row preview
risk scoring
approval gates
rollback/audit workflow
remote phpMyAdmin-backed credential profile
```

This write path has been implemented:

```text
db.execute(sql, params?)
  allows CREATE DATABASE/SCHEMA/TABLE
  allows INSERT/UPDATE/DELETE
  rejects multiple statements
  rejects DROP/TRUNCATE/ALTER/RENAME/GRANT/REVOKE and file SQL features
  rejects CREATE TABLE AS SELECT

db.write(sql, params?)
  allows INSERT/UPDATE/DELETE
  rejects multiple statements
  requires WHERE for UPDATE and DELETE
  rejects broad WHERE 1=1 / WHERE true
```

The next session should keep the line firm: do not let the model bypass the SQL runtime with shell commands or ad hoc Python database clients.

## Next Good Step

Implement the first write-capable workflow in TypeScript, not Python:

```text
db.plan_write(sql, params?)
  parses statement
  classifies risk
  rejects broad mutations
  produces preview SELECT / affected-row estimate
  returns a plan id

db.execute_plan(plan_id, approval_token)
  executes only an approved plan
  records final affected rows
  returns audit record
```

Keep reads/recon as the default agent path. Writes should require explicit runtime approval.
