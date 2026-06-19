import type { Context, Message, Tool } from "@mariozechner/pi-ai";
import { relative } from "node:path";
import type { RuntimePackage } from "./package-manager.js";

export type ContextBuilderInput = {
  systemPrompt: string;
  messages: Message[];
  tools: Tool[];
  runtimePackage?: RuntimePackage;
};

export interface ContextBuilder {
  build(input: ContextBuilderInput): Promise<Context> | Context;
}

export class BasicContextBuilder implements ContextBuilder {
  constructor(private readonly options: { runtimePackage?: RuntimePackage } = {}) {}

  build(input: ContextBuilderInput): Context {
    const runtimePackage = input.runtimePackage ?? this.options.runtimePackage;

    return {
      systemPrompt: appendRuntimePackage(input.systemPrompt, runtimePackage),
      messages: input.messages,
      tools: input.tools,
    };
  }
}

function appendRuntimePackage(systemPrompt: string, runtimePackage?: RuntimePackage) {
  if (!runtimePackage) return systemPrompt;

  return [systemPrompt, formatRuntimePackage(runtimePackage)].filter(Boolean).join("\n\n");
}

function formatRuntimePackage(runtimePackage: RuntimePackage) {
  const sections = [
    formatEnvironment(runtimePackage),
    formatInstructions(runtimePackage),
    formatSkills(runtimePackage),
    formatDiagnostics(runtimePackage),
  ].filter(Boolean);

  return sections.join("\n\n");
}

function formatEnvironment(runtimePackage: RuntimePackage) {
  return [
    "<runtime_environment>",
    `cwd: ${runtimePackage.cwd}`,
    `workspace_root: ${runtimePackage.workspaceRoot}`,
    "</runtime_environment>",
  ].join("\n");
}

function formatInstructions(runtimePackage: RuntimePackage) {
  if (runtimePackage.instructions.length === 0) return "";

  const blocks = runtimePackage.instructions.map((instruction) =>
    [
      `<instruction_file kind="${escapeXml(instruction.kind)}" path="${escapeXml(formatPath(runtimePackage, instruction.path))}">`,
      instruction.content.trim(),
      "</instruction_file>",
    ].join("\n"),
  );

  return ["<project_instructions>", ...blocks, "</project_instructions>"].join("\n");
}

function formatSkills(runtimePackage: RuntimePackage) {
  const visibleSkills = runtimePackage.skills.filter((skill) => !skill.disableModelInvocation);
  if (visibleSkills.length === 0) return "";

  const blocks = visibleSkills.map((skill) =>
    [
      "<skill>",
      `name: ${skill.name}`,
      `description: ${skill.description}`,
      `location: ${formatPath(runtimePackage, skill.filePath)}`,
      `version: ${skill.promptVersion}`,
      "</skill>",
    ].join("\n"),
  );

  return [
    "<available_skills>",
    "The following skills are available as project knowledge. Their full instructions are not loaded unless the runtime invokes or reads them explicitly.",
    ...blocks,
    "</available_skills>",
  ].join("\n");
}

function formatDiagnostics(runtimePackage: RuntimePackage) {
  if (runtimePackage.diagnostics.length === 0) return "";

  const diagnostics = runtimePackage.diagnostics.map((diagnostic) => {
    const path = diagnostic.path ? ` (${formatPath(runtimePackage, diagnostic.path)})` : "";
    return `${diagnostic.level}: ${diagnostic.code}${path}: ${diagnostic.message}`;
  });

  return ["<package_diagnostics>", ...diagnostics, "</package_diagnostics>"].join("\n");
}

function formatPath(runtimePackage: RuntimePackage, path: string) {
  const formatted = relative(runtimePackage.workspaceRoot, path) || ".";
  return formatted.replace(/\\/g, "/");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
