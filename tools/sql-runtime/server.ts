import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { SqlRuntime, SqlRuntimeRpcRequest } from "./runtime.js";

export type SqlRuntimeServer = {
  url: string;
  token: string;
  close: () => Promise<void>;
};

export async function startSqlRuntimeServer(options: {
  runtime: SqlRuntime;
  host?: string;
  port?: number;
  token?: string;
}): Promise<SqlRuntimeServer> {
  const host = options.host ?? "127.0.0.1";
  const token = options.token ?? randomUUID();

  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || req.url !== "/rpc") {
        sendJson(res, 404, { ok: false, error: "Not found" });
        return;
      }

      const authorization = req.headers.authorization ?? "";
      if (authorization !== `Bearer ${token}`) {
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }

      const body = await readJson(req);
      const result = await options.runtime.rpc(body as SqlRuntimeRpcRequest);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://${host}:${address.port}`,
    token,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error("Request body too large.");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
