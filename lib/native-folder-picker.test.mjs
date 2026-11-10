import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const { canPickNativeFolder, createNativeFolderPicker } = await createJiti(import.meta.url).import("./native-folder-picker.ts");

function request(overrides = {}) {
  return new Request("http://127.0.0.1:30141/api/cwd/pick-native", {
    method: "POST",
    headers: {
      host: "127.0.0.1:30141",
      origin: "http://127.0.0.1:30141",
      "sec-fetch-site": "same-origin",
      "x-forwarded-for": "127.0.0.1",
      ...overrides,
    },
  });
}

test("the desktop picker is local to a loopback-bound macOS server", () => {
  assert.equal(canPickNativeFolder(request(), "darwin", "127.0.0.1"), true);
  assert.equal(canPickNativeFolder(request({ "x-forwarded-for": "::ffff:127.0.0.1" }), "darwin", "localhost"), true);
  assert.equal(canPickNativeFolder(request(), "linux", "127.0.0.1"), false);
  // A forged local Host and forwarded IP cannot override a LAN bind.
  assert.equal(canPickNativeFolder(request(), "darwin", "0.0.0.0"), false);
  for (const headers of [
    { host: "192.168.1.20:30141" },
    { origin: "http://127.0.0.1:30142" },
    { "sec-fetch-site": "same-site" },
    { "x-forwarded-for": "192.168.1.20" },
    { "x-forwarded-for": "192.168.1.20, 127.0.0.1" },
    { "x-forwarded-host": "remote.example" },
    { forwarded: "for=192.168.1.20" },
  ]) {
    assert.equal(canPickNativeFolder(request(headers), "darwin", "127.0.0.1"), false, JSON.stringify(headers));
  }
});

test("a second click cannot start another panel and the next pick works after cancellation", async () => {
  const panel = Promise.withResolvers();
  let calls = 0;
  const choose = createNativeFolderPicker(async () => ++calls === 1 ? panel.promise : "/tmp/quoted \"folder\" /\n");
  const signal = new AbortController().signal;
  const first = choose({ signal });
  assert.deepEqual(await choose({ signal }), { kind: "busy" });
  panel.resolve("\n");
  assert.deepEqual(await first, { kind: "cancelled" });
  assert.deepEqual(await choose({ signal }), { kind: "selected", cwd: '/tmp/quoted "folder" ' });
  assert.equal(calls, 2);
});

test("an aborted caller does not start a picker or receive a selected path", async () => {
  const controller = new AbortController();
  let opened = 0;
  const choose = createNativeFolderPicker(async () => {
    opened++;
    controller.abort();
    return "/tmp/project/\n";
  });
  assert.deepEqual(await choose({ signal: controller.signal }), { kind: "cancelled" });
  assert.deepEqual(await choose({ signal: controller.signal }), { kind: "cancelled" });
  assert.equal(opened, 1);
});

test("a failed native process frees the slot for a retry", async () => {
  let failed = false;
  const choose = createNativeFolderPicker(async () => {
    if (!failed) {
      failed = true;
      throw new Error("no GUI session");
    }
    return "/\n";
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await choose({ signal }), { kind: "unavailable" });
  assert.deepEqual(await choose({ signal }), { kind: "selected", cwd: "/" });
});
