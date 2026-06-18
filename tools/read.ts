import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  readTextFileWithLimit,
  resolveWorkspacePath,
  sliceLines,
  textResult,
  toWorkspaceRelativePath,
} from "./shared";

const ReadParams = Type.Object({
  path: Type.String({ description: "Path to the file relative to the workspace root." }),
  startLine: Type.Optional(
    Type.Number({ description: "1-based start line number." }),
  ),
  endLine: Type.Optional(
    Type.Number({ description: "1-based end line number, inclusive." }),
  ),
  maxBytes: Type.Optional(
    Type.Number({ description: "Maximum bytes to read before truncating." }),
  ),
});

type ReadInput = Static<typeof ReadParams>;

export function createReadTool(): AgentTool<typeof ReadParams> {
  return {
    name: "read",
    label: "Read File",
    description: "Read a text file from the workspace.",
    parameters: ReadParams,
    async execute(_toolCallId, params: ReadInput) {
      const absolutePath = resolveWorkspacePath(params.path);
      const file = await readTextFileWithLimit(absolutePath, params.maxBytes);
      const section = sliceLines(file.text, params.startLine, params.endLine);
      const content = section.lines.join("\n");

      return textResult(content || "(empty file)", {
        path: toWorkspaceRelativePath(absolutePath),
        startLine: section.startLine,
        endLine: section.endLine,
        totalLines: section.totalLines,
        bytesRead: file.bytesRead,
        totalBytes: file.totalBytes,
        truncated: file.truncated,
      });
    },
  };
}
