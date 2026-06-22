import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

export type SqlRuntimeBackend = "scaffold" | "mysql";

export type SqlRuntimeOptions = {
  backend: SqlRuntimeBackend;
  host?: string;
  port?: string;
  user?: string;
  password?: string;
  database?: string;
  maxReadRows?: number;
};

export type SqlRuntimeRpcRequest = {
  sessionId: string;
  operation: string;
  args?: Record<string, unknown>;
};

type RuntimeState = {
  connectCount: number;
  connectedEnvironments: Set<string>;
  recons: Map<string, unknown>;
};

export class SqlRuntime {
  private readonly backend: SqlRuntimeBackend;
  private readonly host: string;
  private readonly port: string;
  private readonly user: string;
  private readonly password: string;
  private readonly database: string;
  private readonly maxReadRows: number;
  private readonly states = new Map<string, RuntimeState>();
  private pool?: Pool;

  constructor(options: SqlRuntimeOptions) {
    this.backend = options.backend;
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? "3306";
    this.user = options.user ?? "root";
    this.password = options.password ?? "";
    this.database = options.database ?? "";
    this.maxReadRows = options.maxReadRows ?? 100;
  }

  async close() {
    await this.pool?.end();
    this.pool = undefined;
  }

  async rpc(request: SqlRuntimeRpcRequest) {
    const state = this.getState(request.sessionId);
    const args = request.args ?? {};

    switch (request.operation) {
      case "sql.status":
        return this.status(state);
      case "sql.profiles":
        return this.profiles();
      case "sql.connect":
        return this.connect(state);
      case "db.status":
        return this.dbStatus(state, requireString(args.environmentId, "environmentId"));
      case "db.recon":
        return this.recon(state, {
          environmentId: requireString(args.environmentId, "environmentId"),
          intent: requireString(args.intent, "intent"),
          tablesHint: optionalStringArray(args.tablesHint),
        });
      case "db.describe_table":
        return this.describeTable(requireString(args.table, "table"));
      case "db.read":
        return this.read({
          query: requireString(args.query, "query"),
          params: Array.isArray(args.params) ? args.params : [],
          limit: typeof args.limit === "number" ? args.limit : undefined,
        });
      case "db.execute":
        return this.execute({
          query: requireString(args.query, "query"),
          params: Array.isArray(args.params) ? args.params : [],
        });
      case "db.write":
        return this.write({
          query: requireString(args.query, "query"),
          params: Array.isArray(args.params) ? args.params : [],
        });
      default:
        throw new Error(`Unknown SQL runtime operation '${request.operation}'.`);
    }
  }

  private getState(sessionId: string): RuntimeState {
    let state = this.states.get(sessionId);
    if (!state) {
      state = {
        connectCount: 0,
        connectedEnvironments: new Set(),
        recons: new Map(),
      };
      this.states.set(sessionId, state);
    }
    return state;
  }

  private status(state: RuntimeState) {
    return {
      backend: this.backend,
      activeEnvironmentId: "active",
      database: this.database || null,
      mysql: this.sanitizedMysqlConfig(),
      connectCount: state.connectCount,
      connectedEnvironments: [...state.connectedEnvironments].sort(),
      reconIds: [...state.recons.keys()].sort(),
    };
  }

  private profiles() {
    return [
      {
        environmentId: "active",
        environment: "runtime-selected",
        backend: this.backend,
        database: this.database || null,
        capabilities: ["status", "recon", "describe_table", "read", "execute_any_sql", "write_any_sql"],
      },
    ];
  }

  private async connect(state: RuntimeState) {
    const environmentId = "active";
    if (this.backend === "mysql") {
      await this.ensurePool();
    }
    if (!state.connectedEnvironments.has(environmentId)) {
      state.connectedEnvironments.add(environmentId);
      state.connectCount += 1;
    }

    return {
      environmentId,
      backend: this.backend,
      database: this.database || null,
      connected: true,
    };
  }

  private async dbStatus(state: RuntimeState, environmentId: string) {
    if (this.backend === "scaffold") {
      return {
        environmentId,
        connected: state.connectedEnvironments.has(environmentId),
        backend: this.backend,
        database: this.database || null,
        connectCount: state.connectCount,
      };
    }

    const rows = await this.queryRows(
      "SELECT VERSION() AS version, USER() AS user, CURRENT_USER() AS currentUser, DATABASE() AS databaseName",
    );

    return {
      environmentId,
      connected: true,
      backend: this.backend,
      database: this.database || null,
      connectCount: state.connectCount,
      server: rows[0] ?? {},
    };
  }

  private async recon(
    state: RuntimeState,
    input: { environmentId: string; intent: string; tablesHint: string[] },
  ) {
    const reconId = `recon_${state.recons.size + 1}`;

    if (this.backend === "scaffold") {
      const recon = {
        reconId,
        intent: input.intent,
        mode: "scaffold",
        database: this.database || null,
        tables: input.tablesHint.length > 0 ? input.tablesHint : ["users", "leave_requests"],
        note: "scaffold recon only; no real database connection has been made",
      };
      state.recons.set(reconId, recon);
      return recon;
    }

    const schemaRows = await this.queryRows("SHOW DATABASES");
    const schemas = schemaRows.map(firstValue).filter(isString);
    const tableRows = this.database ? await this.queryRows("SHOW TABLES") : [];
    const tables = tableRows.map(firstValue).filter(isString);
    const tableSummaries = await Promise.all(
      tables.slice(0, 20).map(async (table) => this.tableSummary(table).catch(() => ({ table }))),
    );
    const recon = {
      reconId,
      intent: input.intent,
      mode: this.backend,
      database: this.database || null,
      schemas,
      tables: input.tablesHint.length > 0 ? input.tablesHint : tables.slice(0, 50),
      tableCount: tables.length,
      tableSummaries,
    };
    state.recons.set(reconId, recon);
    return recon;
  }

