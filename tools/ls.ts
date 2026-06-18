import { readdir } from "node:fs/promises";
import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { resolveWorkspacePath, textResult, toWorkspaceRelativePath } from "./shared";

const LsParams = Type.Object({
  path: Type.Optional(
    Type.String({ description: "Directory path relative to the workspace root." }),
  ),
});

type LsInput = Static<typeof LsParams>;

export function createLsTool(): AgentTool<typeof LsParams> {
  return {
    name: "ls",
    label: "List Directory",
    description: "List files and directories under a workspace directory.",
    parameters: LsParams,
    async execute(_toolCallId, params: LsInput) {
      const absolutePath = resolveWorkspacePath(params.path ?? ".");
      const entries = await readdir(absolutePath, { withFileTypes: true });
      const lines = entries
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => `${entry.isDirectory() ? "[dir]" : "[file]"} ${entry.name}`);

      return textResult(lines.join("\n") || "(empty directory)", {
        path: toWorkspaceRelativePath(absolutePath),
        count: entries.length,
      });
    },
  };
}
