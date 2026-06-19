import { createHash } from "node:crypto";
import { access, readdir, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type InstructionFileKind = "agents" | "claude" | "custom";

export type InstructionFile = {
  kind: InstructionFileKind;
  path: string;
  content: string;
};

export type SkillManifest = {
  name: string;
  description: string;
  filePath: string;
  directory: string;
  content: string;
  promptVersion: string;
  disableModelInvocation?: boolean;
  source: "workspace" | "project" | "user";
};

export type PackageDiagnostic = {
  level: "warning" | "error";
  code: string;
  message: string;
  path?: string;
};

export type RuntimePackage = {
  cwd: string;
  workspaceRoot: string;
  instructions: InstructionFile[];
  skills: SkillManifest[];
  diagnostics: PackageDiagnostic[];
};

export type PackageManagerOptions = {
  cwd?: string;
};

export class PackageManager {
  private readonly cwd: string;

  constructor(options: PackageManagerOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
  }

  async discover(): Promise<RuntimePackage> {
    const cwd = await realpath(this.cwd);
    const workspaceRoot = await findWorkspaceRoot(cwd);
    const diagnostics: PackageDiagnostic[] = [];
    const instructions = await discoverInstructions(workspaceRoot, diagnostics);
    const skills = await discoverSkills(workspaceRoot, diagnostics);

    return {
      cwd,
      workspaceRoot,
      instructions,
      skills,
      diagnostics,
    };
  }
}

async function findWorkspaceRoot(start: string) {
  let current = start;

  while (true) {
    if ((await exists(join(current, ".git"))) || (await exists(join(current, "package.json")))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

async function discoverInstructions(root: string, diagnostics: PackageDiagnostic[]) {
  const candidates: Array<{ kind: InstructionFileKind; path: string }> = [
    { kind: "agents", path: join(root, "AGENTS.md") },
    { kind: "claude", path: join(root, "CLAUDE.md") },
    { kind: "agents", path: join(root, ".agents", "AGENTS.md") },
    { kind: "claude", path: join(root, ".claude", "CLAUDE.md") },
  ];

  const instructions: InstructionFile[] = [];
  for (const candidate of candidates) {
    const content = await readTextIfExists(candidate.path, diagnostics);
    if (content !== undefined) {
      instructions.push({ ...candidate, content });
    }
  }

  return instructions;
}

async function discoverSkills(root: string, diagnostics: PackageDiagnostic[]) {
  const skillRoots: Array<{ path: string; source: SkillManifest["source"] }> = [
    { path: join(root, ".agents", "skills"), source: "workspace" },
    { path: join(root, ".claude", "skills"), source: "project" },
    { path: join(root, ".codex", "skills"), source: "project" },
  ];

  const skills: SkillManifest[] = [];
  const visited = new Set<string>();

  for (const skillRoot of skillRoots) {
    const realSkillRoot = await realpath(skillRoot.path).catch(() => undefined);
    if (!realSkillRoot || visited.has(realSkillRoot)) continue;
    visited.add(realSkillRoot);
    await scanSkillDirectory(realSkillRoot, skillRoot.source, skills, diagnostics);
  }

  return skills;
}

async function scanSkillDirectory(
  directory: string,
  source: SkillManifest["source"],
  skills: SkillManifest[],
  diagnostics: PackageDiagnostic[],
) {
  const skillPath = join(directory, "SKILL.md");
  if (await exists(skillPath)) {
    const content = await readTextIfExists(skillPath, diagnostics);
    if (content !== undefined) {
      const skill = parseSkillManifest(skillPath, directory, source, content, diagnostics);
      if (skill) skills.push(skill);
    }
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    diagnostics.push({
      level: "warning",
      code: "skill_directory_read_failed",
      message: error instanceof Error ? error.message : String(error),
      path: directory,
    });
    return [];
  });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) continue;
    await scanSkillDirectory(join(directory, entry.name), source, skills, diagnostics);
  }
}

function parseSkillManifest(
  filePath: string,
  directory: string,
  source: SkillManifest["source"],
  content: string,
  diagnostics: PackageDiagnostic[],
) {
  const frontmatter = parseFrontmatter(content);
  const name = String(frontmatter.values.name ?? basename(directory));
  const description = frontmatter.values.description;

  if (typeof description !== "string" || description.trim().length === 0) {
    diagnostics.push({
      level: "warning",
      code: "skill_missing_description",
      message: "Skill was ignored because SKILL.md has no description frontmatter.",
      path: filePath,
    });
    return undefined;
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    diagnostics.push({
      level: "warning",
      code: "skill_invalid_name",
      message: `Skill name '${name}' should use lowercase letters, numbers, and hyphens.`,
      path: filePath,
    });
  }

  return {
    name,
    description: description.trim(),
    filePath,
    directory,
    content,
    promptVersion: `sha256:${createHash("sha256").update(content).digest("hex").slice(0, 16)}`,
    disableModelInvocation: frontmatter.values["disable-model-invocation"] === "true",
    source,
  };
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const raw = match?.[1] ?? "";
  const values: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    values[key] = stripQuotes(value);
  }

  return { values };
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function readTextIfExists(path: string, diagnostics: PackageDiagnostic[]) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return undefined;
    diagnostics.push({
      level: "warning",
      code: "file_read_failed",
      message: error instanceof Error ? error.message : String(error),
      path,
    });
    return undefined;
  }
}

async function exists(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}

function isNotFoundError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
