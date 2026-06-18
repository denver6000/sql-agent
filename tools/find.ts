import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { resolveWorkspacePath, textResult, toWorkspaceRelativePath } from "./shared";

const FindParams = Type.Object({
  pattern: Type.String({
    description: "Case-insensitive substring to match against file or directory names.",
  }),
  path: Type.Optional(
    Type.String({ description: "Directory path relative to the workspace root." }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum number of matches to return." }),
  ),
});

type FindInput = Static<typeof FindParams>;

async function walk(
  currentPath: string,
  results: string[],
  pattern: string,
  maxResults: number,
) {
  if (results.length >= maxResults) return;

  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= maxResults) return;

    const entryPath = join(currentPath, entry.name);
    if (entry.name.toLowerCase().includes(pattern)) {
      results.push(entryPath);
    }

    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      await walk(entryPath, results, pattern, maxResults);
    }
  }
}

export function createFindTool(): AgentTool<typeof FindParams> {
  return {
    name: "find",
    label: "Find Files",
    description: "Recursively find files or directories by name.",
    parameters: FindParams,
    async execute(_toolCallId, params: FindInput) {
      const absolutePath = resolveWorkspacePath(params.path ?? ".");
      const results: string[] = [];
      await walk(
        absolutePath,
        results,
        params.pattern.toLowerCase(),
        params.maxResults ?? 50,
      );

      return textResult(
        results.map((result) => toWorkspaceRelativePath(result)).join("\n") ||
          "(no matches)",
        {
          path: toWorkspaceRelativePath(absolutePath),
          pattern: params.pattern,
          count: results.length,
        },
      );
    },
  };
}
