import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const canvas = join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const processes: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const process of processes.splice(0)) { process.kill(); await process.exited; }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function start(root: string) {
  const process = Bun.spawn(["bun", canvas, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  processes.push(process);
  const reader = process.stdout.getReader();
  let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+/.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(await new Response(process.stderr).text());
    output += new TextDecoder().decode(value);
  }
  return /http:\/\/127\.0\.0\.1:\d+/.exec(output)![0];
}

test("rejects symlinked directories and non-regular metadata and versions without blocking", async () => {
  const root = mkdtempSync(join(tmpdir(), "canvas-files-"));
  roots.push(root);
  const drafts = join(root, ".design", "drafts");
  const good = join(drafts, "home", "good");
  const external = join(root, "outside");
  mkdirSync(good, { recursive: true });
  mkdirSync(join(external, "draft"), { recursive: true });
  writeFileSync(join(good, "v1.html"), "safe content");
  writeFileSync(join(external, "draft", "v1.html"), "secret content");
  symlinkSync(external, join(drafts, "linked-target"));
  symlinkSync(join(external, "draft"), join(drafts, "home", "linked-draft"));
  symlinkSync(join(external, "draft", "v1.html"), join(good, "v2.html"));
  symlinkSync(join(external, "draft", "v1.html"), join(good, "meta.json"));
  const result = spawnSync("mkfifo", [join(good, "v3.html")]);
  expect(result.status).toBe(0);
  const base = await start(root);
  const response = await fetch(`${base}/api/drafts`, { signal: AbortSignal.timeout(3000) });
  expect(response.status).toBe(200);
  const { targets } = await response.json();
  expect(targets.map((target: { target: string }) => target.target)).toEqual(["home"]);
  expect(targets[0].drafts.map((draft: { id: string }) => draft.id)).toEqual(["good"]);
  expect(targets[0].drafts[0].versions).toEqual([1]);
  expect(targets[0].drafts[0].metaError).toBeTruthy();
  for (const path of ["/d/linked-target/draft/v1.html", "/d/home/linked-draft/v1.html", "/d/home/good/v2.html", "/d/home/good/v3.html"]) {
    expect((await fetch(base + path, { signal: AbortSignal.timeout(3000) })).status).toBe(404);
  }
  expect(await (await fetch(`${base}/d/home/good/v1.html`)).text()).toContain("safe content");
});

test("a FIFO metadata file does not block other drafts", async () => {
  const root = mkdtempSync(join(tmpdir(), "canvas-files-"));
  roots.push(root);
  const dir = join(root, ".design", "drafts", "home", "draft");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "v1.html"), "safe");
  expect(spawnSync("mkfifo", [join(dir, "meta.json")]).status).toBe(0);
  const response = await fetch(`${await start(root)}/api/drafts`, { signal: AbortSignal.timeout(3000) });
  const { targets } = await response.json();
  expect(targets[0].drafts[0].metaError).toBeTruthy();
});
