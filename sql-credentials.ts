import mysql from "mysql2/promise";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type PhpMyAdminSqlCredentials = {
  type: "phpmyadmin-mysql";
  label?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database?: string;
};

export type ResolvedSqlRuntimeConfig = {
  backend: "scaffold" | "mysql";
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  credentialsPath: string;
  credentialsLoaded: boolean;
};

export function defaultSqlCredentialsPath() {
  return resolve(process.cwd(), "config", "sql-credentials.local.json");
}

export async function loadSqlCredentials(path = defaultSqlCredentialsPath()) {
  const text = await readFile(path, "utf8").catch((error: unknown) => {
    if (isNotFoundError(error)) return undefined;
    throw error;
  });
  if (!text) return undefined;

  return parseSqlCredentials(JSON.parse(text));
}

export async function saveSqlCredentials(credentials: PhpMyAdminSqlCredentials, path = defaultSqlCredentialsPath()) {
  const normalized = parseSqlCredentials(credentials);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return path;
}

export async function resolveSqlRuntimeConfig(path = defaultSqlCredentialsPath()): Promise<ResolvedSqlRuntimeConfig> {
  const credentials = await loadSqlCredentials(path);
  const backend = (process.env.SQL_WORKSPACE_BACKEND ??
    (credentials ? "mysql" : "scaffold")) as ResolvedSqlRuntimeConfig["backend"];

  return {
    backend,
    host: process.env.SQL_HOST ?? credentials?.host ?? "127.0.0.1",
    port: process.env.SQL_PORT ?? String(credentials?.port ?? 3306),
    user: process.env.SQL_USER ?? credentials?.username ?? "root",
    password: process.env.SQL_PASSWORD ?? credentials?.password ?? "",
    database: process.env.SQL_DATABASE ?? credentials?.database ?? "",
    credentialsPath: path,
    credentialsLoaded: Boolean(credentials),
  };
}

export async function testSqlCredentials(credentials: PhpMyAdminSqlCredentials) {
  const connection = await mysql.createConnection({
    host: credentials.host,
    port: credentials.port,
    user: credentials.username,
    password: credentials.password,
    database: credentials.database || undefined,
  });

  try {
    const [rows] = await connection.query(
      "SELECT VERSION() AS version, USER() AS user, CURRENT_USER() AS currentUser, DATABASE() AS databaseName",
    );
    return {
      ok: true,
      server: Array.isArray(rows) ? rows[0] ?? null : null,
    };
  } finally {
    await connection.end();
  }
}

function parseSqlCredentials(value: unknown): PhpMyAdminSqlCredentials {
  if (typeof value !== "object" || value === null) {
    throw new Error("SQL credentials config must be an object.");
  }

  const record = value as Record<string, unknown>;
  const type = record.type ?? "phpmyadmin-mysql";
  if (type !== "phpmyadmin-mysql") {
    throw new Error("SQL credentials config type must be 'phpmyadmin-mysql'.");
  }

  const host = requireString(record.host, "host");
  const port = requirePort(record.port ?? 3306);
  const username = requireString(record.username, "username");
  const password = typeof record.password === "string" ? record.password : "";
  const database = optionalString(record.database);
  const label = optionalString(record.label);

  return {
    type,
    ...(label ? { label } : {}),
    host,
    port,
    username,
    password,
    ...(database ? { database } : {}),
  };
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`SQL credentials '${name}' must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requirePort(value: unknown) {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SQL credentials 'port' must be a valid TCP port.");
  }
  return port;
}

function isNotFoundError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
