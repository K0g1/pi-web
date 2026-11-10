import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { DARK_THEMES, LIGHT_THEMES, THEME_INIT_SCRIPT, THEME_OPTIONS, isDarkTheme, isThemePreference } from "./theme.ts";
import { enLocale } from "./i18n/messages/en.ts";
import { zhCNLocale } from "./i18n/messages/zh-CN.ts";
import { zhTWLocale } from "./i18n/messages/zh-TW.ts";

const LEGACY_THEME_IDS = [
  "light",
  "mist",
  "lilac",
  "sand",
  "rose",
  "dark",
  "pine",
  "dusk",
  "ember",
  "slate",
  "contrast-light",
  "contrast-dark",
  "zenburn",
];
const NEW_THEME_IDS = [
  "paper",
  "sky",
  "sage",
  "clay",
  "glacier",
  "latte",
  "solarized-light",
  "gruvbox-light",
  "rose-pine-dawn",
  "midnight",
  "ocean",
  "graphite",
  "plum",
  "forest",
  "nord",
  "tokyo-night",
  "dracula",
  "solarized-dark",
];
const PALETTE_VARIABLES = [
  "bg",
  "bg-panel",
  "bg-hover",
  "bg-selected",
  "border",
  "text",
  "text-muted",
  "text-dim",
  "accent",
  "accent-hover",
  "accent-contrast",
  "user-bg",
  "assistant-bg",
  "tool-bg",
  "bg-subtle",
];
const SURFACE_VARIABLES = ["bg", "bg-panel", "bg-hover", "bg-selected", "user-bg", "assistant-bg", "tool-bg", "bg-subtle"];
const TEXT_VARIABLES = ["text", "text-muted", "text-dim", "accent"];

const globalsCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const extraCss = readFileSync(new URL("../app/themes-extra.css", import.meta.url), "utf8");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function paletteBlocks(css, id) {
  const pattern = new RegExp(
    `(?:^|\\n)([^{}]*\\[data-theme="${escapeRegExp(id)}"\\][^{}]*)\\{([^{}]*)\\}`,
    "g",
  );
  return [...css.matchAll(pattern)]
    .filter((match) => PALETTE_VARIABLES.some((name) => new RegExp(`--${escapeRegExp(name)}\\s*:`).test(match[2])))
    .map((match) => ({ selector: match[1].trim(), body: match[2] }));
}

function paletteFor(id) {
  const blocks = [...paletteBlocks(globalsCss, id), ...paletteBlocks(extraCss, id)];
  assert.equal(blocks.length, 1, `${id} should have exactly one palette block`);
  const declarations = Object.fromEntries(
    [...blocks[0].body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]),
  );
  const scheme = /\bcolor-scheme\s*:\s*(light|dark)\s*;/.exec(blocks[0].body)?.[1];
  return { ...blocks[0], declarations, scheme };
}

function parseHex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  assert.ok(match, `${value} should be a six-digit hex color`);
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16));
}

