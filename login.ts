import { loginOpenAICodex, type OAuthCredentials } from "@mariozechner/pi-ai/oauth";
import { readFile, writeFile } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

const authPath = new URL("./auth.json", import.meta.url);
const rl = createInterface({ input, output });

type AuthFile = Record<string, OAuthCredentials & { type?: string }>;

const auth = JSON.parse(await readFile(authPath, "utf8").catch(() => "{}")) as AuthFile;

try {
  const credentials = await loginOpenAICodex({
    onAuth: ({ url, instructions }) => {
      if (instructions) console.log(instructions);
      console.log(url);
    },
    onPrompt: ({ message }) => rl.question(`${message} `),
    onProgress: (message) => console.log(message),
    originator: "codingagent",
  });

  auth["openai-codex"] = { type: "oauth", ...credentials };
  await writeFile(authPath, `${JSON.stringify(auth, null, 2)}\n`);
  console.log("Saved OpenAI Codex OAuth credentials to auth.json");
} finally {
  rl.close();
}