  private async tableSummary(table: string) {
    const columns = await this.describeTable(table);
    const primaryKey = columns.columns.filter((column) => column.key === "PRI").map((column) => column.field);
    return {
      table,
      primaryKey,
      columnCount: columns.columns.length,
      columns: columns.columns.slice(0, 12).map((column) => ({
        field: column.field,
        type: column.type,
        key: column.key,
      })),
    };
  }

  private async describeTable(table: string): Promise<{
    table: string;
    database?: string;
    columns: Array<{ field: string; type: string; null: string; key: string; default: unknown; extra: string }>;
    note?: string;
  }> {
    if (this.backend === "scaffold") {
      return {
        table,
        columns: [],
        note: "scaffold describe_table only; no real database connection has been made",
      };
    }
    requireConfiguredDatabase(this.database);
    const rows = await this.queryRows(`DESCRIBE ${escapeIdentifier(table)}`);
    const columns = rows.map((row) => ({
      field: String(row.Field ?? ""),
      type: String(row.Type ?? ""),
      null: String(row.Null ?? ""),
      key: String(row.Key ?? ""),
      default: row.Default ?? null,
      extra: String(row.Extra ?? ""),
    }));
    return { table, database: this.database, columns };
  }

  private async read(input: { query: string; params: unknown[]; limit?: number }) {
    if (this.backend === "scaffold") {
      return {
        rows: [],
        note: "scaffold read only; no real database connection has been made",
      };
    }
    const result = await this.runSql(input.query, input.params);
    if (typeof input.limit === "number" && Array.isArray(result)) {
      return result.slice(0, Math.max(1, Math.floor(input.limit)));
    }
    return result;
  }

  private async execute(input: { query: string; params: unknown[] }) {
    if (this.backend === "scaffold") {
      return {
        executed: false,
        note: "scaffold execute only; no real database connection has been made",
      };
    }
    return this.runSql(input.query, input.params);
  }

  private async write(input: { query: string; params: unknown[] }) {
    if (this.backend === "scaffold") {
      return {
        executed: false,
        note: "scaffold write only; no real database connection has been made",
      };
    }
    return this.runSql(input.query, input.params);
  }

  private sanitizedMysqlConfig() {
    return {
      host: this.host,
      port: this.port,
      user: this.user,
      database: this.database || null,
      driver: "mysql2",
    };
  }

  private async ensurePool() {
    if (this.pool) return this.pool;

    this.pool = mysql.createPool({
      host: this.host,
      port: Number(this.port),
      user: this.user,
      password: this.password,
      database: this.database || undefined,
      waitForConnections: true,
      connectionLimit: 4,
      maxIdle: 4,
      idleTimeout: 60_000,
      enableKeepAlive: true,
      multipleStatements: true,
    });
    return this.pool;
  }

  private async queryRows(query: string, params: unknown[] = []) {
    const pool = await this.ensurePool();
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows.map((row) => ({ ...row }));
  }

  private async runSql(query: string, params: unknown[] = []) {
    const pool = await this.ensurePool();
    const [result] = await pool.query(normalizePlaceholders(query, params), params as never[]);
    return normalizeSqlResult(result);
  }
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string") throw new Error(`Expected '${name}' to be a string.`);
  return value;
}

function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function requireConfiguredDatabase(database: string) {
  if (!database) throw new Error("No active SQL database configured. Set SQL_DATABASE before table-level operations.");
}

function firstValue(row: Record<string, unknown>) {
  return Object.values(row)[0];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function escapeIdentifier(value: string) {
  return `\`${value.replace(/`/g, "``")}\``;
}

function normalizeSqlResult(result: unknown): unknown {
  if (!Array.isArray(result)) return normalizeSqlResultPart(result);
  if (result.some((item) => Array.isArray(item) || isResultSetHeader(item))) {
    return result.map((item) => normalizeSqlResultPart(item));
  }
  return result.map((row) => ({ ...(row as Record<string, unknown>) }));
}

function normalizePlaceholders(query: string, params: unknown[]) {
  if (params.length === 0) return query;
  return query.replace(/%s/g, "?");
}

function normalizeSqlResultPart(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result.map((row) => ({ ...(row as Record<string, unknown>) }));
  }
  if (isResultSetHeader(result)) {
    return {
      executed: true,
      affectedRows: result.affectedRows,
      changedRows: result.changedRows,
      insertId: result.insertId,
      warningStatus: result.warningStatus,
      serverStatus: result.serverStatus,
    };
  }
  return result;
}

function isResultSetHeader(value: unknown): value is {
  affectedRows: number;
  changedRows: number;
  insertId: number;
  warningStatus: number;
  serverStatus: number;
} {
  return typeof value === "object" && value !== null && "affectedRows" in value;
}
