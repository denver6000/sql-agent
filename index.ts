import { getModel } from "@mariozechner/pi-ai";
import type { Tool } from "@mariozechner/pi-ai";
import { getOAuthApiKey, type OAuthCredentials } from "@mariozechner/pi-ai/oauth";
import { Input, ProcessTerminal, TUI, type Component, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { readFile, writeFile } from "node:fs/promises";
import { Type } from "typebox";
import { Runtime } from "./runtime.js";

type AuthFile = Record<string, OAuthCredentials & { type?: string }>;
type ChatLine = { role: "user" | "assistant" | "system"; text: string };

const authPath = new URL("./auth.json", import.meta.url);
const model = getModel("openai-codex", "gpt-5.4-mini");
const tools: Tool[] = [
  {
    name: "bash",
    description:
      "Run a shell command in the current project workspace. Use this for inspecting files, running builds, tests, and other terminal commands.",
    parameters: Type.Object({
      command: Type.String({ description: "The shell command to run." }),
      timeoutMs: Type.Optional(Type.Number({ description: "Optional timeout in milliseconds." })),
    }),
  },
  {
    name: "read_file",
    description: "Read a text file from the current project workspace.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the file to read, relative to the workspace when possible." }),
      startLine: Type.Optional(Type.Number({ description: "Optional 1-based line number to start reading from." })),
      lineLimit: Type.Optional(Type.Number({ description: "Optional maximum number of lines to read." })),
    }),
  },
  {
    name: "write_file",
    description: "Write text content to a file in the current project workspace.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the file to write, relative to the workspace when possible." }),
      content: Type.String({ description: "Full file content to write." }),
    }),
  },
];

async function loadAuth() {
  const text = await readFile(authPath, "utf8").catch(() => "{}");
  return JSON.parse(text) as AuthFile;
}

async function saveAuth(auth: AuthFile) {
  await writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`);
}

class ChatScreen implements Component {
  readonly input = new Input();
  focused = false;
  private lines: ChatLine[] = [
    { role: "system", text: "CodingAgent runtime chat. Press Esc or type /exit to quit." },
  ];

  constructor(private readonly requestRender: () => void) {
    this.input.onSubmit = (value) => {
      const text = value.trim();
      this.input.setValue("");
      this.requestRender();
      if (text) void this.onSubmit?.(text);
    };
  }

  onSubmit?: (text: string) => void | Promise<void>;
  onEscape?: () => void;

  addLine(line: ChatLine) {
    this.lines.push(line);
    this.requestRender();
  }

  appendAssistant(delta: string) {
    const last = this.lines.at(-1);
    if (last?.role === "assistant") {
      last.text += delta;
    } else {
      this.lines.push({ role: "assistant", text: delta });
    }
    this.requestRender();
  }

  appendSystem(delta: string) {
    const last = this.lines.at(-1);
    if (last?.role === "system") {
      last.text += delta;
    } else {
      this.lines.push({ role: "system", text: delta });
    }
    this.requestRender();
  }

  handleInput(data: string) {
    if (data === "\x1b") {
      this.onEscape?.();
      return;
    }
    this.input.handleInput(data);
  }

  invalidate() {
    this.input.invalidate();
  }

  render(width: number): string[] {
    this.input.focused = this.focused;
    const contentWidth = Math.max(20, width - 2);
    const lines: string[] = [];

    for (const line of this.lines) {
      const label = line.role === "user" ? "You" : line.role === "assistant" ? "Agent" : "System";
      const prefix = `${label}: `;
      const wrapped = wrapTextWithAnsi(line.text || " ", contentWidth - prefix.length);
      for (const [index, text] of wrapped.entries()) {
        lines.push(`${index === 0 ? prefix : " ".repeat(prefix.length)}${text}`);
      }
      lines.push("");
    }

    lines.push("-".repeat(Math.max(0, width)));
    const inputLine = this.input.render(Math.max(1, width - 2))[0] ?? "";
    lines.push(`> ${inputLine}`);
    return lines;
  }
}

const terminal = new ProcessTerminal();
const tui = new TUI(terminal, true);
const screen = new ChatScreen(() => tui.requestRender());
let running = false;

const runtime = new Runtime({
  systemPrompt: "You are a testing agent, You are inside a harness that I am developing, help me debug you.",
  model,
  tools,
  getApiKey: async (provider) => {
    if (provider !== "openai-codex") return undefined;

    const auth = await loadAuth();
    const result = await getOAuthApiKey("openai-codex", auth);
    if (!result) throw new Error("Run `bun run login:codex` first.");

    auth["openai-codex"] = { type: "oauth", ...result.newCredentials };
    await saveAuth(auth);
    return result.apiKey;
  },
  onEvent: (event) => {
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
    if (event.type === "runtime_error") screen.addLine({ role: "system", text: event.error });
  },
});

async function shutdown() {
  tui.stop();
  await terminal.drainInput();
}

screen.onEscape = () => {
  void shutdown();
};

screen.onSubmit = async (text) => {
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

tui.addChild(screen);
tui.setFocus(screen);
tui.start();
