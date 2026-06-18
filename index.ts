import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, getModels, type Model } from "@mariozechner/pi-ai";
import {
  Container,
  Input,
  Key,
  matchesKey,
  ProcessTerminal,
  Text,
  TUI,
} from "@earendil-works/pi-tui";
import { getAuthFilePath, resolveOAuthApiKey } from "./auth";
import { defaultTools } from "./tools";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type RuntimeProvider = "anthropic" | "github-copilot" | "openai-codex";

function resolveProvider(): RuntimeProvider {
  const provider = process.env.AI_PROVIDER;
  if (
    provider === "anthropic" ||
    provider === "github-copilot" ||
    provider === "openai-codex"
  ) {
    return provider;
  }

  return "openai-codex";
}

function resolveModel(provider: RuntimeProvider): Model<any> {
  const requestedModel = process.env.AI_MODEL;
  const availableModels = getModels(provider);
  const matchingModel = requestedModel
    ? availableModels.find((candidate) => candidate.id === requestedModel)
    : undefined;

  if (matchingModel) {
    return matchingModel;
  }

  switch (provider) {
    case "anthropic":
      return getModel("anthropic", "claude-sonnet-4-20250514");
    case "github-copilot":
      return getModel("github-copilot", "gpt-5-mini");
    case "openai-codex":
      return getModel("openai-codex", "gpt-5.4-mini");
  }
}

const provider = resolveProvider();
const model = resolveModel(provider);

const agent = new Agent({
  initialState: {
    systemPrompt:
      "You are an assistant made to test a harness. You have to provide technincal feedback.",
    model,
    tools: defaultTools,
  },
  getApiKey: async (requestedProvider) => {
    return await resolveOAuthApiKey(requestedProvider);
  },
});

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

const root = new Container();
const transcript = new Container();
const statusLine = new Text("", 0, 0);
const input = new Input();

const messages: ChatMessage[] = [];
let pendingAssistantIndex: number | null = null;

function renderTranscript() {
  transcript.clear();

  if (messages.length === 0) {
    transcript.addChild(
      new Text(
        [
          "CodingAgent",
          "",
          `Provider: ${provider}`,
          `Model: ${model.id}`,
          `OAuth file: ${getAuthFilePath()}`,
          "",
          "Enter a message and press Enter to send.",
          "Press Ctrl+C to exit.",
        ].join("\n"),
        0,
        0,
      ),
    );
    return;
  }

  for (const message of messages) {
    const prefix = message.role === "user" ? "You" : "Agent";
    transcript.addChild(new Text(`${prefix}: ${message.text || "..."}`, 0, 0));
    transcript.addChild(new Text("", 0, 0));
  }
}

function updateStatus(text: string) {
  statusLine.setText(text);
}

function refreshUi() {
  renderTranscript();
  tui.requestRender();
}

function appendMessage(role: ChatMessage["role"], text: string) {
  messages.push({ role, text });
  return messages.length - 1;
}

function getPendingAssistantMessage() {
  if (pendingAssistantIndex === null) return;
  return messages[pendingAssistantIndex];
}

async function submitPrompt(value: string) {
  const prompt = value.trim();
  if (!prompt || agent.state.isStreaming) return;

  appendMessage("user", prompt);
  pendingAssistantIndex = appendMessage("assistant", "");
  input.setValue("");
  updateStatus("Thinking...");
  refreshUi();

  try {
    await agent.prompt(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const pendingAssistantMessage = getPendingAssistantMessage();
    if (pendingAssistantMessage) {
      pendingAssistantMessage.text = `Error: ${message}`;
      pendingAssistantIndex = null;
    }
    updateStatus("Request failed.");
    refreshUi();
  }
}

root.addChild(transcript);
root.addChild(statusLine);
root.addChild(input);
tui.addChild(root);
tui.setFocus(input);

input.onSubmit = (value) => {
  void submitPrompt(value);
};

agent.subscribe((event) => {
  if (event.type === "message_update") {
    const pendingAssistantMessage = getPendingAssistantMessage();
    if (
      event.assistantMessageEvent.type === "text_delta" &&
      pendingAssistantMessage
    ) {
      pendingAssistantMessage.text += event.assistantMessageEvent.delta;
      refreshUi();
    }
    return;
  }

  if (event.type === "message_end") {
    const pendingAssistantMessage = getPendingAssistantMessage();
    if (pendingAssistantMessage && !pendingAssistantMessage.text) {
      pendingAssistantMessage.text = "(no text response)";
    }
    refreshUi();
    return;
  }

  if (event.type === "agent_end") {
    const pendingAssistantMessage = getPendingAssistantMessage();
    if (agent.state.errorMessage && pendingAssistantMessage) {
      const current = pendingAssistantMessage.text;
      pendingAssistantMessage.text = current
        ? `${current}\n\nError: ${agent.state.errorMessage}`
        : `Error: ${agent.state.errorMessage}`;
    }
    pendingAssistantIndex = null;
    updateStatus("Ready.");
    refreshUi();
  }
});

tui.addInputListener((data) => {
  if (matchesKey(data, Key.ctrl("c"))) {
    agent.abort();
    tui.stop();
    process.exit(0);
  }

  return undefined;
});

updateStatus("Ready.");
refreshUi();
tui.start();
