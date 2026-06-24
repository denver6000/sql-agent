import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { NoopRuntimeLogger, type RuntimeLogger } from "../../logging.js";

export type SqlWorkspaceRunnerOptions = {
  pythonPath: string;
  workerPath: string;
  sessionId: string;
  runtimeUrl?: string;
  runtimeToken?: string;
  env?: Record<string, string | undefined>;
  startupTimeoutMs?: number;
  logger?: RuntimeLogger;
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
  private readonly logger: RuntimeLogger;

  constructor(private readonly options: SqlWorkspaceRunnerOptions) {
    this.logger = options.logger ?? new NoopRuntimeLogger();
  }

  start() {
    if (this.child) return;

    void this.logger.log({
      level: "info",
      event: "function_call_start",
      className: "SqlWorkspaceRunner",
      functionName: "start",
      params: {
        pythonPath: this.options.pythonPath,
        workerPath: this.options.workerPath,
        sessionId: this.options.sessionId,
        runtimeUrl: this.options.runtimeUrl,
        runtimeToken: this.options.runtimeToken,
        env: this.options.env,
      },
    });

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
        void this.logger.log({
          level: "error",
          event: "worker_invalid_json",
          className: "SqlWorkspaceRunner",
          functionName: "start",
          params: { line },
          error,
        });
        this.rejectAll(new Error(`SQL workspace worker returned invalid JSON: ${line}`));
        return;
      }

      const pending = this.pending.get(response.id);
      if (!pending) {
        void this.logger.log({
          level: "warn",
          event: "worker_unmatched_response",
          className: "SqlWorkspaceRunner",
          functionName: "start",
          returnValue: response,
        });
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(response.id);
      pending.resolve(response);
    });

    this.child.on("error", (error) => {
      void this.logger.log({
        level: "error",
        event: "worker_process_error",
        className: "SqlWorkspaceRunner",
        functionName: "start",
        error,
      });
      this.rejectAll(error instanceof Error ? error : new Error(String(error)));
      this.child = undefined;
    });

    this.child.on("exit", (code, signal) => {
      void this.logger.log({
        level: "warn",
        event: "worker_process_exit",
        className: "SqlWorkspaceRunner",
        functionName: "start",
        returnValue: { code, signal },
      });
      this.rejectAll(new Error(`SQL workspace worker exited with code=${code} signal=${signal}`));
      this.child = undefined;
    });

    void this.logger.log({
      level: "info",
      event: "function_call_return",
      className: "SqlWorkspaceRunner",
      functionName: "start",
      returnValue: { pid: this.child.pid },
    });
  }

  execute(code: string, timeoutMs = 30_000): Promise<SqlWorkspaceExecutionResult> {
    return this.logger.trace(
      {
        className: "SqlWorkspaceRunner",
        functionName: "execute",
        params: { code, timeoutMs },
      },
      () => this.executeInternal(code, timeoutMs),
    );
  }

  private executeInternal(code: string, timeoutMs = 30_000): Promise<SqlWorkspaceExecutionResult> {
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
    void this.logger.log({
      level: "info",
      event: "function_call_start",
      className: "SqlWorkspaceRunner",
      functionName: "stop",
      params: { pendingCount: this.pending.size },
    });

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("SQL workspace runner stopped."));
    }
    this.pending.clear();

    this.child?.kill();
    this.child = undefined;

    void this.logger.log({
      level: "info",
      event: "function_call_return",
      className: "SqlWorkspaceRunner",
      functionName: "stop",
      returnValue: { stopped: true },
    });
  }

  private rejectAll(error: Error) {
    void this.logger.log({
      level: "warn",
      event: "function_call_start",
      className: "SqlWorkspaceRunner",
      functionName: "rejectAll",
      params: { pendingCount: this.pending.size, error },
    });
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
    void this.logger.log({
      level: "warn",
      event: "function_call_return",
      className: "SqlWorkspaceRunner",
      functionName: "rejectAll",
      returnValue: { pendingCount: this.pending.size },
    });
  }
}
