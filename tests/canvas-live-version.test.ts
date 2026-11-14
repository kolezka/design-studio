import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browser = Bun.which("agent-browser");
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("chromium")].find(p => p && existsSync(p));
const session = `canvas-live-${process.pid}`;
let root = "";
let server: ReturnType<typeof Bun.spawn> | undefined;
async function run(...args: string[]) {
  const p = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(err + out);
  return out.trim();
}
async function evalJs(expression: string) { return JSON.parse(await run("eval", "--json", expression)).data.result; }
async function until(expression: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evalJs(expression)) return; await Bun.sleep(100); }
  throw new Error(`Timed out: ${expression}`);
}
afterEach(async () => {
  if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  if (server) { server.kill(); await server.exited; server = undefined; }
  if (root) rmSync(root, { recursive: true, force: true });
});
test.skipIf(!browser || !chrome)("live updates add version nodes without replacing history", async () => {
  root = mkdtempSync(join(tmpdir(), "canvas-live-"));
  const dir = join(root, ".design", "drafts", "home", "draft");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "v1.html"), "<h1>First</h1>");
  server = Bun.spawn(["bun", join(import.meta.dir, "..", "bin", "design-studio"), "canvas", "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader(); let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) { const next = await reader.read(); if (next.done) throw new Error("server exited"); output += new TextDecoder().decode(next.value); }
  await run("open", output.match(/http:\/\/127\.0\.0\.1:\d+\//)![0]);
  await run("wait", "--text", "draft");
  await until("document.querySelector('#status').textContent.includes('connected')");
  writeFileSync(join(dir, "v2.html"), "<h1>Second</h1>");
  await until(`document.querySelector('article[data-node="home/draft/v2"] iframe') !== null`);
  expect(await evalJs(`document.querySelector('article[data-node="home/draft/v1"] iframe').getAttribute('src')`)).toContain("/v1.html");
  expect(await evalJs(`document.querySelector('article[data-node="home/draft/v2"] iframe').getAttribute('src')`)).toContain("/v2.html");
  writeFileSync(join(dir, "v3.html"), "<h1>Third</h1>");
  await until(`document.querySelector('article[data-node="home/draft/v3"] iframe') !== null`);
  expect(await evalJs(`document.querySelectorAll('article[data-node^="home/draft/v"]').length`)).toBe(3);
  expect(await evalJs(`document.querySelector('article[data-node="home/draft/v1"] iframe').getAttribute('src')`)).toContain("/v1.html");
  expect(await evalJs(`document.querySelector('article[data-node="home/draft/v3"] iframe').getAttribute('src')`)).toContain("/v3.html");
}, 60000);

test.skipIf(!browser || !chrome)("live version updates preserve the selected preview until its file changes", async () => {
  root = mkdtempSync(join(tmpdir(), "canvas-live-selection-"));
  const dir = join(root, ".design", "drafts", "home", "draft");
  mkdirSync(dir, { recursive: true });
  const selectedFile = join(dir, "v1.html");
  writeFileSync(selectedFile, "<!doctype html><h1>Selected preview element</h1>");
  server = Bun.spawn(["bun", join(import.meta.dir, "..", "bin", "design-studio"), "canvas", "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader(); let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) { const next = await reader.read(); if (next.done) throw new Error("server exited"); output += new TextDecoder().decode(next.value); }
  await run("set", "viewport", "1600", "1000");
  await run("open", output.match(/http:\/\/127\.0\.0\.1:\d+\//)![0]);
  await until("document.querySelector('#status').textContent.includes('connected')");
  await evalJs(`(Array.from(document.querySelector('article .node-footer').querySelectorAll('button')).find(b => b.textContent === 'Full preview').click(), true)`);
  await until("document.querySelector('#dialog').open && document.querySelector('#dialogFrame').dataset.ready === document.querySelector('#dialogFrame').dataset.nonce");
  await run("wait", "--load", "networkidle");
  const point = await evalJs("(() => { const r = document.querySelector('#dialogFrame').getBoundingClientRect(); return [r.left + 30, r.top + 30]; })()");
  await run("mouse", "move", String(point[0]), String(point[1]));
  await run("mouse", "down");
  await run("mouse", "up");
  await until("document.querySelector('#selection').textContent.includes('Selected preview element')");
  await run("fill", "#description", "Change this heading");
  const snapshot = `(() => { const f = document.querySelector('#dialogFrame'), c = document.querySelector('article iframe'), v = document.querySelector('.dialog-viewport'); return { open: document.querySelector('#dialog').open, selection: document.querySelector('#selection').textContent, request: document.querySelector('#request').value, description: document.querySelector('#description').value, nonce: f.dataset.nonce, src: f.getAttribute('src'), cardNonce: c.dataset.nonce, cardSrc: c.getAttribute('src'), transform: document.querySelector('#world').style.transform, scroll: [v.scrollLeft, v.scrollTop] }; })()`;
  const before = await evalJs(snapshot);
  expect(before.request).toContain("Selected preview element");
  writeFileSync(join(dir, "v2.html"), "<!doctype html><h1>Another version</h1>");
  await until(`document.querySelector('article[data-node="home/draft/v2"] iframe, article select option[value="2"]') !== null`);
  expect(await evalJs(snapshot)).toEqual(before);
  writeFileSync(selectedFile, "<!doctype html><h1>Updated preview element</h1>");
  await until(`document.querySelector('#dialogFrame').dataset.nonce !== ${JSON.stringify(before.nonce)}`);
  const after = await evalJs(snapshot);
  expect(after.open).toBe(true);
  expect(after.nonce).not.toBe(before.nonce);
  expect(after.cardNonce).not.toBe(before.cardNonce);
  expect(after.selection).not.toContain("Selected preview element");
  expect(after.request).not.toContain("Selected preview element");
  expect(after.description).toBe("Change this heading");
  expect(after.transform).toBe(before.transform);
}, 60000);
