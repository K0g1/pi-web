import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  APPEARANCE_INIT_SCRIPT,
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_STORAGE_VERSION,
  DEFAULT_APPEARANCE,
  applyAppearancePreferences,
  normalizeAppearancePreferences,
  parseAppearancePreferences,
  serializeAppearancePreferences,
} from "./appearance-preferences.ts";

function bootstrapFixture(stored, { blocked = false, properties = {}, attributes = {} } = {}) {
  let current = stored;
  const applied = new Map(Object.entries(properties));
  const appliedAttributes = new Map(Object.entries(attributes));
  const events = new Map();
  const root = {
    dataset: { theme: "dark" },
    className: "dark",
    style: {
      setProperty(key, value) { applied.set(key, value); },
      removeProperty(key) { applied.delete(key); },
    },
    setAttribute(key, value) { appliedAttributes.set(key, value); },
    removeAttribute(key) { appliedAttributes.delete(key); },
  };
  const storage = {
    getItem() {
      if (blocked) throw new Error("blocked");
      return current;
    },
  };
  runInNewContext(APPEARANCE_INIT_SCRIPT, {
    localStorage: storage,
    window: {
      addEventListener(type, listener) { events.set(type, listener); },
    },
    document: { documentElement: root },
  });
  return {
    applied,
    appliedAttributes,
    events,
    root,
    setStored(value) { current = value; },
  };
}

test("normalization clamps, snaps to each slider step, and ignores arbitrary keys and CSS", () => {
  const normalized = normalizeAppearancePreferences({
    version: APPEARANCE_STORAGE_VERSION,
    preferences: {
      interfaceSize: "13px; color:red",
      sidebarSize: 999,
      messageSpacing: 7,
      lineHeight: 1.62,
      radius: -10,
      toolbarHeight: 30,
      composerInset: 41,
      borderStrength: 53,
      topBar: "always; background:red",
      minimap: "hidden",
      messageMetadata: "sometimes",
      extensionStatus: "hidden",
      composerControls: "always",
      messageStyle: "round",
      chatAlignment: "right",
      motion: "reduced",
      colors: {
        accent: "red; background:url(x)",
        bg: "#112233",
        border: "#abc",
        text: "#1234567",
        evil: "#ffffff",
      },
      arbitrary: "#000000",
      css: "--x:y",
    },
  });

  assert.equal(normalized.interfaceSize, 13);
  assert.equal(normalized.sidebarSize, 18);
  assert.equal(normalized.messageSpacing, 8);
  assert.equal(normalized.lineHeight, 1.6);
  assert.equal(normalized.radius, 0);
  assert.equal(normalized.toolbarHeight, 30);
  assert.equal(normalized.composerInset, 40);
  assert.equal(normalized.borderStrength, 55);
  assert.equal(normalized.topBar, "auto");
  assert.equal(normalized.minimap, "hidden");
  assert.equal(normalized.messageMetadata, "auto");
  assert.equal(normalized.extensionStatus, "hidden");
  assert.equal(normalized.composerControls, "always");
  assert.equal(normalized.messageStyle, "bubble");
  assert.equal(normalized.chatAlignment, "center");
  assert.equal(normalized.motion, "reduced");
  assert.deepEqual(normalized.colors, { bg: "#112233" });
  assert.equal("arbitrary" in normalized, false);
  assert.equal("css" in normalized, false);
  assert.equal(normalizeAppearancePreferences({ version: "stray", radius: 16 }).radius, 16);
  assert.equal(normalizeAppearancePreferences({ preferences: "stray", radius: 16 }).radius, 16);
});

test("invalid numeric storage falls back to defaults instead of coercing objects or CSS", () => {
  for (const value of [null, undefined, true, {}, [], "", " ", "13px", Number.NaN, Infinity]) {
    assert.equal(normalizeAppearancePreferences({ interfaceSize: value }).interfaceSize, 13, String(value));
  }
  assert.equal(normalizeAppearancePreferences({ interfaceSize: "15" }).interfaceSize, 15);
  assert.equal(normalizeAppearancePreferences({ lineHeight: 1.63 }).lineHeight, 1.65);
  assert.equal(normalizeAppearancePreferences({ borderStrength: 97 }).borderStrength, 95);
});

test("versioned persistence round-trips and rejects corrupt or future documents", () => {
  const custom = normalizeAppearancePreferences({
    ...DEFAULT_APPEARANCE,
    radius: 16,
    topBar: "hover",
    colors: { accent: "#abcdef" },
  });
  const raw = serializeAppearancePreferences(custom);
  assert.deepEqual(JSON.parse(raw), { version: APPEARANCE_STORAGE_VERSION, preferences: custom });
  assert.deepEqual(parseAppearancePreferences(raw), custom);
  assert.deepEqual(parseAppearancePreferences(JSON.stringify(custom)), custom);
  assert.deepEqual(
    parseAppearancePreferences(JSON.stringify({ version: APPEARANCE_STORAGE_VERSION, preferences: custom, theme: "dark" })),
    custom,
  );
  assert.deepEqual(parseAppearancePreferences(JSON.stringify({ version: 2, preferences: custom })), normalizeAppearancePreferences(null));
  assert.deepEqual(parseAppearancePreferences("{"), normalizeAppearancePreferences(null));
  assert.deepEqual(parseAppearancePreferences(null), normalizeAppearancePreferences(null));
});

