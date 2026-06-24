import { mkdir, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

export type RuntimeLogEntry = {
  timestamp: string;
  level: RuntimeLogLevel;
  event: string;
  className?: string;
  functionName?: string;
  callId?: string;
  durationMs?: number;
  params?: unknown;
  returnValue?: unknown;
  error?: unknown;
  details?: unknown;
};

export interface RuntimeLogger {
  log(entry: Omit<RuntimeLogEntry, "timestamp">): Promise<void> | void;
  trace<T>(
    input: {
      className: string;
      functionName: string;
      params?: unknown;
      details?: unknown;
    },
    action: () => Promise<T> | T,
  ): Promise<T>;
}

export class NoopRuntimeLogger implements RuntimeLogger {
  log(_entry: Omit<RuntimeLogEntry, "timestamp">) {}

  async trace<T>(
    _input: {
      className: string;
      functionName: string;
      params?: unknown;
      details?: unknown;
    },
    action: () => Promise<T> | T,
  ): Promise<T> {
    return action();
  }
}

export class JsonlRuntimeLogger implements RuntimeLogger {
  private readonly path: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: { path: string }) {
    this.path = options.path;
  }

  log(entry: Omit<RuntimeLogEntry, "timestamp">) {
    const completeEntry: RuntimeLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
      params: sanitizeForLog(entry.params),
      returnValue: sanitizeForLog(entry.returnValue),
      error: sanitizeError(entry.error),
      details: sanitizeForLog(entry.details),
    };
    const line = `${JSON.stringify(completeEntry)}\n`;

    this.writeQueue = this.writeQueue
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, line, "utf8");
      })
      .catch(() => undefined);

    return this.writeQueue;
  }

  async trace<T>(
    input: {
      className: string;
      functionName: string;
      params?: unknown;
      details?: unknown;
    },
    action: () => Promise<T> | T,
  ): Promise<T> {
    const callId = randomUUID();
    const startedAt = performance.now();

    await this.log({
      level: "debug",
      event: "function_call_start",
      className: input.className,
      functionName: input.functionName,
      callId,
      params: input.params,
      details: input.details,
    });

    try {
      const returnValue = await action();
      await this.log({
        level: "debug",
        event: "function_call_return",
        className: input.className,
        functionName: input.functionName,
        callId,
        durationMs: elapsedMs(startedAt),
        returnValue,
      });
      return returnValue;
    } catch (error) {
      await this.log({
        level: "error",
        event: "function_call_error",
        className: input.className,
        functionName: input.functionName,
        callId,
        durationMs: elapsedMs(startedAt),
        error,
      });
      throw error;
    }
  }
}

export function createDefaultLogPath(workspaceRoot: string, now = new Date()) {
  return join(workspaceRoot, "sessions", formatDate(now), "runtime-log.jsonl");
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function elapsedMs(startedAt: number) {
  return Math.round((performance.now() - startedAt) * 100) / 100;
}

function sanitizeError(error: unknown) {
  if (!error) return undefined;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return sanitizeForLog(error);
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MaxDepth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value !== "object") return String(value);

  if (Array.isArray(value)) {
    const items = value.slice(0, 100).map((item) => sanitizeForLog(item, depth + 1));
    if (value.length > 100) items.push(`[${value.length - 100} more items]`);
    return items;
  }

  const record = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(record)) {
    output[key] = isSecretKey(key) ? "[REDACTED]" : sanitizeForLog(item, depth + 1);
  }
  return output;
}

function isSecretKey(key: string) {
  return /(password|passwd|secret|token|apikey|api_key|authorization|credential|cookie)/i.test(key);
}

function truncate(value: string, maxLength = 20_000) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]`;
}
