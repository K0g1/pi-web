import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { resolveVisualImage } = await jiti.import("./visual-image.ts");
const input = (src, fields = {}) => ({ src, alt: "A labeled figure", source: "", page: "", crop: "", ...fields });

test("document crops cite the original file and page and use the session-scoped image route", () => {
  const image = resolveVisualImage(input("file:///tmp/Figure%203.png", {
    source: "Course notes.pdf", page: "3", crop: "15 20 60 30",
  }), "/work", "qa-session");
  assert.match(image.url, /^\/api\/files\/tmp\/Figure%203\.png\?type=read&sessionId=qa-session$/);
  assert.equal(image.alt, "A labeled figure");
  assert.equal(image.name, "Course notes.pdf");
  assert.equal(image.page, 3);
  assert.deepEqual(image.crop, { x: 15, y: 20, width: 60, height: 30 });
  const local = resolveVisualImage(input("./chart.jpg", { page: "0", crop: "90 20 30 20" }), "/work");
  assert.equal(local.name, "chart.jpg");
  assert.equal(local.page, undefined);
  assert.equal(local.crop, undefined);
});

test("online images retain origin attribution; special, app and local service URLs are refused", () => {
  const online = resolveVisualImage(input("https://upload.wikimedia.org/a.jpg", { source: "Wikimedia Commons" }));
  assert.equal(online.name, "Wikimedia Commons · upload.wikimedia.org");
  for (const src of ["javascript:void(0)", "data:image/png;base64,AA==", "http://images.example.com/a.png",
    "https://127.1/1.png", "https://[::1]/1.png", "https://files.local/1.png", "https://test.home.arpa/a.png",
    "https://user@images.example.com/a.png", "https://images.example.com:3100/a.png", "https://app.example.com/a.png",
    "/api/auth/key.png", "../file.png", "./notes.pdf", "./file.constructor"]) {
    assert.equal(resolveVisualImage(input(src), "/work", "qa", "app.example.com"), null, src);
  }
});
