import { Input, type Component, wrapTextWithAnsi } from "@earendil-works/pi-tui";

export type ChatLine = { role: "user" | "assistant" | "system"; text: string };

export class ChatScreen implements Component {
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
