import { ProcessTerminal, TUI } from "@earendil-works/pi-tui";
import { getModel } from "@mariozechner/pi-ai";
import { getOAuthApiKey, type OAuthCredentials } from "@mariozechner/pi-ai/oauth";
import { readFile, writeFile } from "node:fs/promises";
import { PackageManager } from "./package-manager.js";
import { Runtime, type RuntimeEvent } from "./runtime.js";
import { createDefaultLogPath, JsonlRuntimeLogger } from "./logging.js";
import { resolveSqlRuntimeConfig } from "./sql-credentials.js";
import { createRuntimeTools } from "./tools/runtime_tools.js";
import { createSqlWorkspaceServices } from "./tools/sql-workspace/services.js";
import { ChatScreen } from "./ui/chat_screen.js";

type AuthFile = Record<string, OAuthCredentials & { type?: string }>;

export type CodingAgentApp = {
  start: () => void;
  shutdown: () => Promise<void>;
};

export async function createCodingAgentApp(): Promise<CodingAgentApp> {
  const authPath = new URL("./auth.json", import.meta.url);
  const packageManager = new PackageManager({ cwd: process.cwd() });
  const runtimePackage = await packageManager.discover();
  const workspaceRoot = runtimePackage.workspaceRoot;
  const logPath = process.env.RUNTIME_LOG_PATH ?? createDefaultLogPath(workspaceRoot);
  const logger = new JsonlRuntimeLogger({ path: logPath });
  const model = getModel("openai-codex", "gpt-5.4-mini");
  const sqlConfig = await resolveSqlRuntimeConfig();

  await logger.log({
    level: "info",
    event: "app_start",
    className: "App",
    functionName: "createCodingAgentApp",
    params: {
      workspaceRoot,
      logPath,
      sqlWorkspaceBackend: sqlConfig.backend,
      sqlCredentialsPath: sqlConfig.credentialsPath,
      sqlCredentialsLoaded: sqlConfig.credentialsLoaded,
      sqlHost: sqlConfig.host,
      sqlPort: sqlConfig.port,
      sqlUser: sqlConfig.user,
      sqlPassword: sqlConfig.password,
      sqlDatabase: sqlConfig.database,
    },
  });

  const sqlWorkspace = await createSqlWorkspaceServices({ config: sqlConfig, logger });
  const tools = createRuntimeTools({
    workspaceRoot,
    sqlWorkspaceRunner: sqlWorkspace.runner,
    logger,
  });

  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal, true);
  const screen = new ChatScreen(() => tui.requestRender());
  let running = false;
  let stopped = false;

  const runtime = new Runtime({
    systemPrompt: "You are a testing agent, You are inside a harness that I am developing, help me debug you.",
    model,
    tools,
    runtimePackage,
    getApiKey: async (provider) => {
      await logger.log({
        level: "debug",
        event: "function_call_start",
        className: "App",
        functionName: "getApiKey",
        params: { provider },
      });

      if (provider !== "openai-codex") {
        await logger.log({
          level: "debug",
          event: "function_call_return",
          className: "App",
          functionName: "getApiKey",
          returnValue: { hasApiKey: false },
        });
        return undefined;
      }

      const auth = await loadAuth(authPath);
      const result = await getOAuthApiKey("openai-codex", auth);
      if (!result) throw new Error("Run `bun run login:codex` first.");

      auth["openai-codex"] = { type: "oauth", ...result.newCredentials };
      await saveAuth(authPath, auth);
      await logger.log({
        level: "debug",
        event: "function_call_return",
        className: "App",
        functionName: "getApiKey",
        returnValue: { hasApiKey: true },
      });
      return result.apiKey;
    },
    onEvent: handleRuntimeEvent,
  });

  function handleRuntimeEvent(event: RuntimeEvent) {
    void logger.log({
      level: "debug",
      event: "runtime_event",
      className: "App",
      functionName: "handleRuntimeEvent",
      params: event,
    });
    if (event.type === "text_delta") screen.appendAssistant(event.delta);
    if (event.type === "tool_call_start") {
      screen.addLine({ role: "system", text: `Tool stream[${event.contentIndex}]: ` });
    }
    if (event.type === "tool_call_delta") {
      screen.appendSystem(event.delta);
    }
    if (event.type === "tool_call") {
      screen.addLine({
        role: "system",
        text: `Tool call final: ${event.toolCall.name}\n${JSON.stringify(event.toolCall.arguments, null, 2)}`,
      });
    }
    if (event.type === "tool_execution_start") {
      screen.addLine({ role: "system", text: `Executing tool: ${event.toolCall.name}` });
    }
    if (event.type === "tool_execution_result") {
      const content = event.message.content
        .map((item) => (item.type === "text" ? item.text : `[${item.type}]`))
        .join("\n");
      screen.addLine({
        role: "system",
        text: `Tool result: ${event.toolCall.name}${event.message.isError ? " (error)" : ""}\n${content}`,
      });
    }
    if (event.type === "runtime_error") screen.addLine({ role: "system", text: event.error });
  }

  screen.addLine({
    role: "system",
    text: [
      `Workspace: ${workspaceRoot}`,
      `Instructions: ${runtimePackage.instructions.length}`,
      `Skills: ${runtimePackage.skills.length}`,
      `Tools: ${tools.map((tool) => tool.name).join(", ")}`,
      `SQL runtime: ${sqlWorkspace.backend}`,
      `SQL credentials: ${sqlConfig.credentialsLoaded ? sqlConfig.credentialsPath : "(none loaded)"}`,
      `SQL database: ${sqlConfig.database || "(none selected)"}`,
      `Log file: ${logPath}`,
    ].join("\n"),
  });

  async function shutdown() {
    if (stopped) return;
    stopped = true;

    await logger.trace(
      {
        className: "App",
        functionName: "shutdown",
        params: {},
      },
      async () => {
        await sqlWorkspace.shutdown();
        tui.stop();
        await terminal.drainInput();
        return { stopped: true };
      },
    );
  }

  screen.onEscape = () => {
    void shutdown();
  };

  screen.onSubmit = async (text) => {
    await logger.log({
      level: "info",
      event: "user_submit",
      className: "ChatScreen",
      functionName: "onSubmit",
      params: { text, running },
    });

    if (text === "/exit" || text === "/quit") {
      await shutdown();
      return;
    }

    if (running) {
      screen.addLine({ role: "system", text: "Still waiting on the current response." });
      return;
    }

    running = true;
    screen.addLine({ role: "user", text });
    screen.addLine({ role: "assistant", text: "" });

    try {
      await runtime.prompt(text);
    } catch (error) {
      screen.addLine({ role: "system", text: error instanceof Error ? error.message : String(error) });
    } finally {
      running = false;
      tui.requestRender();
    }
  };

  tui.addInputListener((data) => {
    if (data === "\x03") {
      void shutdown();
      return { consume: true };
    }
    return undefined;
  });

  return {
    start: () => {
      tui.addChild(screen);
      tui.setFocus(screen);
      tui.start();
    },
    shutdown,
  };
}

async function loadAuth(path: URL) {
  const text = await readFile(path, "utf8").catch(() => "{}");
  return JSON.parse(text) as AuthFile;
}

async function saveAuth(path: URL, auth: AuthFile) {
  await writeFile(path, `${JSON.stringify(auth, null, 2)}\n`);
}
