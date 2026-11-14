import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const canvas = join(import.meta.dir, "..", "bin", "design-studio");
const processes: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const process of processes.splice(0)) { process.kill(); await process.exited; }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function start(root: string) {
  const process = Bun.spawn(["bun", canvas, "canvas", "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
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
  expect(Object.keys(targets[0].drafts[0].versionHashes)).toEqual(["1"]);
  expect(typeof targets[0].drafts[0].versionHashes["1"]).toBe("string");
  expect(targets[0].drafts[0].metaError).toBeTruthy();
  for (const path of ["/d/linked-target/draft/v1.html", "/d/home/linked-draft/v1.html", "/d/home/good/v2.html", "/d/home/good/v3.html"]) {
    expect((await fetch(base + path, { signal: AbortSignal.timeout(3000) })).status).toBe(404);
  }
  expect(await (await fetch(`${base}/d/home/good/v1.html`)).text()).toContain("safe content");
});

test("version fingerprints stay stable and change on same-size file replacements", async () => {
  const root = mkdtempSync(join(tmpdir(), "canvas-files-"));
  roots.push(root);
  const dir = join(root, ".design", "drafts", "home", "draft");
  mkdirSync(dir, { recursive: true });
  const version = join(dir, "v1.html");
  writeFileSync(version, "original");
  const base = await start(root);
  const fingerprint = async () => {
    const response = await fetch(`${base}/api/drafts`, { signal: AbortSignal.timeout(3000) });
    expect(response.status).toBe(200);
    const { targets } = await response.json();
    const draft = targets[0].drafts[0];
    expect(draft.versions).toEqual([1]);
    expect(typeof draft.versionHashes["1"]).toBe("string");
    expect(draft.versionHashes["1"].length).toBeGreaterThan(0);
    return draft.versionHashes["1"] as string;
  };

  const initial = await fingerprint();
  expect(await fingerprint()).toBe(initial);
  const originalTime = statSync(version).mtime;
  writeFileSync(version, "modified");
  utimesSync(version, originalTime, originalTime);
  expect(statSync(version).size).toBe(8);
  const overwritten = await fingerprint();
  expect(overwritten).not.toBe(initial);
  expect(await fingerprint()).toBe(overwritten);

  const replacement = join(dir, "replacement.tmp");
  writeFileSync(replacement, "replaced");
  utimesSync(replacement, originalTime, originalTime);
  renameSync(replacement, version);
  expect(statSync(version).size).toBe(8);
  const renamed = await fingerprint();
  expect(renamed).not.toBe(overwritten);
  expect(await fingerprint()).toBe(renamed);
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