test("the boot script applies only modified values, clears defaults, and preserves the theme", () => {
  const saved = {
    version: APPEARANCE_STORAGE_VERSION,
    preferences: {
      ...DEFAULT_APPEARANCE,
      interfaceSize: 15,
      lineHeight: 1.8,
      radius: 0,
      topBar: "always",
      minimap: "hidden",
      messageStyle: "flat",
      motion: "reduced",
      colors: { accent: "#112233", border: "#ABCDEF" },
    },
  };
  const fixture = bootstrapFixture(JSON.stringify(saved), {
    properties: { "--pi-message-spacing": "99px", "--stale": "x" },
    attributes: { "data-pi-chat-alignment": "left", "data-stale": "x" },
  });

  assert.equal(fixture.applied.get("--pi-interface-size"), "15px");
  assert.equal(fixture.applied.get("--pi-line-height"), "1.8");
  assert.equal(fixture.applied.get("--pi-radius"), "0px");
  assert.equal(fixture.applied.has("--pi-message-spacing"), false);
  assert.equal(fixture.applied.has("--pi-toolbar-height"), false);
  assert.equal(fixture.applied.get("--accent"), "#112233");
  assert.equal(fixture.applied.get("--border"), "#ABCDEF");
  assert.equal(fixture.applied.get("--stale"), "x");
  assert.equal(fixture.appliedAttributes.get("data-pi-top-bar"), "always");
  assert.equal(fixture.appliedAttributes.get("data-pi-minimap"), "hidden");
  assert.equal(fixture.appliedAttributes.get("data-pi-message-style"), "flat");
  assert.equal(fixture.appliedAttributes.get("data-pi-motion"), "reduced");
  assert.equal(fixture.appliedAttributes.has("data-pi-chat-alignment"), false);
  assert.equal(fixture.appliedAttributes.get("data-stale"), "x");
  assert.equal(fixture.root.dataset.theme, "dark");
  assert.equal(fixture.root.className, "dark");

  fixture.setStored(JSON.stringify({ version: APPEARANCE_STORAGE_VERSION, preferences: DEFAULT_APPEARANCE }));
  fixture.events.get("storage")({ key: APPEARANCE_STORAGE_KEY });
  assert.equal(fixture.applied.has("--pi-interface-size"), false);
  assert.equal(fixture.applied.has("--accent"), false);
  assert.equal(fixture.appliedAttributes.has("data-pi-top-bar"), false);
  assert.equal(fixture.appliedAttributes.has("data-pi-minimap"), false);
  assert.equal(fixture.appliedAttributes.get("data-stale"), "x");
  assert.equal(fixture.root.dataset.theme, "dark");
});

test("blocked or corrupt storage applies defaults without throwing or retaining overrides", () => {
  for (const fixture of [
    bootstrapFixture(null, { blocked: true, properties: { "--pi-radius": "24px" }, attributes: { "data-pi-top-bar": "always" } }),
    bootstrapFixture("not json", { properties: { "--pi-radius": "24px" }, attributes: { "data-pi-top-bar": "always" } }),
  ]) {
    assert.equal(fixture.applied.has("--pi-radius"), false);
    assert.equal(fixture.appliedAttributes.has("data-pi-top-bar"), false);
    assert.equal(fixture.root.dataset.theme, "dark");
  }
});

test("runtime application follows the same default and stale-override policy as boot", () => {
  const applied = new Map([["--pi-message-spacing", "99px"], ["--stale", "x"]]);
  const attributes = new Map([["data-pi-chat-alignment", "left"], ["data-stale", "x"]]);
  const previousDocument = globalThis.document;
  globalThis.document = {
    documentElement: {
      style: {
        setProperty(key, value) { applied.set(key, value); },
        removeProperty(key) { applied.delete(key); },
      },
      setAttribute(key, value) { attributes.set(key, value); },
      removeAttribute(key) { attributes.delete(key); },
    },
  };
  try {
    applyAppearancePreferences({
      ...DEFAULT_APPEARANCE,
      interfaceSize: 15,
      topBar: "always",
      colors: { accent: "#112233" },
    });
    assert.equal(applied.get("--pi-interface-size"), "15px");
    assert.equal(applied.has("--pi-message-spacing"), false);
    assert.equal(applied.get("--accent"), "#112233");
    assert.equal(attributes.get("data-pi-top-bar"), "always");
    assert.equal(attributes.has("data-pi-chat-alignment"), false);

    applyAppearancePreferences(DEFAULT_APPEARANCE);
    assert.equal(applied.has("--pi-interface-size"), false);
    assert.equal(applied.has("--accent"), false);
    assert.equal(attributes.has("data-pi-top-bar"), false);
    assert.equal(applied.get("--stale"), "x");
    assert.equal(attributes.get("data-stale"), "x");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
