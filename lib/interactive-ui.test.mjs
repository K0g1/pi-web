import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { parseInteractiveUiMode, resolveInteractiveUiCommand } from "./interactive-ui.ts";

const jiti = createJiti(import.meta.url);
const { createInteractiveUiPromptContext, interactiveUiInstructions } = await jiti.import("./interactive-ui-prompt.ts");

test("the cycle and three direct commands have the same modes", () => {
  assert.deepEqual(["off", "rich", "interactive"].map((mode) => resolveInteractiveUiCommand("interactive-ui", "", mode)),
    ["rich", "interactive", "off"]);
  assert.equal(resolveInteractiveUiCommand("interactive-ui-off", "", "rich"), "off");
  assert.equal(resolveInteractiveUiCommand("interactive-ui-rich", "", "off"), "rich");
  assert.equal(resolveInteractiveUiCommand("interactive-ui-live", "", "rich"), "interactive");
  assert.equal(resolveInteractiveUiCommand("interactive-ui", "format", "off"), "rich");
  assert.equal(resolveInteractiveUiCommand("interactive-ui", "live", "off"), "interactive");
  assert.equal(resolveInteractiveUiCommand("interactive-ui", "unknown", "off"), null);
  assert.equal(resolveInteractiveUiCommand("unrelated", "", "off"), undefined);
  assert.equal(parseInteractiveUiMode({ systemPrompt: "injected" }), "off");
});

test("visual guidance is scoped to each asynchronous submission, including exact system prompts", async () => {
  const scope = createInteractiveUiPromptContext();
  let beforeStart;
  scope.extension.factory({ on(event, handler) { if (event === "before_agent_start") beforeStart = handler; } });
  const start = (forceSystemPrompt) => {
    const systemPromptOptions = { forceSystemPrompt, sections: { original: "Project instructions" } };
    beforeStart({ systemPromptOptions });
    return systemPromptOptions;
  };
  const [live, rich, off] = await Promise.all([
    scope.run("interactive", async () => { await new Promise((resolve) => setImmediate(resolve)); return start(); }),
    scope.run("rich", async () => { await Promise.resolve(); return start("Exact chat-only instructions"); }),
    scope.run("off", async () => { await Promise.resolve(); return start(); }),
  ]);
  assert.equal(live.sections.original, "Project instructions");
  assert.match(live.sections.pi_web_visuals, /```pi-html/);
  assert.match(live.sections.pi_web_visuals, /data-pi-source/);
  assert.equal(rich.forceSystemPrompt, `Exact chat-only instructions\n\n${interactiveUiInstructions("rich")}`);
  assert.doesNotMatch(rich.forceSystemPrompt, /pi-html/);
  assert.deepEqual(off.sections, { original: "Project instructions" });
  assert.deepEqual(start().sections, off.sections);
  assert.equal(interactiveUiInstructions("off"), undefined);
});
