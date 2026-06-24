import { createCodingAgentApp } from "./app.js";

try {
  const app = await createCodingAgentApp();
  app.start();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
