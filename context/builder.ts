import type { AgentMessage } from "@mariozechner/pi-agent-core";

export type ContextMessageRecord = {
  id: string;
  message: AgentMessage;
  createdAt: number;
};

export const globalContextMessages: ContextMessageRecord[] = [];

let nextMessageId = 1;

export class ContextBuilder {
  appendMessage(message: AgentMessage) {
    const record: ContextMessageRecord = {
      id: `context-message-${nextMessageId}`,
      message,
      createdAt: Date.now(),
    };

    nextMessageId += 1;
    globalContextMessages.push(record);

    return record;
  }

  getMessages() {
    return globalContextMessages.map((record) => record.message);
  }

  getRecords() {
    return globalContextMessages;
  }

  clearMessages() {
    globalContextMessages.splice(0, globalContextMessages.length);
  }
}
