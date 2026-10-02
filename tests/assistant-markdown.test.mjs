import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(() => vite.close());
const { AssistantMarkdown } = await vite.ssrLoadModule(
  "/src/components/chat/AssistantMarkdown.tsx"
);
const { MessageList } = await vite.ssrLoadModule(
  "/src/components/chat/MessageList.tsx"
);
const render = (content) =>
  renderToStaticMarkup(createElement(AssistantMarkdown, { content }));
const message = (role, content) => ({
  id: role,
  role,
  content,
  timestamp: "2026-10-02T00:00:00Z"
});

test("core Markdown renders semantic elements and plain text", () => {
  const cases = [
    ["Hello world", /<p>Hello world<\/p>/],
    ["*emphasis*", /<em>emphasis<\/em>/],
    ["**strong**", /<strong>strong<\/strong>/],
    ["# Heading", /<h1>Heading<\/h1>/],
    [
      "- one\n- two",
      /<ul>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ul>/
    ],
    [
      "1. one\n2. two",
      /<ol>[\s\S]*<li>one<\/li>[\s\S]*<li>two<\/li>[\s\S]*<\/ol>/
    ],
    ["> quoted", /<blockquote>[\s\S]*quoted[\s\S]*<\/blockquote>/],
    ["`inline`", /<code>inline<\/code>/],
    [
      "```ts\nconst x = 1;\n```",
      /<pre><code class="language-ts">const x = 1;\n<\/code><\/pre>/
    ]
  ];
  for (const [source, expected] of cases)
    assert.match(render(source), expected);
});

test("only absolute HTTP(S) destinations become keyboard-accessible links", () => {
  for (const scheme of ["http", "https"]) {
    assert.match(
      render(`[Open](${scheme}://example.com/path)`),
      new RegExp(
        `<a href="${scheme}://example.com/path" target="_blank" rel="noopener noreferrer">Open<\\/a>`
      )
    );
  }
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "vbscript:alert(1)",
    "file:///secret",
    "/relative",
    "//example.com",
    "https://user:pass@example.com"
  ]) {
    const html = render(`[Open](${url})`);
    assert.doesNotMatch(html, /<a\b|href=/);
    assert.match(html, /Open/);
  }
});

test("raw HTML cannot create executable or embedded elements", () => {
  const html = render(
    '<script>alert("x")</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://example.com"></iframe>\n\n<object data="x"></object>\n\n<embed src="x">'
  );
  assert.doesNotMatch(html, /<(?:script|img|iframe|object|embed)\b/i);
  assert.doesNotMatch(html, /onerror=|src=|data=/i);
});

test("Markdown images cannot fetch remote content and retain alt text", () => {
  const html = render("Before ![useful alt](https://example.com/a.png) after");
  assert.doesNotMatch(html, /<img\b|src=/);
  assert.match(html, /useful alt/);
});

test("empty and incomplete stream fragments render without throwing", () => {
  for (const source of [
    "",
    "**Hel",
    "[Open](https://exa",
    "```ts\nconst x ="
  ]) {
    assert.doesNotThrow(() => render(source));
  }
  assert.match(render("**Hello**"), /<strong>Hello<\/strong>/);
});

test("saved and provisional assistant content share formatting; other roles remain plain", () => {
  const source = "**Strong** <script>bad</script>";
  const html = renderToStaticMarkup(
    createElement(MessageList, {
      history: [
        message("user", source),
        message("system", source),
        message("tool", source),
        message("assistant", source)
      ],
      pending: { id: "attempt", prompt: "Prompt" },
      streamedAssistant: { attemptId: "attempt", content: source }
    })
  );
  assert.equal((html.match(/<strong>Strong<\/strong>/g) ?? []).length, 2);
  assert.equal((html.match(/\*\*Strong\*\*/g) ?? []).length, 3);
  assert.equal(
    (html.match(/class="message-content assistant-markdown"/g) ?? []).length,
    2
  );
  assert.equal((html.match(/<script>/g) ?? []).length, 0);
  for (const label of ["You", "System", "Tool", "Agent", "Responding"])
    assert.match(html, new RegExp(label));
});
