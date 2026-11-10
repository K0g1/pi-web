import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".module.css")) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: "export default new Proxy({}, { get: (_, key) => String(key) });",
    };
  },
});

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { MinimalTurnActivity } = await jiti.import("./MinimalTurnActivity.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { createStreamingStore } = await jiti.import("@/lib/streaming-message");

function renderLive(markdown, sessionId = "session/with space") {
  const store = createStreamingStore();
  store.dispatch({
    type: "snapshot",
    message: {
      role: "assistant",
      content: [{ type: "text", text: markdown }],
      stopReason: "stop",
    },
  });
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MinimalTurnActivity, {
        live: {
          store,
          onCommit() {},
          phase: { kind: "waiting" },
          isCompacting: false,
          queuedCount: 0,
          toolResults: new Map(),
          modelNames: {},
          cwd: "/private/tmp",
          sessionId,
          onOpenFile() {},
        },
      }),
    ),
  );
}

test("minimal live replies authorize local Markdown media with the session", () => {
  const html = renderLive("![inline](file:///tmp/pi_inline_test.png)");

  assert.match(html, /<img[^>]+src="\/api\/files\/tmp\/pi_inline_test\.png\?type=read&amp;sessionId=session%2Fwith%20space"/);
  assert.doesNotMatch(html, /src="file:/);
});

test("minimal live replies leave remote images and sanitized data Markdown unchanged", () => {
  const remote = renderLive("![logo](https://example.com/logo.png)");
  const embedded = renderLive("![pixel](data:image/png;base64,YWJj)");

  assert.match(remote, /<img[^>]+src="https:\/\/example\.com\/logo\.png"/);
  assert.match(embedded, /<img alt="pixel" loading="lazy"\/>/);
  assert.doesNotMatch(embedded, /data:image|src=/);
  assert.doesNotMatch(remote, /sessionId/);
  assert.doesNotMatch(embedded, /sessionId/);
});
