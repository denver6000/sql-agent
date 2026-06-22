import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

export type SqlWorkspaceRunnerOptions = {
  pythonPath: string;
  workerPath: string;
  sessionId: string;
  runtimeUrl?: string;
  runtimeToken?: string;
  env?: Record<string, string | undefined>;
  startupTimeoutMs?: number;
};

export type SqlWorkspaceExecutionResult = {
  id: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  namespaceKeys: string[];
  sqlStatus?: unknown;
};

type PendingExecution = {
  resolve: (response: SqlWorkspaceExecutionResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class SqlWorkspaceRunner {
  private child?: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, PendingExecution>();

  constructor(private readonly options: SqlWorkspaceRunnerOptions) {}

  start() {
    if (this.child) return;

    this.child = spawn(this.options.pythonPath, [this.options.workerPath], {
      stdio: "pipe",
      env: {
        ...process.env,
        ...this.options.env,
        SQL_WORKSPACE_SESSION_ID: this.options.sessionId,
        SQL_RUNTIME_URL: this.options.runtimeUrl ?? "not-configured",
        SQL_RUNTIME_TOKEN: this.options.runtimeToken ?? "",
      },
    });

    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      let response: SqlWorkspaceExecutionResult;
      try {
        response = JSON.parse(line) as SqlWorkspaceExecutionResult;
      } catch (error) {
        this.rejectAll(new Error(`SQL workspace worker returned invalid JSON: ${line}`));
        return;
      }

      const pending = this.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(response.id);
      pending.resolve(response);
    });

    this.child.on("error", (error) => {
      this.rejectAll(error instanceof Error ? error : new Error(String(error)));
      this.child = undefined;
    });

    this.child.on("exit", (code, signal) => {
      this.rejectAll(new Error(`SQL workspace worker exited with code=${code} signal=${signal}`));
      this.child = undefined;
    });
  }

  execute(code: string, timeoutMs = 30_000): Promise<SqlWorkspaceExecutionResult> {
    this.start();

    if (!this.child) {
      throw new Error("SQL workspace worker failed to start.");
    }

    const id = randomUUID();
    const payload = JSON.stringify({ id, type: "execute", code });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`SQL workspace execution timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      this.child?.stdin.write(`${payload}\n`);
    });
  }

  stop() {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("SQL workspace runner stopped."));
    }
    this.pending.clear();

    this.child?.kill();
    this.child = undefined;
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
