import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  defaultSqlCredentialsPath,
  loadSqlCredentials,
  saveSqlCredentials,
  testSqlCredentials,
  type PhpMyAdminSqlCredentials,
} from "../sql-credentials.js";

const credentialsPath = defaultSqlCredentialsPath();
const existing = await loadSqlCredentials(credentialsPath);
const rl = createInterface({ input, output });

try {
  console.log("Configure a phpMyAdmin-style MySQL/MariaDB connection.");
  console.log(`Credentials file: ${credentialsPath}`);
  console.log("");

  const credentials: PhpMyAdminSqlCredentials = {
    type: "phpmyadmin-mysql",
    label: await ask("Label", existing?.label ?? "local phpMyAdmin"),
    host: await ask("Host / server", existing?.host ?? "127.0.0.1"),
    port: Number(await ask("Port", String(existing?.port ?? 3306))),
    username: await ask("Username", existing?.username ?? "root"),
    password: await ask("Password (input is visible)", existing?.password ?? ""),
    database: await ask("Database (optional)", existing?.database ?? ""),
  };

  console.log("");
  console.log("Testing connection...");
  const result = await testSqlCredentials(credentials);
  console.log("Connection successful.");
  console.log(JSON.stringify(result.server, null, 2));

  await saveSqlCredentials(credentials, credentialsPath);
  console.log("");
  console.log(`Saved credentials to ${credentialsPath}`);
} finally {
  rl.close();
}

async function ask(label: string, defaultValue: string) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || defaultValue;
}
