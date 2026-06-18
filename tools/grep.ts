import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  readTextFileWithLimit,
  resolveWorkspacePath,
  textResult,
  toWorkspaceRelativePath,
} from "./shared";

const GrepParams = Type.Object({
  pattern: Type.String({ description: "Case-insensitive text to search for." }),
  path: Type.Optional(
    Type.String({ description: "Directory path relative to the workspace root." }),
  ),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum number of matches to return." }),
  ),
});

type GrepInput = Static<typeof GrepParams>;

type GrepMatch = {
  path: string;
  line: number;
  text: string;
};

async function searchDirectory(
  currentPath: string,
  pattern: string,
  results: GrepMatch[],
  maxResults: number,
) {
  if (results.length >= maxResults) return;

  const entries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= maxResults) return;

    const entryPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await searchDirectory(entryPath, pattern, results, maxResults);
      continue;
    }

    try {
      const file = await readTextFileWithLimit(entryPath, 32 * 1024);
      const lines = file.text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index++) {
        if (results.length >= maxResults) return;
        const lineText = lines[index];
        if (lineText === undefined) continue;
        if (lineText.toLowerCase().includes(pattern)) {
          results.push({
            path: toWorkspaceRelativePath(entryPath),
            line: index + 1,
            text: lineText,
          });
        }
      }
    } catch {
      continue;
    }
  }
}

export function createGrepTool(): AgentTool<typeof GrepParams> {
  return {
    name: "grep",
    label: "Search Text",
    description: "Recursively search for text matches in workspace files.",
    parameters: GrepParams,
    async execute(_toolCallId, params: GrepInput) {
      const absolutePath = resolveWorkspacePath(params.path ?? ".");
      const results: GrepMatch[] = [];
      await searchDirectory(
        absolutePath,
        params.pattern.toLowerCase(),
        results,
        params.maxResults ?? 50,
      );

      const output = results
        .map((match) => `${match.path}:${match.line}: ${match.text}`)
        .join("\n");

      return textResult(output || "(no matches)", {
        path: toWorkspaceRelativePath(absolutePath),
        pattern: params.pattern,
        count: results.length,
      });
    },
  };
}
