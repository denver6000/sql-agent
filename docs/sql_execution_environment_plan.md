# SQL Execution Environment Plan

Date: 2026-06-20

## Purpose

This document models a SQL execution environment and tool suite for this
agent harness. The goal is not just "let the model run SQL." The goal is to
give the agent a structured, inspectable, production-aware database workspace:

- discover schema safely
- draft and validate SQL before execution
- assess risk and estimated impact
- preview affected rows before mutations
- require explicit approval for dangerous operations
- execute with bounded time, bounded result sets, and audit logs
- make direct production SQL rare, deliberate, and recoverable

The first target is MySQL or MariaDB accessed with credentials that also work
in phpMyAdmin. phpMyAdmin itself should be treated as a dashboard, not as the
agent integration surface. The agent should connect to the underlying database
server directly with a MySQL/MariaDB driver when network access is available,
or through an SSH tunnel or small controlled proxy when the database is not
exposed.

## Research Snapshot

Current patterns and docs checked on 2026-06-20:

- MySQL docs list MySQL 9.7 and MySQL 8.4 as current documentation tracks, with
  8.4 functioning as the long-term stable target to design against. Runtime code
  should still call `SELECT VERSION()` and adapt to the actual server.
  Source: https://dev.mysql.com/doc/
- MySQL `EXPLAIN` supports `SELECT`, `DELETE`, `INSERT`, `REPLACE`, `UPDATE`,
  and `TABLE`; `FORMAT=JSON` and `FORMAT=TREE` are available depending on
  server version. This is useful for query plans, but it is not a substitute
  for affected-row prechecks.
  Source: https://dev.mysql.com/doc/refman/9.7/en/explain.html
- MySQL supports server-side prepared statements and placeholders. The first
  implementation should use `mysql2/promise` and `execute()` for prepared
  statements rather than string interpolation.
  Sources: https://sidorares.github.io/node-mysql2/docs and
  https://dev.mysql.com/doc/refman/8.4/en/sql-prepared-statements.html
- MySQL read-only transactions can be started with
  `START TRANSACTION READ ONLY`; attempts to mutate InnoDB/MyISAM tables then
  error. This is the right default for schema discovery and SELECT tools.
  Source: https://dev.mysql.com/doc/refman/8.4/en/innodb-performance-ro-txn.html
- MySQL safe-updates mode prevents broad `UPDATE`/`DELETE` classes where a user
  forgot a targeted condition. It should be enabled for write-capable sessions
  as another guardrail, not as the only guardrail.
  Source: https://dev.mysql.com/doc/refman/9.7/en/mysql-tips.html
- `ROW_COUNT()` reports affected rows for DML, and for `UPDATE` defaults to rows
  actually changed rather than merely matched unless the client uses a found
  rows flag. The environment should record both precheck matched rows and final
  affected rows when possible.
  Source: https://dev.mysql.com/doc/refman/9.7/en/information-functions.html
- MySQL DDL often causes implicit commits. Production DDL should generally be
  routed through migration tooling or a dedicated DDL workflow, not hidden
  inside a normal transactional write path.
  Source: https://dev.mysql.com/doc/en/implicit-commit.html
- LangChain's current SQL agent patterns split SQL access into table listing,
  schema fetching, query generation, query checking, execution, and optional
  human review. This matches the shape this harness should adopt, but with a
  stricter production policy layer.
  Source: https://docs.langchain.com/oss/javascript/langgraph/sql-agent
- Bytebase, Atlas, Flyway, and Liquibase all point toward the same production
  lesson: SQL changes need automated review, linting, dry-run plans, approval
  gates, rollback thinking, and audit history.
  Sources:
  - https://docs.bytebase.com/sql-review/review-policy
  - https://atlasgo.io/versioned/lint
  - https://documentation.red-gate.com/fd/tutorial-dry-runs-277579342.html
  - https://docs.liquibase.com/secure/user-guide-5-2/what-is-a-rollback
- `node-sql-parser` is a practical TypeScript-side AST parser for MySQL and
  MariaDB. It can parse statements, list visited tables/columns, convert AST
  back to SQL, and perform table/column whitelist checks. Use it as one safety
  input, not as a complete security proof.
  Source: https://github.com/taozhi8833998/node-sql-parser

