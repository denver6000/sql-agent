import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export const workspaceRoot = resolve(process.cwd());
export const defaultMaxBytes = 64 * 1024;

export function resolveWorkspacePath(inputPath: string) {
  const resolvedPath = resolve(workspaceRoot, inputPath);
  const relativePath = relative(workspaceRoot, resolvedPath);

  if (
    relativePath.startsWith("..") ||
    relativePath.includes(`..\\`) ||
    relativePath.includes(`../`)
  ) {
    throw new Error(`Path is outside the workspace: ${inputPath}`);
  }

  return resolvedPath;
}

export function toWorkspaceRelativePath(absolutePath: string) {
  const relativePath = relative(workspaceRoot, absolutePath);
  return relativePath || ".";
}

export function textResult(text: string, details: unknown, terminate?: boolean) {
  return {
    content: [{ type: "text" as const, text }],
    details,
    terminate,
  };
}

export async function readTextFileWithLimit(
  absolutePath: string,
  maxBytes = defaultMaxBytes,
) {
  const buffer = await readFile(absolutePath);
  const truncated = buffer.byteLength > maxBytes;
  const text = buffer.subarray(0, maxBytes).toString("utf-8");

  return {
    text,
    truncated,
    bytesRead: Math.min(buffer.byteLength, maxBytes),
    totalBytes: buffer.byteLength,
  };
}

export function sliceLines(
  text: string,
  startLine?: number,
  endLine?: number,
) {
  const lines = text.split(/\r?\n/);
  const startIndex = Math.max(0, (startLine ?? 1) - 1);
  const endIndex =
    endLine === undefined ? lines.length : Math.max(startIndex, endLine);

  return {
    lines: lines.slice(startIndex, endIndex),
    startLine: startIndex + 1,
    endLine: Math.min(endIndex, lines.length),
    totalLines: lines.length,
  };
}

export function truncateOutput(text: string, maxChars = 12000) {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, maxChars)}\n\n[output truncated]`,
    truncated: true,
  };
}
