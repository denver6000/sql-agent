import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SqlRuntime } from "../../tools/sql-runtime/runtime.js";
import { startSqlRuntimeServer } from "../../tools/sql-runtime/server.js";
import { createSqlWorkspaceTool } from "../../tools/sql-workspace/index.js";
import { SqlWorkspaceRunner } from "../../tools/sql-workspace/runner.js";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, "..", "..");
const runtime = new SqlRuntime({
  backend: "mysql",
  host: process.env.SQL_HOST ?? "127.0.0.1",
  port: process.env.SQL_PORT ?? "3306",
  user: process.env.SQL_USER ?? "root",
  password: process.env.SQL_PASSWORD ?? "",
  database: process.env.SQL_DATABASE ?? "",
});
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
  console.log(`[xampp-test] ${label}`);
  console.log(code);
  const result = await tool.execute?.({ code }, {
    toolCall: {
      id: randomUUID(),
      name: "sql_workspace_run",
      arguments: { code },
    },
  });
  console.log("[xampp-test] result:");
  console.log(JSON.stringify(result, null, 2));
}

try {
  await call(
    "status checks the local XAMPP MySQL/MariaDB server",
    [
      "import sql",
      "print('profiles:', sql.profiles())",
      "print('workspace status:', sql.status())",
      "db = sql.connect()",
      "print('db status:', db.status())",
      "print('read databases:', db.read('SHOW DATABASES', limit=5))",
    ].join("\n"),
  );

  await call(
    "recon lists schemas and tables if SQL_DATABASE is configured",
    [
      "import sql",
      "recon = db.recon('local xampp schema recon')",
      "print('recon:', recon.summary())",
    ].join("\n"),
  );

  await call(
    "create-only DDL creates a local test database through mysql2 runtime",
    [
      "import sql",
      "db = sql.connect()",
      "queries = [",
      "    'CREATE DATABASE IF NOT EXISTS AgentDatabase',",
      "    'CREATE TABLE IF NOT EXISTS AgentDatabase.users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',",
      "    'CREATE TABLE IF NOT EXISTS AgentDatabase.projects (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, title VARCHAR(200) NOT NULL, status VARCHAR(50) NOT NULL DEFAULT \\'active\\', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES AgentDatabase.users(id) ON DELETE CASCADE)',",
      "    'CREATE TABLE IF NOT EXISTS AgentDatabase.tasks (id INT AUTO_INCREMENT PRIMARY KEY, project_id INT NOT NULL, description TEXT NOT NULL, priority TINYINT NOT NULL DEFAULT 3, completed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (project_id) REFERENCES AgentDatabase.projects(id) ON DELETE CASCADE)',",
      "]",
      "for query in queries:",
      "    print(db.execute(query))",
      "print(db.read('SHOW TABLES FROM AgentDatabase', limit=10))",
    ].join("\n"),
  );

  await call(
    "DML writes run through mysql2 runtime with targeted guards",
    [
      "import sql",
      "db = sql.connect()",
      "email = 'write-test@example.test'",
      "print(db.write('DELETE FROM AgentDatabase.users WHERE email = ?', [email]))",
      "print(db.write('INSERT INTO AgentDatabase.users (name, email) VALUES (?, ?)', ['Write Test', email]))",
      "print(db.write('UPDATE AgentDatabase.users SET name = ? WHERE email = ?', ['Write Test Updated', email]))",
      "print(db.read('SELECT id, name, email FROM AgentDatabase.users WHERE email = ?', [email], limit=5))",
      "print(db.write('DELETE FROM AgentDatabase.users WHERE email = ?', [email]))",
      "try:",
      "    print(db.write('DELETE FROM AgentDatabase.users'))",
      "except Exception as error:",
      "    print('blocked broad delete:', error)",
    ].join("\n"),
  );
} finally {
  runner.stop();
  await server.close();
  await runtime.close();
}
