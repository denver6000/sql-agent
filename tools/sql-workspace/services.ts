import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { RuntimeLogger } from "../../logging.js";
import type { ResolvedSqlRuntimeConfig } from "../../sql-credentials.js";
import { SqlRuntime, type SqlRuntimeBackend } from "../sql-runtime/runtime.js";
import { startSqlRuntimeServer, type SqlRuntimeServer } from "../sql-runtime/server.js";
import { SqlWorkspaceRunner } from "./runner.js";
import { SqlWorkspaceWorkerManager } from "./worker_manager.js";

export type SqlWorkspaceServices = {
  backend: SqlRuntimeBackend;
  runtime: SqlRuntime;
  server: SqlRuntimeServer;
  worker: SqlWorkspaceWorkerManager;
  runner: SqlWorkspaceRunner;
  shutdown: () => Promise<void>;
};

export async function createSqlWorkspaceServices(options: {
  config: ResolvedSqlRuntimeConfig;
  logger: RuntimeLogger;
}): Promise<SqlWorkspaceServices> {
  const { config, logger } = options;
  const backend = config.backend as SqlRuntimeBackend;
  const runtime = new SqlRuntime({
    backend,
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    logger,
  });
  const server = await startSqlRuntimeServer({ runtime, logger });
  const worker = new SqlWorkspaceWorkerManager({
    pythonPath: process.env.PYTHON ?? "python",
    workerPath: fileURLToPath(new URL("./worker.py", import.meta.url)),
    sessionId: randomUUID(),
    runtimeUrl: server.url,
    runtimeToken: server.token,
    logger,
  });
  worker.start();
  const runner = new SqlWorkspaceRunner({
    worker,
    logger,
  });

  return {
    backend,
    runtime,
    server,
    worker,
    runner,
    shutdown: async () => {
      runner.stop();
      worker.stop();
      await server.close();
      await runtime.close();
    },
  };
}
