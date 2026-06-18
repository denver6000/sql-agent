import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { resolveWorkspacePath, textResult, toWorkspaceRelativePath } from "./shared";

const WriteParams = Type.Object({
  path: Type.String({ description: "Path to the file relative to the workspace root." }),
  content: Type.String({ description: "Full file contents to write." }),
});

type WriteInput = Static<typeof WriteParams>;

export function createWriteTool(): AgentTool<typeof WriteParams> {
  return {
    name: "write",
    label: "Write File",
    description: "Create or overwrite a file in the workspace.",
    parameters: WriteParams,
    async execute(_toolCallId, params: WriteInput) {
      const absolutePath = resolveWorkspacePath(params.path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, params.content, "utf-8");

      return textResult(`Wrote ${params.content.length} characters.`, {
        path: toWorkspaceRelativePath(absolutePath),
        characters: params.content.length,
      });
    },
  };
}
