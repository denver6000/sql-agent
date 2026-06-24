import { randomUUID } from "node:crypto";
import { NoopRuntimeLogger, type RuntimeLogger } from "../../logging.js";
import {
  SqlWorkspaceWorkerManager,
  type SqlWorkspaceWorkerRequest,
  type SqlWorkspaceWorkerResponse,
} from "./worker_manager.js";

export type SqlWorkspaceRunnerOptions = {
  worker: SqlWorkspaceWorkerManager;
  logger?: RuntimeLogger;
};

export type SqlWorkspaceExecutionResult = SqlWorkspaceWorkerResponse;

type PendingExecution = {
  resolve: (response: SqlWorkspaceExecutionResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class SqlWorkspaceRunner {
  private readonly pending = new Map<string, PendingExecution>();
  private readonly logger: RuntimeLogger;
  private readonly worker: SqlWorkspaceWorkerManager;

  constructor(private readonly options: SqlWorkspaceRunnerOptions) {
    this.logger = options.logger ?? new NoopRuntimeLogger();
    this.worker = options.worker;
    this.worker.onResponse((response) => this.resolveExecution(response));
    this.worker.onFailure((error) => this.rejectAll(error));
  }

  start() {
    this.worker.start();
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
    const id = randomUUID();
    const request: SqlWorkspaceWorkerRequest = { id, type: "execute", code };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`SQL workspace execution timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });
      try {
        this.worker.send(request);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
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

    void this.logger.log({
      level: "info",
      event: "function_call_return",
      className: "SqlWorkspaceRunner",
      functionName: "stop",
      returnValue: { stopped: true },
    });
  }

  private resolveExecution(response: SqlWorkspaceExecutionResult) {
    const pending = this.pending.get(response.id);
    if (!pending) {
      void this.logger.log({
        level: "warn",
        event: "worker_unmatched_response",
        className: "SqlWorkspaceRunner",
        functionName: "resolveExecution",
        returnValue: response,
      });
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    pending.resolve(response);
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
