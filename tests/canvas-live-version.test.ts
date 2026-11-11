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
test.skipIf(!browser || !chrome)("live nodes follow new versions unless viewing history", async () => {
  root = mkdtempSync(join(tmpdir(), "canvas-live-"));
  const dir = join(root, ".design", "drafts", "home", "draft");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "v1.html"), "<h1>First</h1>");
  server = Bun.spawn(["bun", join(import.meta.dir, "..", "skills/design-studio/scripts/canvas.ts"), "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader(); let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) { const next = await reader.read(); if (next.done) throw new Error("server exited"); output += new TextDecoder().decode(next.value); }
  await run("open", output.match(/http:\/\/127\.0\.0\.1:\d+\//)![0]);
  await run("wait", "--text", "draft");
  await until("document.querySelector('#status').textContent.includes('connected')");
  writeFileSync(join(dir, "v2.html"), "<h1>Second</h1>");
  await until("document.querySelector('select').value === '2'");
  expect(await evalJs("document.querySelector('article iframe').getAttribute('src')")).toContain("/v2.html");
  await run("select", "article select", "1");
  writeFileSync(join(dir, "v3.html"), "<h1>Third</h1>");
  await until("document.querySelector('select option[value=\"3\"]') !== null");
  expect(await evalJs("document.querySelector('select').value")).toBe("1");
  await run("select", "article select", "3");
  writeFileSync(join(dir, "v4.html"), "<h1>Fourth</h1>");
  await until("document.querySelector('select').value === '4'");
}, 60000);
