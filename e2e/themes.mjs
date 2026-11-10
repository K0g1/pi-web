// Run against an existing Pi Web server: node --experimental-strip-types e2e/themes.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { DARK_THEMES, THEME_OPTIONS } from "../lib/theme.ts";

const base = process.env.E2E_BASE_URL || "http://127.0.0.1:30141";
const browser = await chromium.launch();

try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 800 },
      locale: "en-US",
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      await page.route(/\/api\/sessions(?:\?.*)?$/, (route) => route.fulfill({ json: { sessions: [] } }));
      await page.goto(base);

      const openThemes = async () => {
        const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
        if (width <= 640) await showSidebar.waitFor();
        if (await showSidebar.isVisible()) await showSidebar.click();
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        if (width <= 640) await page.getByRole("button", { name: "General", exact: true }).click();
        await page.getByRole("button", { name: "Browse themes", exact: true }).click();
      };
      const expectTheme = async (id) => {
        await page.waitForFunction((theme) => document.documentElement.dataset.theme === theme, id);
        const scheme = await page.locator("html").evaluate((root) => getComputedStyle(root).colorScheme);
        assert.equal(scheme, DARK_THEMES.includes(id) ? "dark" : "light");
      };
      const cards = page.locator("[data-theme-card]");
      const card = (id) => page.locator('[data-theme-card][data-theme-id="' + id + '"]');
      const choose = (id) => card(id).click();

      await openThemes();
      assert.equal(await cards.count(), THEME_OPTIONS.length);
      const search = page.getByRole("searchbox", { name: "Search themes" });
      await search.fill("dRaCuLa");
      assert.equal(await cards.count(), 1);
      await choose("dracula");
      await expectTheme("dracula");
      await page.locator("[data-theme-search-clear]").click();

      await page.locator('[data-theme-filter-value="light"]').click();
      assert.equal(await cards.count(), THEME_OPTIONS.filter(({ scheme }) => scheme === "light").length);
      assert.equal(await card("auto").count(), 0);
      await search.fill("no-such-theme");
      await page.locator("[data-theme-empty]").waitFor();
      await page.locator("[data-theme-reset]").click();
      assert.equal(await cards.count(), THEME_OPTIONS.length);

      assert.equal(await page.locator("[data-theme-grid]").evaluate((grid) => {
        const right = grid.getBoundingClientRect().right + 1;
        return [...grid.querySelectorAll("[data-theme-card]")].every((item) => item.getBoundingClientRect().right <= right);
      }), true, "the grid stays within its settings pane");

      await page.reload();
      await expectTheme("dracula");
      await openThemes();
      assert.equal(await card("dracula").locator("input").isChecked(), true);
      await choose("auto");
      await page.emulateMedia({ colorScheme: "dark" });
      await expectTheme("dark");
      console.log("PASS: theme search, scheme filters, layout, and persistence at " + width + "px");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
