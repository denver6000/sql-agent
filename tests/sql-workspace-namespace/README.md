# SQL Workspace Namespace Test

This test demonstrates the exact execution relationship discussed for the
future `sql_workspace_run` tool.

It proves:

- TypeScript starts one persistent Python process with `spawn`.
- Python injects a fake `sql` module into `sys.modules` and the execution
  namespace.
- TypeScript sends agent-like Python code strings over stdin.
- Python executes each string with `exec(code, namespace)`.
- Variables such as `db` and `recon` persist between code cells.
- `import sql` reuses the same module inside the persistent Python process.
- A broken code cell returns an error but does not kill the worker.
- A corrected cell after the error still sees the same `sql` state.
- Reusing `sql.use("prod-readonly")` does not create a second fake connection.

Run:

```bash
bun run tests/sql-workspace-namespace/run.ts
```

If your Python executable is not named `python`, set:

```bash
PYTHON=py bun run tests/sql-workspace-namespace/run.ts
```
