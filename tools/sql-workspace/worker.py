import ast
import contextlib
import io
import json
import os
import sys
import traceback
import types
import urllib.error
import urllib.request


ALLOWED_IMPORTS = {"sql"}
FORBIDDEN_NAMES = {
    "__import__",
    "breakpoint",
    "compile",
    "delattr",
    "eval",
    "exec",
    "getattr",
    "globals",
    "input",
    "locals",
    "open",
    "os",
    "pathlib",
    "setattr",
    "shutil",
    "socket",
    "subprocess",
    "sys",
    "vars",
}
FORBIDDEN_ATTRS = {
    "Popen",
    "call",
    "check_call",
    "check_output",
    "popen",
    "remove",
    "rmdir",
    "run",
    "system",
    "unlink",
}


def _check_code_safety(code):
    try:
        tree = ast.parse(code)
    except SyntaxError:
        raise

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_IMPORTS:
                    raise RuntimeError(
                        f"Forbidden import '{alias.name}'. Use the preloaded sql facade instead."
                    )

        if isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root not in ALLOWED_IMPORTS:
                raise RuntimeError(
                    f"Forbidden import from '{node.module}'. Use the preloaded sql facade instead."
                )

        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise RuntimeError(
                f"Forbidden name '{node.id}'. Generated SQL workspace code must use the sql facade."
            )

        if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_ATTRS:
            raise RuntimeError(
                f"Forbidden attribute '{node.attr}'. Generated SQL workspace code must use the sql facade."
            )


