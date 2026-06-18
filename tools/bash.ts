import { spawn } from "node:child_process";
import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { textResult, truncateOutput, workspaceRoot } from "./shared";

const BashParams = Type.Object({
  command: Type.String({ description: "PowerShell command to run in the workspace root." }),
  timeoutMs: Type.Optional(
    Type.Number({ description: "Command timeout in milliseconds." }),
  ),
});

type BashInput = Static<typeof BashParams>;

export function createBashTool(): AgentTool<typeof BashParams> {
  return {
    name: "bash",
    label: "Run Shell Command",
    description: "Run a PowerShell command in the workspace root.",
    parameters: BashParams,
    async execute(_toolCallId, params: BashInput, signal) {
      const timeoutMs = params.timeoutMs ?? 30_000;

      return await new Promise((resolve, reject) => {
        const child = spawn(
          "powershell.exe",
          ["-NoLogo", "-NoProfile", "-Command", params.command],
          {
            cwd: workspaceRoot,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        let stdout = "";
        let stderr = "";
        let timedOut = false;

        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs);

        const abortHandler = () => {
          child.kill();
          reject(new Error("Command aborted."));
        };

        signal?.addEventListener("abort", abortHandler, { once: true });

        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });

        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });

        child.on("error", (error) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abortHandler);
          reject(error);
        });

        child.on("close", (code) => {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abortHandler);

          const combined = [stdout.trimEnd(), stderr.trimEnd()]
            .filter(Boolean)
            .join("\n");
          const output = truncateOutput(combined || "(no output)");

          resolve(
            textResult(output.text, {
              command: params.command,
              exitCode: code,
              timedOut,
              truncated: output.truncated,
              stdout,
              stderr,
            }),
          );
        });
      });
    },
  };
}
