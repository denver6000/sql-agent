"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var pi_agent_core_1 = require("@mariozechner/pi-agent-core");
var pi_ai_1 = require("@mariozechner/pi-ai");
var agent = new pi_agent_core_1.Agent({
    initialState: {
        systemPrompt: "You are a helpful assistant.",
        model: (0, pi_ai_1.getModel)("anthropic", "claude-sonnet-4-20250514"),
    },
});
agent.subscribe(function (event) {
    if (event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta") {
        // Stream just the new text chunk
        process.stdout.write(event.assistantMessageEvent.delta);
    }
});
await agent.prompt("Hello!");
