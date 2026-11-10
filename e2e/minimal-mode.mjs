import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DISPLAY_MODE_KEY = "pi-web:display-mode";
const PROMPT = "Minimal live turn fixture";
const NEWEST_THINKING = "Newest live token";
const THINKING = `${"old token ".repeat(200)}\n${"latest filler ".repeat(20)}${NEWEST_THINKING}`;
const TOOL_COMMAND = "printf 'E2E tool output'";
const TOOL_OUTPUT = "E2E tool output";
const FINAL_TEXT = "**Minimal final answer**\n\nThis is the settled response.";
const PROCESS_ID = "minimal-process";
const ANSWER_ID = "minimal-answer";
const TIMESTAMP = "2026-08-23T00:00:01.000Z";

function assistantMessage(content, stopReason = "stop") {
  return {
    role: "assistant",
    content,
    provider: "e2e",
    model: "minimal-fixture",
    stopReason,
    timestamp: Date.parse(TIMESTAMP),
  };
}

function sessionMessage(id, parentId, message) {
  return { type: "message", id, parentId, timestamp: TIMESTAMP, message };
}

const processMessage = assistantMessage([
  { type: "thinking", thinking: THINKING },
  { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: TOOL_COMMAND } },
], "toolUse");
const finalMessage = assistantMessage([{ type: "text", text: FINAL_TEXT }]);

/**
 * A test-controlled EventSource for one agent session. The app still creates
 * and consumes the source through its normal EventSource path; only the
 * transport is replaced, so no wrapper, provider, or model credential is used.
 */
async function installAgentEventSource(page, sessionId) {
  await page.addInitScript(({ id }) => {
    const NativeEventSource = window.EventSource;
    const target = `/api/agent/${encodeURIComponent(id)}/events`;
    const state = { sources: [] };

    class FixtureEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;

      constructor(url, init) {
        const href = String(url);
        if (!href.startsWith(target)) return new NativeEventSource(href, init);
        this.url = href;
        this.readyState = FixtureEventSource.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.listeners = { open: new Set(), error: new Set() };
        state.sources.push(this);
      }

      addEventListener(type, listener) {
        this.listeners[type]?.add(listener);
      }

      removeEventListener(type, listener) {
        this.listeners[type]?.delete(listener);
      }

      close() {
        this.readyState = FixtureEventSource.CLOSED;
      }
    }

    state.emit = (event) => {
      const source = [...state.sources].reverse().find((candidate) => candidate.readyState !== FixtureEventSource.CLOSED);
      if (!source) throw new Error("No fixture EventSource is open");
      if (source.readyState === FixtureEventSource.CONNECTING) {
        source.readyState = FixtureEventSource.OPEN;
        const opened = new Event("open");
        source.onopen?.(opened);
        source.listeners.open.forEach((listener) => listener(opened));
      }
      const message = new MessageEvent("message", { data: JSON.stringify(event) });
      source.onmessage?.(message);
    };

    Object.defineProperty(window, "__piMinimalE2E", { value: state, configurable: true });
    window.EventSource = FixtureEventSource;
  }, { id: sessionId });
}

async function waitForAgentSource(page) {
  await page.waitForFunction(() => {
    const source = window.__piMinimalE2E?.sources?.at(-1);
    return Boolean(source && typeof source.onmessage === "function");
  }, null, { timeout: 15_000 });
}

async function emit(page, event) {
  await page.evaluate((next) => window.__piMinimalE2E.emit(next), event);
}

async function waitForPreview(page, text) {
  await page.waitForFunction(({ expected }) => {
    const preview = document.querySelector('[data-minimal-activity="live"] [data-activity-preview]')
      ?? document.querySelector('[data-activity-preview]');
    return preview?.textContent?.includes(expected) === true;
  }, { expected: text }, { timeout: 10_000 });
}

async function waitForActivityText(page, text) {
  await page.waitForFunction(({ expected }) => document.querySelector('[data-minimal-activity="live"]')
    ?.textContent?.includes(expected) === true, { expected: text }, { timeout: 10_000 });
}