class SqlClient:
    def __init__(self, runtime_url, token, session_id):
        self.runtime_url = runtime_url.rstrip("/")
        self.token = token
        self.session_id = session_id

    def rpc(self, operation, args=None):
        if not self.runtime_url or self.runtime_url == "not-configured":
            raise RuntimeError("SQL runtime URL is not configured.")

        body = json.dumps({
            "sessionId": self.session_id,
            "operation": operation,
            "args": args or {},
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{self.runtime_url}/rpc",
            data=body,
            headers={
                "authorization": f"Bearer {self.token}",
                "content-type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"SQL runtime HTTP error {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"SQL runtime unavailable: {error}") from error

        if not payload.get("ok"):
            raise RuntimeError(payload.get("error", "SQL runtime error"))
        return _wrap_result(payload.get("result"))


class SqlRow(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as error:
            raise AttributeError(name) from error


class SqlRows(list):
    def iterrows(self):
        for index, row in enumerate(self):
            yield index, row


class SqlResult(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)

    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as error:
            raise AttributeError(name) from error

    def iterrows(self):
        rows = self.get("rows")
        if isinstance(rows, SqlRows):
            return rows.iterrows()
        columns = self.get("columns")
        if isinstance(columns, SqlRows):
            return columns.iterrows()
        return iter(SqlRows([self]).iterrows())


def _wrap_result(value):
    if isinstance(value, list):
        return SqlRows([_wrap_result(item) for item in value])
    if isinstance(value, dict):
        return SqlResult({key: _wrap_result(item) for key, item in value.items()})
    return value


def _quote_identifier(value):
    return "`" + str(value).replace("`", "``") + "`"


class DbHandle:
    def __init__(self, client, environment_id, snapshot=None):
        self._client = client
        self.environment_id = environment_id
        self._snapshot = snapshot or {}

    def status(self):
        return self._client.rpc("db.status", {
            "environmentId": self.environment_id,
        })

    def recon(self, intent, tables_hint=None):
        result = self._client.rpc("db.recon", {
            "environmentId": self.environment_id,
            "intent": intent,
            "tablesHint": tables_hint or [],
        })
        return ReconHandle(self._client, self.environment_id, result)

    def describe_table(self, table):
        return self._client.rpc("db.describe_table", {
            "environmentId": self.environment_id,
            "table": table,
        })

    def tables(self):
        rows = self.execute("SHOW TABLES")
        return [row[0] for row in rows]

    def columns(self, table):
        return self.describe_table(table).get("columns", [])

    def schema(self, table):
        create_rows = self.execute(f"SHOW CREATE TABLE {_quote_identifier(table)}")
        return {
            "table": table,
            "columns": self.columns(table),
            "createTable": create_rows[0][1] if create_rows else None,
        }

    def read(self, query, params=None, limit=None):
        return self._client.rpc("db.read", {
            "environmentId": self.environment_id,
            "query": query,
            "params": params or [],
            "limit": limit,
        })

    def execute(self, query, params=None):
        return self._client.rpc("db.execute", {
            "environmentId": self.environment_id,
            "query": query,
            "params": params or [],
        })

    def write(self, query, params=None):
        return self._client.rpc("db.write", {
            "environmentId": self.environment_id,
            "query": query,
            "params": params or [],
        })


class ReconHandle:
    def __init__(self, client, environment_id, payload):
        self._client = client
        self.environment_id = environment_id
        self.payload = payload
        self.recon_id = payload.get("reconId")

    def summary(self):
        return self.payload

    def table_names(self):
        return self.payload.get("tables", [])

    def describe_table(self, table):
        return self._client.rpc("db.describe_table", {
            "environmentId": self.environment_id,
            "table": table,
        })


def create_sql_module():
    client = SqlClient(
        runtime_url=os.environ.get("SQL_RUNTIME_URL", "not-configured"),
        token=os.environ.get("SQL_RUNTIME_TOKEN", ""),
        session_id=os.environ.get("SQL_WORKSPACE_SESSION_ID", "unknown-session"),
    )
    handles = {}

    module = types.ModuleType("sql")

    def help():
        return "\n".join([
            "SQL workspace SDK API:",
            "  sql.status()",
            "  sql.profiles()",
            "  sql.connect()",
            "  db.status()",
            "  db.recon(intent, tables_hint=None)",
            "  db.describe_table(table)",
            "  db.tables()  # list table names in the active database",
            "  db.columns(table)  # list column metadata for a table",
            "  db.schema(table)  # columns plus SHOW CREATE TABLE output",
            "  db.read(query, params=None, limit=None)  # run SQL and optionally slice list results",
            "  db.write(query, params=None)  # run arbitrary SQL",
            "  db.execute(query, params=None)  # run arbitrary SQL",
            "  Parameter placeholders may use Python-style %s or mysql2-style ?.",
            "  Rows support row['column'], row.column, row[0], and rows.iterrows().",
            "  Use MySQL/MariaDB SQL for the local backend; avoid SQLite-only sqlite_master.",
            "  Example:",
            "    import sql",
            "    db = sql.connect()",
            "    for table in db.tables():",
            "        print(table, db.columns(table))",
            "  recon.summary()",
            "  recon.table_names()",
            "  recon.describe_table(table)",
            "",
            "Python is the control language. TypeScript SQL Runtime owns credentials,",
            "database connectivity, policy, and execution.",
        ])

    def status():
        return client.rpc("sql.status")

    def profiles():
        return client.rpc("sql.profiles")

    def connect():
        result = client.rpc("sql.connect")
        environment_id = result.get("environmentId", "active")
        if environment_id not in handles:
            handles[environment_id] = DbHandle(client, environment_id, result)
        return handles[environment_id]

    def use(_profile_id=None):
        return connect()

    module.help = help
    module.status = status
    module.profiles = profiles
    module.connect = connect
    module.use = use
    return module


sql = create_sql_module()
sys.modules["sql"] = sql

namespace = {
    "sql": sql,
}

for line in sys.stdin:
    request = json.loads(line)
    request_id = request["id"]
    code = request["code"]

    stdout = io.StringIO()
    stderr = io.StringIO()

    try:
        _check_code_safety(code)
        compiled = compile(code, f"<sql-workspace:{request_id}>", "exec")
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exec(compiled, namespace)

        try:
            sql_status = sql.status()
        except Exception as error:
            sql_status = {"error": str(error)}

        response = {
            "id": request_id,
            "ok": True,
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "namespaceKeys": sorted(
                key for key in namespace.keys()
                if not key.startswith("__")
            ),
            "sqlStatus": sql_status,
        }
    except Exception:
        try:
            sql_status = sql.status()
        except Exception as error:
            sql_status = {"error": str(error)}

        response = {
            "id": request_id,
            "ok": False,
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "error": traceback.format_exc(),
            "namespaceKeys": sorted(
                key for key in namespace.keys()
                if not key.startswith("__")
            ),
            "sqlStatus": sql_status,
        }

    print(json.dumps(response), flush=True)
