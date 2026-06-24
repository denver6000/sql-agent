# CodingAgent Codex Guidance

This repository is a personal SQL agent runtime and learning artifact. Follow the broader project guidance in [`AGENTS.md`](./AGENTS.md).

## Current Direction

The repo has pivoted from a general coding-agent harness into a primarily SQL-focused agent runtime.

Treat SQL work as the main architectural thread:

- model-generated code should call `sql_workspace_run`
- generated Python should use `import sql` and the injected SQL facade
- TypeScript should own credentials, backend selection, database execution, and future SQL policy
- shell tools and file tools are for repo work, not database/schema/table/row work

Do not steer the agent toward `mysql.exe`, ad hoc Python database drivers, direct credential handling, or shell-based SQL access unless the user explicitly asks for that design change.

## SQL Safety Posture

Read-only exploration is the default. Writes should be treated as exceptional and should move toward explicit planning, preflight evidence, approval, verification, and audit logging.

The intended future workflow is:

```text
draft -> analyze -> preflight -> approve -> execute -> verify -> log
```

When working on SQL features, preserve the boundary between:

- Python as the agent-facing control workspace
- TypeScript as the SQL runtime and policy layer
- database credentials as runtime-owned configuration

## Implementation Boundaries

Implement only the behavior or code changes that were explicitly requested or already agreed upon.

If a missing prerequisite, design gap, edge case, bug, refactor, helper, dependency, test, or "obvious" improvement appears while working, stop before implementing it. Explain what you found and ask for approval before adding that fix.

This applies even when the extra work seems necessary to complete a basic feature. The user wants the software to reflect their intended design down to small details, so surface proposed additions as choices before they become code.

Prefer small, inspectable changes that match the requested shape over autonomous completion of adjacent work.