async function waitForAnswer(page, text) {
  await page.waitForFunction(({ expected }) => Array.from(document.querySelectorAll('[data-message-role="assistant"]'))
    .some((answer) => answer.textContent?.includes(expected)), { expected: text }, { timeout: 10_000 });
}

function processButton(page) {
  return page.getByRole("button", { name: /^Process details/ }).first();
}

async function assertNoProcessCards(page, label) {
  assert.equal(await page.locator('[data-message-role="assistant"]').count(), 0, `${label}: process cards must stay unmounted`);
  assert.equal(await page.getByRole("button", { name: /^Thinking/ }).count(), 0, `${label}: thinking card must stay unmounted`);
  assert.equal(await page.locator('[data-message-role="assistant"] button').filter({ hasText: "bash" }).count(), 0, `${label}: tool card must stay unmounted`);
}

function appendSettledEntries(sessionFile) {
  const entries = [
    sessionMessage(PROCESS_ID, "prompt", processMessage),
    sessionMessage(ANSWER_ID, PROCESS_ID, finalMessage),
  ];
  const existing = readFileSync(sessionFile, "utf8");
  const missing = entries.filter((entry) => !existing.includes(`"id":"${entry.id}"`));
  if (missing.length > 0) appendFileSync(sessionFile, `${missing.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

async function checkStandardDefault({ browser, base, sessionId }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "en-US" });
  try {
    const page = await context.newPage();
    await installAgentEventSource(page, sessionId);
    await page.goto(`${base}/?session=${encodeURIComponent(sessionId)}`, { waitUntil: "domcontentloaded" });
    await page.getByText(PROMPT, { exact: true }).first().waitFor();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), DISPLAY_MODE_KEY), null, "Standard must be the default");
    await waitForAgentSource(page);
    await emit(page, { type: "connected", isStreaming: false });
    await emit(page, { type: "agent_start" });
    await emit(page, { type: "message_start", message: assistantMessage([]) });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "thinking_start", contentIndex: 0 } });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "Standard thinking card" } });
    await page.getByRole("button", { name: /^Thinking/ }).waitFor();
    assert.equal(await page.locator('[data-minimal-activity="live"]').count(), 0, "Standard must keep the full streamed card");
    console.log("PASS: Standard remains the default and mounts streamed thinking cards");
  } finally {
    await context.close();
  }
}

export async function checkMinimalMode({ browser, base, artifacts, sessionId, sessionFile }) {
  assert.ok(sessionId, "Minimal fixture session id is required");
  assert.ok(sessionFile, "Minimal fixture session file is required");
  await checkStandardDefault({ browser, base, sessionId });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    storageState: {
      cookies: [],
      origins: [{
        origin: new URL(base).origin,
        localStorage: [{ name: DISPLAY_MODE_KEY, value: "minimal" }],
      }],
    },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installAgentEventSource(page, sessionId);

  try {
    await page.goto(`${base}/?session=${encodeURIComponent(sessionId)}`, { waitUntil: "domcontentloaded" });
    await page.getByText(PROMPT, { exact: true }).first().waitFor();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), DISPLAY_MODE_KEY), "minimal");
    await waitForAgentSource(page);

    await emit(page, { type: "connected", isStreaming: false });
    await emit(page, { type: "agent_start" });
    const activity = page.locator('[data-minimal-activity="live"]');
    await activity.waitFor();

    await emit(page, { type: "message_start", message: assistantMessage([]) });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "thinking_start", contentIndex: 0 } });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "old token ".repeat(200) } });
    await waitForPreview(page, "old token");
    const before = await page.locator('[data-activity-preview]').first().innerText();
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: `\n${"latest filler ".repeat(20)}${NEWEST_THINKING}` } });
    await waitForPreview(page, NEWEST_THINKING);
    const preview = page.locator('[data-minimal-activity="live"] [data-activity-preview]').first();
    const after = await preview.innerText();
    assert.notEqual(after, before, "the live preview must follow the newest thinking tokens");
    assert.ok(!after.includes("old token"), `the preview must leave old thinking behind: ${after}`);
    assert.equal(await preview.evaluate((element) => getComputedStyle(element).whiteSpace), "nowrap", "the live preview must stay on one line");
    await assertNoProcessCards(page, "thinking");

    const toggle = processButton(page);
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false", "live process disclosure starts collapsed");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const thinking = activity.getByRole("button", { name: /^Thinking/ });
    await thinking.click();
    await activity.locator('[data-message-role="assistant"]').getByText("Newest live token", { exact: false }).waitFor();
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await assertNoProcessCards(page, "collapsed thinking");

    await emit(page, { type: "message_update", assistantMessageEvent: { type: "thinking_end", contentIndex: 0, content: THINKING } });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "toolcall_start", contentIndex: 1, id: "tool-1", toolName: "bash" } });
    await waitForActivityText(page, "bash");
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "toolcall_delta", contentIndex: 1, id: "tool-1", toolName: "bash", delta: '{"command":"printf ' } });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "toolcall_delta", contentIndex: 1, id: "tool-1", toolName: "bash", delta: "'E2E tool output'\"}" } });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "toolcall_end", contentIndex: 1, toolCall: { id: "tool-1", name: "bash", arguments: { command: TOOL_COMMAND } } } });
    await waitForPreview(page, TOOL_COMMAND);
    await emit(page, { type: "message_end", message: processMessage });
    await emit(page, { type: "tool_execution_start", toolCallId: "tool-1", toolName: "bash" });
    await emit(page, { type: "tool_execution_update", toolCallId: "tool-1", toolName: "bash", partialResult: { content: [{ type: "text", text: TOOL_OUTPUT }] } });
    await waitForPreview(page, TOOL_OUTPUT);
    await assertNoProcessCards(page, "tool execution");

    await emit(page, { type: "message_start", message: assistantMessage([]) });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "text_start", contentIndex: 0 } });
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "**Minimal final answer**" } });
    await waitForAnswer(page, "Minimal final answer");
    assert.equal(await page.locator('[data-minimal-activity="live"]').count(), 1, "the activity row stays live while the answer streams");
    assert.equal(await page.locator('[data-message-role="assistant"]').count(), 1, "only the answer mounts while final text streams");
    assert.equal(await page.getByRole("button", { name: /^Thinking/ }).count(), 0, "thinking must not mount beside the final answer");
    assert.equal(await page.locator('[data-message-role="assistant"] button').filter({ hasText: "bash" }).count(), 0, "tool cards must not mount beside the final answer");
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "\n\nThis is the settled response." } });
    await waitForAnswer(page, "This is the settled response.");
    await emit(page, { type: "message_update", assistantMessageEvent: { type: "text_end", contentIndex: 0, content: FINAL_TEXT } });
    await emit(page, { type: "message_end", message: finalMessage });
    appendSettledEntries(sessionFile);
    await emit(page, { type: "agent_end" });
    await emit(page, { type: "agent_settled" });

    await page.locator('[data-minimal-activity="live"]').waitFor({ state: "detached" });
    await page.locator('[data-minimal-activity="settled"]').waitFor();
    const settledToggle = processButton(page);
    await settledToggle.waitFor();
    assert.equal(await settledToggle.getAttribute("aria-expanded"), "false", "settled process details start collapsed");
    await page.locator('[data-message-role="assistant"] .markdown-body strong').filter({ hasText: "Minimal final answer" }).waitFor();
    await page.getByText("This is the settled response.", { exact: false }).first().waitFor();
    assert.equal(await page.getByRole("button", { name: /^Thinking/ }).count(), 0, "settled process cards stay folded");

    await settledToggle.click();
    assert.equal(await settledToggle.getAttribute("aria-expanded"), "true");
    const settled = page.locator('[data-minimal-activity="settled"]');
    await settled.getByRole("button", { name: /^Thinking/ }).click();
    await settled.getByText("Newest live token", { exact: false }).waitFor();
    await settledToggle.click();
    assert.equal(await settledToggle.getAttribute("aria-expanded"), "false");
    assert.equal(await page.getByRole("button", { name: /^Thinking/ }).count(), 0, "collapsing removes the process cards");

    assert.deepEqual(pageErrors, [], "Minimal live turn raised browser errors");
    console.log("PASS: Minimal live activity stays compact, expands, streams the answer, and settles folded");
  } catch (error) {
    if (artifacts) await page.screenshot({ path: join(artifacts, "minimal-mode-failure.png") }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
