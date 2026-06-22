import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type WorkerResponse = {
  id: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  namespaceKeys: string[];
  sqlStatus: {
    module_id: number;
    use_calls: number;
    connect_count: number;
    cached_profiles: string[];
    recon_ids: string[];
  };
};

const here = dirname(fileURLToPath(import.meta.url));
const workerPath = join(here, "worker.py");
const python = process.env.PYTHON ?? "python";

class PersistentPythonWorker {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, (response: WorkerResponse) => void>();

  constructor() {
    console.log(`[ts] spawning: ${python} ${workerPath}`);
    this.child = spawn(python, [workerPath], { stdio: "pipe" });

    createInterface({ input: this.child.stdout }).on("line", (line) => {
      console.log(`[ts] raw worker response: ${line}`);
      const response = JSON.parse(line) as WorkerResponse;
      const resolve = this.pending.get(response.id);
      if (!resolve) throw new Error(`No pending request for ${response.id}`);
      this.pending.delete(response.id);
      resolve(response);
    });

    this.child.stderr.on("data", (chunk) => {
      process.stdout.write(`[python-stderr] ${chunk}`);
    });

    this.child.on("exit", (code) => {
      console.log(`[ts] worker exited with code ${code}`);
    });
  }

  execute(label: string, code: string) {
    const id = randomUUID();
    const payload = { id, code };

    console.log("\n" + "=".repeat(80));
    console.log(`[ts] sending cell: ${label}`);
    console.log("[ts] code:");
    console.log(code);

    return new Promise<WorkerResponse>((resolve) => {
      this.pending.set(id, resolve);
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    }).then((response) => {
      console.log(`[ts] result for ${label}: ${response.ok ? "OK" : "ERROR"}`);
      console.log(`[ts] stdout:\n${response.stdout || "(empty)"}`);
      console.log(`[ts] stderr:\n${response.stderr || "(empty)"}`);
      if (response.error) console.log(`[ts] python traceback:\n${response.error}`);
      console.log(`[ts] namespace keys: ${response.namespaceKeys.join(", ")}`);
      console.log(`[ts] sql status: ${JSON.stringify(response.sqlStatus, null, 2)}`);
      return response;
    });
  }

  stop() {
    console.log("\n[ts] stopping persistent Python worker");
    this.child.kill();
  }
}

const worker = new PersistentPythonWorker();

try {
  await worker.execute(
    "cell 1: import sql, connect once, create recon variable",
    [
      "import sql",
      "print('help:', sql.help())",
      "print('status before use:', sql.status())",
      "db = sql.use('prod-readonly')",
      "recon = db.recon('find leave requests')",
      "print('db status:', db.status())",
      "print('recon summary:', recon.summary())",
    ].join("\n"),
  );

  await worker.execute(
    "cell 2: import sql again, reuse cached module and previous recon",
    [
      "import sql",
      "db2 = sql.use('prod-readonly')",
      "print('status after second import/use:', sql.status())",
      "print('same db object:', db is db2)",
      "print('previous recon still exists:', recon.summary())",
    ].join("\n"),
  );

  await worker.execute(
    "cell 3: broken generated code, worker catches error and stays alive",
    [
      "import sql",
      "print(asdahndsja'')",
    ].join("\n"),
  );

  await worker.execute(
    "cell 4: corrected code, same sql module, no second connection",
    [
      "import sql",
      "print('hi')",
      "print('status after error recovery:', sql.status())",
      "print('recon still exists after failed cell:', recon.summary())",
    ].join("\n"),
  );
} finally {
  worker.stop();
}
