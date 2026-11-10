import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { POST } = await jiti.import("./route.ts");
const { projectIdentityKey } = await jiti.import("../../../../lib/project-identity.ts");

test("a folder picked by the OS keeps spaces that are part of its name", { skip: process.platform === "win32" }, async (t) => {
  const base = await mkdtemp(path.join(os.tmpdir(), "pi-web-cwd-literal-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const cwd = path.join(base, "project with a trailing space ");
  await mkdir(cwd);

  const validate = (body) => POST(new Request("http://localhost/api/cwd/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  const selected = await validate({ cwd, literal: true });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).cwd, cwd);
  assert.equal((await validate({ cwd })).status, 400);
  assert.equal((await validate({ cwd: "relative/project", literal: true })).status, 400);
});

test("validated cwd responses include server-resolved project identity", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "pi-web-cwd-validate-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const response = await POST(new Request("http://localhost/api/cwd/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd }),
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    cwd,
    projectRoot: cwd,
    projectKey: projectIdentityKey(cwd),
  });
});
