export type UiChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export const globalUiMessages: UiChatMessage[] = [];

export class UiMessageList {
  appendMessage(role: UiChatMessage["role"], text: string) {
    globalUiMessages.push({ role, text });
    return globalUiMessages.length - 1;
  }

  getMessage(index: number) {
    return globalUiMessages[index];
  }

  getMessages() {
    return globalUiMessages;
  }

  clearMessages() {
    globalUiMessages.splice(0, globalUiMessages.length);
  }
}