function colorOn(value, palette) {
  if (value.startsWith("#")) return value;
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value);
  assert.ok(match, `${value} should be a hex or rgba color`);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  const backdrop = parseHex(palette.bg);
  const blended = [match[1], match[2], match[3]].map((channel, index) =>
    Math.round(Number(channel) * alpha + backdrop[index] * (1 - alpha)),
  );
  return `#${blended.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex) {
  const [red, green, blue] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("first paint restores every palette and falls back to the system for invalid or blocked storage", () => {
  for (const systemDark of [false, true]) {
    for (const stored of [...THEME_OPTIONS.map(({ id }) => id), null, "", "unknown", new Error("Blocked")]) {
      const root = { dataset: {}, classList: { toggle: (name, value) => { root[name] = value; } } };
      runInNewContext(THEME_INIT_SCRIPT, {
        localStorage: { getItem: () => { if (stored instanceof Error) throw stored; return stored; } },
        window: { matchMedia: () => ({ matches: systemDark }) },
        document: { documentElement: root },
      });
      const expected = isThemePreference(stored) && stored !== "auto" ? stored : systemDark ? "dark" : "light";
      assert.equal(root.dataset.theme, expected);
      assert.equal(root.dark, isDarkTheme(expected));
    }
  }
});

test("every palette belongs to exactly one of the light and dark sets", () => {
  const palettes = THEME_OPTIONS.map(({ id }) => id).filter((id) => id !== "auto");
  assert.deepEqual([...LIGHT_THEMES, ...DARK_THEMES].sort(), [...palettes].sort());
  assert.equal(LIGHT_THEMES.some((id) => DARK_THEMES.includes(id)), false);
  assert.ok(LIGHT_THEMES.includes("light") && DARK_THEMES.includes("dark"));
});

test("the catalog keeps every legacy id and adds nine light and nine dark palettes", () => {
  assert.equal(THEME_OPTIONS.length, 32);
  assert.equal(new Set(THEME_OPTIONS.map(({ id }) => id)).size, THEME_OPTIONS.length);
  assert.deepEqual(THEME_OPTIONS.slice(1, 14).map(({ id }) => id), LEGACY_THEME_IDS);
  assert.deepEqual(THEME_OPTIONS.slice(14).map(({ id }) => id), NEW_THEME_IDS);
  assert.equal(NEW_THEME_IDS.filter((id) => LIGHT_THEMES.includes(id)).length, 9);
  assert.equal(NEW_THEME_IDS.filter((id) => DARK_THEMES.includes(id)).length, 9);
  for (const option of THEME_OPTIONS) {
    assert.deepEqual(Object.keys(option).sort(), ["id", "label", "scheme"]);
    assert.ok(option.scheme === null || option.scheme === "light" || option.scheme === "dark");
  }
});

test("every palette label exists in all supported locales", () => {
  for (const locale of [enLocale, zhCNLocale, zhTWLocale]) {
    for (const option of THEME_OPTIONS) {
      assert.equal(typeof locale.messages[option.label], "string", `${locale.id} is missing ${option.label}`);
      assert.ok(locale.messages[option.label].trim(), `${locale.id} has an empty ${option.label}`);
    }
  }
});

test("every palette is complete, static, and declares its scheme", () => {
  const importAt = globalsCss.indexOf('@import "./themes-extra.css";');
  assert.ok(importAt >= 0, "globals.css should import themes-extra.css");
  assert.ok(importAt < globalsCss.indexOf("@theme"), "the palette import should precede globals.css rules");

  for (const option of THEME_OPTIONS) {
    if (option.id === "auto") continue;
    const palette = paletteFor(option.id);
    assert.equal(palette.scheme, option.scheme, `${option.id} color-scheme`);
    for (const name of PALETTE_VARIABLES) {
      assert.ok(palette.declarations[name], `${option.id} is missing --${name}`);
    }
    for (const name of PALETTE_VARIABLES.filter((name) => name !== "bg-subtle")) {
      assert.match(palette.declarations[name], /^#[0-9a-f]{6}$/i, `${option.id} --${name}`);
    }
    assert.ok(palette.declarations["bg-subtle"], `${option.id} --bg-subtle`);
    if (DARK_THEMES.includes(option.id) && paletteBlocks(extraCss, option.id).length) {
      assert.match(palette.selector, new RegExp(`html\\[data-theme="${escapeRegExp(option.id)}"\\]`), `${option.id} needs the html selector`);
      assert.match(palette.selector, new RegExp(`html\\.dark\\[data-theme="${escapeRegExp(option.id)}"\\]`), `${option.id} needs the html.dark selector`);
      assert.match(palette.selector, new RegExp(`(?:^|\\n)\\[data-theme="${escapeRegExp(option.id)}"\\]`), `${option.id} needs the bare selector`);
    }
  }
});

test("text, muted, dim, accent, and accent contrast meet WCAG AA on every surface", () => {
  const palettes = new Map(
    THEME_OPTIONS.filter(({ id }) => id !== "auto").map(({ id }) => [id, paletteFor(id).declarations]),
  );
  for (const [id, palette] of palettes) {
    for (const foreground of TEXT_VARIABLES) {
      for (const surface of SURFACE_VARIABLES) {
        const ratio = contrastRatio(palette[foreground], colorOn(palette[surface], palette));
        assert.ok(ratio >= 4.5, `${id}: --${foreground} on --${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
    for (const accent of ["accent", "accent-hover"]) {
      const ratio = contrastRatio(palette["accent-contrast"], palette[accent]);
      assert.ok(ratio >= 4.5, `${id}: --accent-contrast on --${accent} is ${ratio.toFixed(2)}:1`);
    }
  }

  for (const id of ["contrast-light", "contrast-dark"]) {
    for (const foreground of ["text", "text-muted", "text-dim"]) {
      for (const surface of SURFACE_VARIABLES) {
        const palette = palettes.get(id);
        const ratio = contrastRatio(palette[foreground], colorOn(palette[surface], palette));
        assert.ok(ratio >= 7, `${id}: --${foreground} on --${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("the catalog has no duplicate palette signatures", () => {
  const signatures = THEME_OPTIONS
    .filter(({ id }) => id !== "auto")
    .map(({ id }) => {
      const palette = paletteFor(id).declarations;
      return PALETTE_VARIABLES.map((name) => palette[name]).join("|");
    });
  assert.equal(new Set(signatures).size, signatures.length);
});
