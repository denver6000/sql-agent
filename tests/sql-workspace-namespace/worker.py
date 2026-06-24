import contextlib
import io
import json
import sys
import traceback
import types


class DbHandle:
    def __init__(self, state, profile_id):
        self._state = state
        self.profile_id = profile_id

    def status(self):
        return {
            "profile_id": self.profile_id,
            "connected": True,
            "connect_count": self._state["connect_count"],
            "cached_profiles": sorted(self._state["handles"].keys()),
        }

    def recon(self, intent):
        recon_id = f"recon_{len(self._state['recons']) + 1}"
        recon = ReconHandle(recon_id, intent)
        self._state["recons"][recon_id] = recon
        return recon


class ReconHandle:
    def __init__(self, recon_id, intent):
        self.recon_id = recon_id
        self.intent = intent

    def summary(self):
        return {
            "recon_id": self.recon_id,
            "intent": self.intent,
            "tables": ["users", "leave_requests"],
            "note": "fake schema recon handle persisted in Python namespace",
        }


def create_sql_module():
    state = {
        "use_calls": 0,
        "connect_count": 0,
        "handles": {},
        "recons": {},
    }

    module = types.ModuleType("sql")

    def status():
        return {
            "module_id": id(module),
            "use_calls": state["use_calls"],
            "connect_count": state["connect_count"],
            "cached_profiles": sorted(state["handles"].keys()),
            "recon_ids": sorted(state["recons"].keys()),
        }

    def use(profile_id):
        state["use_calls"] += 1
        if profile_id not in state["handles"]:
            state["connect_count"] += 1
            state["handles"][profile_id] = DbHandle(state, profile_id)
        return state["handles"][profile_id]

    def help():
        return "Fake sql facade: sql.status(), sql.use(profile_id), db.recon(intent)"

    module.status = status
    module.use = use
    module.help = help
    module._state = state
    return module


sql = create_sql_module()
sys.modules["sql"] = sql

namespace = {
    "sql": sql,
}

print("[worker] booted: injected fake sql module into sys.modules and namespace", file=sys.stderr, flush=True)

for line in sys.stdin:
    request = json.loads(line)
    request_id = request["id"]
    code = request["code"]

    print(f"[worker] executing {request_id}", file=sys.stderr, flush=True)

    stdout = io.StringIO()
    stderr = io.StringIO()

    try:
        compiled = compile(code, f"<agent-cell:{request_id}>", "exec")
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            exec(compiled, namespace)

        response = {
            "id": request_id,
            "ok": True,
            "stdout": stdout.getvalue(),
            "stderr": stderr.getvalue(),
            "namespaceKeys": sorted(
                key for key in namespace.keys()
                if not key.startswith("__")
            ),
            "sqlStatus": sql.status(),
        }
    except Exception:
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
            "sqlStatus": sql.status(),
        }

    print(json.dumps(response), flush=True)
