import { Type } from "typebox";
import type { RuntimeTool } from "../../runtime.js";
import { SqlWorkspaceRunner } from "./runner.js";
import { NoopRuntimeLogger, type RuntimeLogger } from "../../logging.js";

export type SqlWorkspaceToolOptions = {
  runner: SqlWorkspaceRunner;
  defaultTimeoutMs?: number;
  logger?: RuntimeLogger;
};

export function createSqlWorkspaceTool(options: SqlWorkspaceToolOptions): RuntimeTool {
  const logger = options.logger ?? new NoopRuntimeLogger();

  return {
    name: "sql_workspace_run",
    description: [
      "Run Python code in a persistent SQL workspace for the active local SQL database.",
      "Use this tool for database/schema/table/row work instead of bash or filesystem inspection.",
      "Always start with `import sql`, `db = sql.connect()`, and optionally `print(sql.status())` / `print(db.status())`.",
      "Only `sql` is available for imports unless the worker explicitly allows more.",
      "Prefer helper methods for discovery: `db.tables()` returns table names, `db.columns(table)` returns column metadata, and `db.schema(table)` returns columns plus CREATE TABLE SQL.",
      "Run SQL with `db.execute(query, params=None)`, `db.read(query, params=None, limit=None)`, or `db.write(query, params=None)`.",
      "The SQL runtime allows arbitrary local SQL, including SELECT, DDL, DML, destructive statements, and multiple statements.",
      "Rows are list-like dictionaries: use `row['column']`, `row.column`, `row[0]`, or `for _, row in rows.iterrows()`.",
      "Use MySQL/MariaDB SQL for the local backend; do not use SQLite-only metadata such as `sqlite_master`.",
      "Parameter placeholders may use Python-style `%s` or mysql2-style `?`.",
      "Example: `import sql\\ndb = sql.connect()\\nfor table in db.tables():\\n    print(table, db.columns(table))`.",
      "The runtime chooses credentials and the active database; generated code should not choose hosts, credentials, or profile names.",
    ].join(" "),
    parameters: Type.Object({
      code: Type.String({
        description: "Python code to execute in the persistent SQL workspace.",
      }),
      timeoutMs: Type.Optional(Type.Number({
        description: "Optional execution timeout in milliseconds.",
      })),
    }),
    execute: async (args) => {
      return logger.trace(
        {
          className: "SqlWorkspaceTool",
          functionName: "execute",
          params: args,
        },
        async () => {
          const code = requireString(args.code, "code");
          const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : options.defaultTimeoutMs;
          const result = await options.runner.execute(code, timeoutMs);

          return {
            isError: !result.ok,
            content: formatResult(result),
            details: result,
          };
        },
      );
    },
  };
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string") throw new Error(`Expected '${name}' to be a string.`);
  return value;
}

function formatResult(result: Awaited<ReturnType<SqlWorkspaceRunner["execute"]>>) {
  const parts = [
    result.stdout.trim() && `[stdout]\n${result.stdout.trim()}`,
    result.stderr.trim() && `[stderr]\n${result.stderr.trim()}`,
    result.error?.trim() && `[error]\n${result.error.trim()}`,
    `[namespace]\n${result.namespaceKeys.length ? result.namespaceKeys.join(", ") : "(empty)"}`,
    result.sqlStatus ? `[sql_status]\n${JSON.stringify(result.sqlStatus, null, 2)}` : "",
  ].filter(Boolean);

  return parts.join("\n\n") || "(no output)";
}
