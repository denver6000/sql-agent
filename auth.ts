import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOAuthApiKey, type OAuthCredentials } from "@mariozechner/pi-ai/oauth";

const AUTH_FILE = resolve(process.cwd(), "auth.json");

type StoredAuthRecord = {
  type?: string;
} & OAuthCredentials;

type StoredAuth = Record<string, StoredAuthRecord>;

function loadAuth(): StoredAuth {
  if (!existsSync(AUTH_FILE)) return {};

  try {
    const parsed = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
    if (parsed && typeof parsed === "object") {
      return parsed as StoredAuth;
    }
  } catch {
    return {};
  }

  return {};
}

function saveAuth(auth: StoredAuth) {
  writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), "utf-8");
}

export async function resolveOAuthApiKey(provider: string) {
  const auth = loadAuth();
  const credentials = auth[provider];

  if (!credentials || credentials.type !== "oauth") {
    return undefined;
  }

  const oauthOnly: Record<string, OAuthCredentials> = {
    [provider]: credentials,
  };

  const result = await getOAuthApiKey(provider, oauthOnly);
  if (!result) return undefined;

  auth[provider] = {
    type: "oauth",
    ...result.newCredentials,
  };
  saveAuth(auth);

  return result.apiKey;
}

export function getAuthFilePath() {
  return AUTH_FILE;
}