## SpatialClaw Technique To Borrow

`references/SpatialClaw` is useful because it treats code as a stateful action
interface, not a single opaque tool call.

Relevant patterns:

- `workflow.py` builds a graph: initialize -> plan -> generate code -> execute
  -> collect feedback -> reflect -> continue or terminate.
- `kernel/manager.py` keeps a persistent Jupyter kernel, enforces timeouts,
  tracks variables, and can reset/reinject state.
- `kernel/safety.py` statically checks generated code before execution.
- `nodes/feedback_node.py` turns execution results into concise, structured
  feedback, including errors, outputs, changed variables, and checklist status.
- `nodes/reflection_node.py` adds a second review pass before accepting an
  answer.

SQL version of the same idea:

```text
User request
  -> SQL planning step
  -> SQL draft cell
  -> static SQL analysis
  -> schema-aware preflight
  -> execution or approval gate
  -> structured feedback
  -> verification/reflection
```

The persistent "kernel" becomes a `SqlSession`: connection profile, schema
cache, named query drafts, analysis results, preflight artifacts, execution
history, and policy state.

## Core Principle

The model should not receive a raw "run_sql" button.

It should receive a SQL workspace with staged tools:

```text
draft -> analyze -> preflight -> approve -> execute -> verify -> log
```

Read-only queries can move through this quickly. Mutations must go through
preflight and approval. DDL and broad destructive operations should be blocked
or escalated to a migration workflow.

## Proposed Architecture

```text
Runtime
  -> RuntimeTool[]
    -> SqlToolSuite
      -> SqlProfileStore
      -> SqlSessionManager
      -> SqlSchemaIntrospector
      -> SqlAnalyzer
      -> SqlPreflightEngine
      -> SqlRiskPolicy
      -> SqlApprovalManager
      -> SqlExecutor
      -> SqlAuditLog
```

### SqlProfileStore

Stores named connection profiles outside model-visible context.

The model should never pass passwords. It should only refer to a profile ID.
Credentials should come from environment variables, an encrypted local config,
or a future secret manager.

Example profile:

```ts
type SqlConnectionProfile = {
  id: string;
  label: string;
  driver: "mysql" | "mariadb";
  environment: "local" | "dev" | "staging" | "production";
  host: string;
  port: number;
  database?: string;
  usernameEnv: string;
  passwordEnv: string;
  ssl?: {
    caPath?: string;
    certPath?: string;
    keyPath?: string;
    rejectUnauthorized: boolean;
  };
  defaultMode: "read_only" | "read_write_guarded";
  maxResultRows: number;
  maxAffectedRowsWithoutExtraApproval: number;
  allowedSchemas?: string[];
  blockedTables?: string[];
  maskedColumns?: string[];
};
```

### SqlSessionManager

Owns live driver connections and session state.

Each session should:

- pin a single connection while a transaction is open
- use a pool for read-only, stateless calls
- set session options before execution
- track current transaction state
- keep schema cache and query artifacts
- close or reset connections after failures/timeouts

For MySQL write-capable connections, set defensive defaults:

```sql
SET SESSION sql_safe_updates = 1;
SET SESSION lock_wait_timeout = 5;
SET SESSION innodb_lock_wait_timeout = 5;
```

For read tools, prefer:

```sql
START TRANSACTION READ ONLY;
-- bounded schema/read query
COMMIT;
```

### SqlSchemaIntrospector

Provides agent-safe schema context:

- `SHOW DATABASES` or allowed database list
- `SHOW TABLES`
- `information_schema.columns`
- indexes and primary keys
- foreign keys and cascades
- triggers
- table row estimates and sizes from `information_schema.tables`
- optional sample rows with masking

Do not dump the whole production schema into the prompt by default. Return
targeted schema summaries and let the agent ask for more.

### SqlAnalyzer

Performs deterministic static analysis before any execution.

Inputs:

- SQL string
- parameters
- active profile policy
- cached schema metadata

Checks:

- parse SQL using a MySQL/MariaDB parser
- reject multiple statements by default
- classify statement type: read, DML, DDL, admin, transaction control
- extract visited tables and columns
- enforce allowed schemas/tables/columns
- reject or escalate comments with suspicious directives
- reject interpolation placeholders that were not passed as parameters
- require a bounded `LIMIT` for exploratory `SELECT`
- require `WHERE` for `UPDATE`/`DELETE`
- require key-aware predicates or explicit approval for DML
- flag joins, subqueries, wildcard columns, and unbounded scans
- flag DDL implicit-commit risk
- flag operations on tables with triggers/cascades

Output:

```ts
type SqlAnalysisResult = {
  statementType: "select" | "insert" | "update" | "delete" | "replace" | "ddl" | "admin" | "unknown";
  normalizedSql: string;
  fingerprint: string;
  tables: Array<{ action: string; schema?: string; table: string }>;
  columns: Array<{ action: string; table?: string; column: string }>;
  riskLevel: "low" | "medium" | "high" | "blocked";
  warnings: string[];
  blockers: string[];
  requiresPreflight: boolean;
  requiresHumanApproval: boolean;
};
```

### SqlPreflightEngine

Builds evidence before the mutation can run.

For `SELECT`:

- run `EXPLAIN FORMAT=JSON` where supported
- enforce max row return
- add or require `LIMIT`
- mask configured columns in returned data

For `UPDATE`:

- derive a matched-row count:
  `SELECT COUNT(*) FROM target WHERE same_predicate`
- preview primary keys and selected columns:
  `SELECT pk, changed_columns FROM target WHERE same_predicate LIMIT N`
- check whether changed columns are indexed, unique, foreign keys, or masked
- estimate whether the query will scan too much
- optionally generate a verification query

For `DELETE`:

- derive `SELECT COUNT(*) FROM target WHERE same_predicate`
- preview primary keys
- inspect foreign keys and cascades
- require a backup/export strategy for medium/high risk deletes

For `INSERT`:

- count explicit `VALUES` rows or source rows for `INSERT ... SELECT`
- inspect unique constraints and duplicate-key behavior
- flag `REPLACE` or `ON DUPLICATE KEY UPDATE` as higher risk

For DDL:

- block from the normal execution path by default
- report table size, index size, engine, row estimate
- flag implicit commit
- recommend a migration file or DBA-style reviewed runbook
- for MySQL 8+, prefer explicit `ALGORITHM` and `LOCK` clauses when relevant

### SqlRiskPolicy

Suggested default risk levels:

```text
low
  Bounded SELECT, SHOW, DESCRIBE, EXPLAIN in read-only transaction.

medium
  DML with WHERE, key-bounded predicate, low matched rows, no cascades/triggers,
  clear verification query, and profile threshold not exceeded.

high
  Multi-table DML, non-key predicates, large matched-row count, missing LIMIT
  on previews, triggers/cascades, INSERT...SELECT, REPLACE, ON DUPLICATE KEY,
  production profile, or DDL.

blocked
  UPDATE/DELETE without WHERE, DROP/TRUNCATE in production, multiple statements,
  transaction-control statements from the model, credential exfiltration,
  writing to blocked tables, or any statement the parser cannot classify.
```

### SqlApprovalManager

The current runtime does not yet have a first-class interrupt/human approval
primitive. We can start with a simple approval token flow and evolve the TUI.

First version:

- `sql_prepare_write` returns a `planId`, risk assessment, precheck evidence,
  warnings, and an exact approval phrase.
- The assistant must show the plan to the user.
- `sql_execute_approved` requires the exact `planId` and approval phrase.
- The approval phrase should include environment and affected-row count, for
  example:

```text
APPROVE PROD SQL plan_20260620_153012 affects 14 rows
```

Better later version:

- runtime emits `approval_requested`
- TUI renders a review panel
- user can accept, reject, or edit the SQL
- approval is stored in the audit log with timestamp and user identity

### SqlExecutor

Executes only analyzed/preflighted plans.

Read execution:

```text
connect
START TRANSACTION READ ONLY
execute prepared statement with parameters
truncate/mask result
COMMIT
return rows + fields + timing + warnings
```

Write execution:

```text
connect pinned connection
verify plan fingerprint still matches submitted SQL
repeat critical precheck immediately before execution
START TRANSACTION
execute prepared statement with parameters
read driver affectedRows + SELECT ROW_COUNT()
run verification query
COMMIT or ROLLBACK according to policy
write audit event
return execution summary
```

Do not hold a production transaction open while waiting for a human to think.
If a commit gate is used, it should be time-limited and reserved for low-row
operations. The safer default is preflight -> human approval -> execute and
commit quickly -> verify.

### SqlAuditLog

Append-only, no secrets.

Suggested event fields:

```ts
type SqlAuditEvent = {
  eventId: string;
  timestamp: string;
  sessionId?: string;
  profileId: string;
  environment: string;
  database?: string;
  serverVersion?: string;
  actor: "agent" | "user";
  toolName: string;
  planId?: string;
  sqlFingerprint?: string;
  normalizedSql?: string;
  paramsShape?: unknown;
  riskLevel?: string;
  warnings?: string[];
  blockers?: string[];
  precheck?: unknown;
  approval?: {
    approvedBy: string;
    approvedAt: string;
    phrase: string;
  };
  result?: {
    rowCount?: number;
    affectedRows?: number;
    changedRows?: number;
    warningStatus?: number;
    durationMs?: number;
  };
  error?: string;
};
```

Candidate storage:

```text
sessions/YYYY-MM-DD/sql-audit.jsonl
```

## Agent Tool Surface

Recommended initial tools:

### `sql_list_profiles`

Returns safe metadata for configured profiles. No secrets.

### `sql_connect`

Validates connectivity and returns server metadata:

- server version
- current database
- current user
- read-only status if detectable
- driver capabilities

### `sql_list_tables`

Read-only table listing for the active database or an allowed schema.

### `sql_describe_tables`

Returns columns, types, nullable, defaults, keys, indexes, foreign keys,
triggers, row estimates, and optionally masked sample rows.

### `sql_analyze_query`

Static analysis only. No database mutation.

### `sql_explain_query`

Runs `EXPLAIN` for allowed statements. For DML, this is plan evidence only and
does not count affected rows.

### `sql_execute_read`

Runs bounded read-only statements in a read-only transaction.

### `sql_prepare_write`

For `INSERT`, `UPDATE`, `DELETE`, `REPLACE`. Produces preflight evidence,
warnings, risk level, and an approval phrase. Does not mutate data.

### `sql_execute_approved`

Executes a previously prepared write plan after approval.

### `sql_generate_runbook`

Turns a high-risk or DDL request into a human-readable runbook or migration
draft instead of executing directly.

## Fit With Current Repo

Current harness:

- `runtime.ts` already supports `RuntimeTool.execute`.
- `index.ts` registers tools inline.
- `context-builder.ts` appends project instructions and skill metadata.
- There is not yet a permission resolver, human approval event, durable tool
  audit model, or external secret/profile system.

Initial scaffold now present:

- `tools/sql-workspace/runner.ts` starts and manages a persistent Python worker.
- `tools/sql-workspace/worker.py` accepts JSON lines over stdin and executes
  code cells with `exec(code, namespace)`.
- The worker injects a thin `sql` SDK facade into both `sys.modules` and the
  persistent execution namespace.
- `tools/sql-runtime/runtime.ts` owns the active SQL runtime operations
  (`status`, `profiles`, `connect`, `recon`, `describe_table`, and bounded
  read-only `read`).
- `tools/sql-runtime/server.ts` exposes those operations as a localhost-only
  token-protected HTTP RPC server.
- `tools/sql-workspace/index.ts` exposes the runtime tool
  `sql_workspace_run`.
- `index.ts` starts the TypeScript SQL runtime server, passes only the runtime
  URL/token/session ID into Python, wires `sql_workspace_run` into the active
  runtime tool list, and stops both the Python worker and SQL runtime server
  during shutdown.
- `tests/sql-workspace-namespace/` proves the raw stdin/namespace mechanism.
- `tests/sql-workspace-tool/` proves the actual runtime tool wrapper path and
  verifies subprocess bypass attempts are rejected.
- `tests/sql-workspace-xampp/` proves Python SDK calls are routed through the
  TypeScript SQL runtime before reaching local XAMPP MySQL/MariaDB.

