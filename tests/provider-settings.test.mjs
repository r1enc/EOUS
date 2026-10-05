import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom"
});
after(() => vite.close());
const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
const capabilities = {
  contextWindow: 100,
  supportsSystemInstructions: true,
  supportsFunctionCalling: false,
  supportsVision: false
};
const providers = ["openai", "gemini", "groq"].map((id) => ({
  id,
  name: { openai: "OpenAI", gemini: "Gemini", groq: "Groq" }[id],
  runtimeSettings: { capabilities }
}));
const boundary = {
  loadSettings: () => {
    throw new Error("Effects must not run during static rendering");
  },
  loadCredential: () => {
    throw new Error("Stored credentials must not be loaded");
  }
};
const providerSettings = { boundary, providers };
const workspace = {
  id: "workspace",
  title: "Workspace",
  getHistory: () => [],
  execute: () => {}
};
const navigation = {
  listConversations: async () => [],
  createConversation: async () => {},
  openConversation: async () => {}
};

test("injected settings mode renders a loading screen with no credential content or storage read", () => {
  const html = renderToStaticMarkup(createElement(App, { providerSettings }));
  assert.match(html, /AI providers/);
  assert.match(html, /Loading provider settings/);
  assert.doesNotMatch(
    html,
    /api-key-secret|native-secret|sql-secret|input type="password"/
  );
});

test("conflicting App modes fail closed without rendering a settings form or workspace", () => {
  for (const props of [
    { providerSettings, workspace },
    { providerSettings, navigation },
    { workspace, navigation },
    { providerSettings, workspace, navigation }
  ]) {
    const html = renderToStaticMarkup(createElement(App, props));
    assert.match(html, /Chat is unavailable/);
    assert.doesNotMatch(
      html,
      /AI providers|Loading provider settings|textarea|Message the Agent/
    );
  }
});
