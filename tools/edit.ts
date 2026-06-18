import { readFile, writeFile } from "node:fs/promises";
import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { resolveWorkspacePath, textResult, toWorkspaceRelativePath } from "./shared";

const EditParams = Type.Object({
  path: Type.String({ description: "Path to the file relative to the workspace root." }),
  oldString: Type.String({ description: "Exact text to replace." }),
  newString: Type.String({ description: "Replacement text." }),
  replaceAll: Type.Optional(
    Type.Boolean({ description: "Replace all matches instead of the first match." }),
  ),
});

type EditInput = Static<typeof EditParams>;

export function createEditTool(): AgentTool<typeof EditParams> {
  return {
    name: "edit",
    label: "Edit File",
    description: "Replace text inside an existing workspace file.",
    parameters: EditParams,
    async execute(_toolCallId, params: EditInput) {
      const absolutePath = resolveWorkspacePath(params.path);
      const current = await readFile(absolutePath, "utf-8");

      if (!current.includes(params.oldString)) {
        throw new Error("oldString was not found in the file.");
      }

      const next = params.replaceAll
        ? current.split(params.oldString).join(params.newString)
        : current.replace(params.oldString, params.newString);

      const replacementCount = params.replaceAll
        ? current.split(params.oldString).length - 1
        : 1;

      await writeFile(absolutePath, next, "utf-8");

      return textResult(`Applied ${replacementCount} replacement(s).`, {
        path: toWorkspaceRelativePath(absolutePath),
        replacementCount,
      });
    },
  };
}