This scaffold locks in the execution boundary: the agent writes Python code
cells, Python uses a preloaded `sql` facade as a control-language SDK, and the
real SQL access layer remains owned by the TypeScript runtime/gateway layer
rather than by generated Python code.

Suggested file layout:

```text
tools/
  sql/
    index.ts
    types.ts
    profiles.ts
    session-manager.ts
    schema-introspector.ts
    analyzer.ts
    preflight.ts
    risk-policy.ts
    approvals.ts
    executor.ts
    audit-log.ts
    format.ts
```

Dependencies for first implementation:

```text
mysql2
node-sql-parser
```

Keep TypeBox for tool parameter schemas, since the project already uses it.
Do not introduce an ORM for the core execution path. ORMs are useful for app
data access, but this tool needs transparent, auditable SQL control.

## Production Direct SQL Guide

Default stance:

```text
Read-only is normal.
Writes are exceptional.
DDL is a migration/runbook, not an agent impulse.
```

Before enabling production writes:

1. Use a least-privilege database user. No root account.
2. Prefer separate profiles for read-only and write-capable access.
3. Confirm point-in-time recovery, snapshot backup, or export strategy.
4. Require SSL or an SSH tunnel for remote production access.
5. Configure blocked tables and masked columns.
6. Set conservative thresholds, for example 10 affected rows without extra
   approval and 100 rows as a hard block for direct writes.
7. Test every tool against local/staging MySQL before production.
8. Ensure audit logs are append-only and exclude credentials.

For every production write:

1. Confirm profile and environment.
2. Analyze statement.
3. Preflight affected rows and sample keys.
4. Show risk level, warnings, exact SQL, parameters, affected-row estimate, and
   verification query.
5. Require explicit approval phrase.
6. Repeat critical precheck immediately before execution.
7. Execute with timeouts and lock wait limits.
8. Verify result.
9. Log everything.

Never allow these by default in production:

- `DROP`
- `TRUNCATE`
- unbounded `UPDATE` or `DELETE`
- multiple statements in one call
- direct credential changes
- grant/revoke/user admin
- broad DDL through normal write execution
- statements the parser cannot classify

## Implementation Phases

### Phase 1: Read-Only SQL Workspace

- Add profile loading from environment variables.
- Add `mysql2/promise`.
- Add `sql_list_profiles`, `sql_connect`, `sql_list_tables`,
  `sql_describe_tables`, and `sql_execute_read`.
- Enforce read-only transaction and max result rows.
- Add audit logging for all SQL tool calls.

### Phase 2: Static Analysis And Explain

- Add `node-sql-parser`.
- Add statement classification, table/column extraction, multiple-statement
  rejection, and basic risk policy.
- Add `sql_analyze_query` and `sql_explain_query`.
- Require bounded SELECT queries.

### Phase 3: Mutation Preflight

- Add `sql_prepare_write`.
- Implement row-count and sample-key previews for single-table
  `UPDATE`/`DELETE`.
- Add threshold policy and approval phrase generation.
- Do not execute writes yet.

### Phase 4: Guarded Writes

- Add approval manager.
- Add `sql_execute_approved`.
- Run writes through prepared statements, transactions, immediate precheck
  repeat, verification query, and audit log.
- Block DDL.

### Phase 5: DDL/Migration Workflow

- Add `sql_generate_runbook`.
- Optionally integrate Atlas/Flyway/Liquibase style migration lint/dry-run.
- Treat production schema changes as reviewed artifacts, not normal tool calls.

### Phase 6: Runtime-Level Approvals

- Extend `RuntimeEvent` with `approval_requested` and `approval_resolved`.
- Add a TUI approval panel.
- Replace approval phrases with explicit accept/reject/edit UI actions.

## Open Questions

- Is the target server MySQL or MariaDB, and what version does phpMyAdmin show?
- Is direct MySQL TCP access available, or only phpMyAdmin web access?
- Can we use SSH tunneling to the hosting account?
- Do you have production backups or point-in-time recovery?
- Should the first implementation be read-only, or do you want mutation
  preflight modeled immediately?
- Where should local secrets live: `.env`, OS keychain, or a future secret
  manager?
