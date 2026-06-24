import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { NoopRuntimeLogger, type RuntimeLogger } from "../../logging.js";

export type SqlWorkspaceWorkerManagerOptions = {
  pythonPath: string;
  workerPath: string;
  sessionId: string;
  runtimeUrl?: string;
  runtimeToken?: string;
  env?: Record<string, string | undefined>;
  logger?: RuntimeLogger;
};

export type SqlWorkspaceWorkerRequest = {
  id: string;
  type: "execute";
  code: string;
};

export type SqlWorkspaceWorkerResponse = {
  id: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  namespaceKeys: string[];
  sqlStatus?: unknown;
};

export class SqlWorkspaceWorkerManager {
  private child?: ChildProcessWithoutNullStreams;
  private lines?: Interface;
  private stopping = false;
  private readonly logger: RuntimeLogger;
  private readonly responseHandlers = new Set<(response: SqlWorkspaceWorkerResponse) => void>();
  private readonly failureHandlers = new Set<(error: Error) => void>();

  constructor(private readonly options: SqlWorkspaceWorkerManagerOptions) {
    this.logger = options.logger ?? new NoopRuntimeLogger();
  }

  start() {
    if (this.child) return;
    this.stopping = false;

    void this.logger.log({
      level: "info",
      event: "function_call_start",
      className: "SqlWorkspaceWorkerManager",
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

    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on("line", (line) => this.handleWorkerLine(line));

    this.child.on("error", (error) => {
      void this.logger.log({
        level: "error",
        event: "worker_process_error",
        className: "SqlWorkspaceWorkerManager",
        functionName: "start",
        error,
      });
      this.notifyFailure(error instanceof Error ? error : new Error(String(error)));
      this.child = undefined;
    });

    this.child.on("exit", (code, signal) => {
      void this.logger.log({
        level: "warn",
        event: "worker_process_exit",
        className: "SqlWorkspaceWorkerManager",
        functionName: "start",
        returnValue: { code, signal },
      });
      if (!this.stopping) {
        this.notifyFailure(new Error(`SQL workspace worker exited with code=${code} signal=${signal}`));
      }
      this.child = undefined;
    });

    void this.logger.log({
      level: "info",
      event: "function_call_return",
      className: "SqlWorkspaceWorkerManager",
      functionName: "start",
      returnValue: { pid: this.child.pid },
    });
  }

  isRunning() {
    return Boolean(this.child);
  }

  send(request: SqlWorkspaceWorkerRequest) {
    if (!this.child) {
      throw new Error("SQL workspace worker is not running.");
    }

    this.child.stdin.write(`${JSON.stringify(request)}\n`);
  }

  onResponse(handler: (response: SqlWorkspaceWorkerResponse) => void) {
    this.responseHandlers.add(handler);
  }

  onFailure(handler: (error: Error) => void) {
    this.failureHandlers.add(handler);
  }

  stop() {
    void this.logger.log({
      level: "info",
      event: "function_call_start",
      className: "SqlWorkspaceWorkerManager",
      functionName: "stop",
      params: { running: this.isRunning() },
    });

    this.lines?.close();
    this.lines = undefined;
    this.stopping = true;
    this.child?.kill();
    this.child = undefined;

    void this.logger.log({
      level: "info",
      event: "function_call_return",
      className: "SqlWorkspaceWorkerManager",
      functionName: "stop",
      returnValue: { stopped: true },
    });
  }

  private handleWorkerLine(line: string) {
    let response: SqlWorkspaceWorkerResponse;
    try {
      response = JSON.parse(line) as SqlWorkspaceWorkerResponse;
    } catch (error) {
      void this.logger.log({
        level: "error",
        event: "worker_invalid_json",
        className: "SqlWorkspaceWorkerManager",
        functionName: "handleWorkerLine",
        params: { line },
        error,
      });
      this.notifyFailure(new Error(`SQL workspace worker returned invalid JSON: ${line}`));
      return;
    }

    for (const handler of this.responseHandlers) {
      handler(response);
    }
  }

  private notifyFailure(error: Error) {
    for (const handler of this.failureHandlers) {
      handler(error);
    }
  }
}
