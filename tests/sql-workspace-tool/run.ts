import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqlRuntime } from "../../tools/sql-runtime/runtime.js";
import { startSqlRuntimeServer } from "../../tools/sql-runtime/server.js";
import { createSqlWorkspaceTool } from "../../tools/sql-workspace/index.js";
import { SqlWorkspaceRunner } from "../../tools/sql-workspace/runner.js";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, "..", "..");
const runtime = new SqlRuntime({ backend: "scaffold" });
const server = await startSqlRuntimeServer({ runtime });
const runner = new SqlWorkspaceRunner({
  pythonPath: process.env.PYTHON ?? "python",
  workerPath: join(workspaceRoot, "tools", "sql-workspace", "worker.py"),
  sessionId: randomUUID(),
  runtimeUrl: server.url,
  runtimeToken: server.token,
});
const tool = createSqlWorkspaceTool({ runner });

async function call(label: string, code: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`[test] ${label}`);
  console.log(code);
  const result = await tool.execute?.({ code }, {
    toolCall: {
      id: randomUUID(),
      name: "sql_workspace_run",
      arguments: { code },
    },
  });
  console.log("[test] result:");
  console.log(JSON.stringify(result, null, 2));
}

try {
  await call(
    "cell 1 creates db and recon",
    [
      "import sql",
      "print(sql.help())",
      "db = sql.connect()",
      "recon = db.recon('find leave requests', tables_hint=['leave_requests'])",
      "print(recon.summary())",
    ].join("\n"),
  );

  await call(
    "cell 2 reuses db and recon",
    [
      "import sql",
      "db2 = sql.connect()",
      "print('same db:', db is db2)",
      "print('status:', sql.status())",
      "print('recon:', recon.summary())",
    ].join("\n"),
  );

  await call(
    "cell 3 rejects subprocess bypass",
    [
      "import subprocess",
      "print(subprocess.run(['echo', 'bad'], capture_output=True, text=True).stdout)",
    ].join("\n"),
  );
} finally {
  runner.stop();
  await server.close();
  await runtime.close();
}
