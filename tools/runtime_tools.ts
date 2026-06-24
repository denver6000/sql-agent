import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";
import type { RuntimeTool } from "../runtime.js";
import type { RuntimeLogger } from "../logging.js";
import { createSqlWorkspaceTool } from "./sql-workspace/index.js";
import type { SqlWorkspaceRunner } from "./sql-workspace/runner.js";

const execFileAsync = promisify(execFile);

export type RuntimeToolsOptions = {
  workspaceRoot: string;
  sqlWorkspaceRunner: SqlWorkspaceRunner;
  logger: RuntimeLogger;
};

export function createRuntimeTools(options: RuntimeToolsOptions): RuntimeTool[] {
  const { workspaceRoot, sqlWorkspaceRunner, logger } = options;

  return [
    createSqlWorkspaceTool({ runner: sqlWorkspaceRunner, logger }),
    {
      name: "bash",
      description:
        "Run a shell command in the current project workspace. Use this for inspecting files, running builds, tests, and other terminal commands. Do not use this for SQL database/schema/table/row work; use sql_workspace_run for database work.",
      parameters: Type.Object({
        command: Type.String({ description: "The shell command to run." }),
        timeoutMs: Type.Optional(Type.Number({ description: "Optional timeout in milliseconds." })),
      }),
      execute: async (args) => {
        return logger.trace(
          {
            className: "InlineTool",
            functionName: "bash.execute",
            params: args,
          },
          async () => {
            const command = requireString(args.command, "command");
            const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 30_000;
            const shell = process.platform === "win32" ? "powershell.exe" : "sh";
            const shellArgs =
              process.platform === "win32" ? ["-NoProfile", "-Command", command] : ["-lc", command];

            const { stdout, stderr } = await execFileAsync(shell, shellArgs, {
              cwd: workspaceRoot,
              timeout: timeoutMs,
              maxBuffer: 1024 * 1024,
            });

            return trimToolOutput([stdout, stderr && `stderr:\n${stderr}`].filter(Boolean).join("\n"));
          },
        );
      },
    },
    {
      name: "read_file",
      description:
        "Read a text file from the current project workspace. Do not use this for SQL database/schema/table/row work; use sql_workspace_run for database work.",
      parameters: Type.Object({
        path: Type.String({ description: "Path to the file to read, relative to the workspace when possible." }),
        startLine: Type.Optional(Type.Number({ description: "Optional 1-based line number to start reading from." })),
        lineLimit: Type.Optional(Type.Number({ description: "Optional maximum number of lines to read." })),
      }),
      execute: async (args) => {
        return logger.trace(
          {
            className: "InlineTool",
            functionName: "read_file.execute",
            params: args,
          },
          async () => {
            const path = resolveWorkspacePath(workspaceRoot, requireString(args.path, "path"));
            const text = await readFile(path, "utf8");
            const startLine = typeof args.startLine === "number" ? Math.max(1, Math.floor(args.startLine)) : 1;
            const lineLimit = typeof args.lineLimit === "number" ? Math.max(1, Math.floor(args.lineLimit)) : undefined;
            const lines = text.split(/\r?\n/);
            const selected = lines.slice(startLine - 1, lineLimit ? startLine - 1 + lineLimit : undefined);
            return trimToolOutput(selected.map((line, index) => `${startLine + index}: ${line}`).join("\n"));
          },
        );
      },
    },
    {
      name: "write_file",
      description:
        "Write text content to a file in the current project workspace. Do not use this for SQL database/schema/table/row work; use sql_workspace_run for database work.",
      parameters: Type.Object({
        path: Type.String({ description: "Path to the file to write, relative to the workspace when possible." }),
        content: Type.String({ description: "Full file content to write." }),
      }),
      execute: async (args) => {
        return logger.trace(
          {
            className: "InlineTool",
            functionName: "write_file.execute",
            params: args,
          },
          async () => {
            const path = resolveWorkspacePath(workspaceRoot, requireString(args.path, "path"));
            const content = requireString(args.content, "content");
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, content, "utf8");
            return `Wrote ${content.length} characters to ${path}.`;
          },
        );
      },
    },
  ];
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string") throw new Error(`Expected '${name}' to be a string.`);
  return value;
}

function resolveWorkspacePath(workspaceRoot: string, path: string) {
  const resolved = resolve(workspaceRoot, path);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error(`Path escapes workspace: ${path}`);
  }
  return resolved;
}

function trimToolOutput(output: string, maxLength = 20_000) {
  if (output.length <= maxLength) return output || "(no output)";
  return `${output.slice(0, maxLength)}\n\n[Output truncated after ${maxLength} characters]`;
}
