import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANVAS = join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((p): p is string => !!p && existsSync(p));
const BROWSER = Bun.which("agent-browser");
const session = `canvas-keyboard-${process.pid}`;
let root = "";
let server: ReturnType<typeof Bun.spawn> | undefined;

afterEach(async () => {
  if (BROWSER) Bun.spawnSync([BROWSER, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  if (server) { server.kill(); await server.exited; server = undefined; }
  if (root) rmSync(root, { recursive: true, force: true });
});

async function browser(...args: string[]) {
  const process = Bun.spawn([BROWSER!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code) throw new Error(`agent-browser ${args[0]} failed: ${err} ${out}`);
  return out.trim();
}

async function evaluate(expression: string) {
  return JSON.parse(await browser("eval", "--json", expression)).data.result;
}

test.skipIf(!CHROME || !BROWSER)("keyboard selection reaches a nonfocusable heading in a sandboxed preview", async () => {
  root = mkdtempSync(join(tmpdir(), "canvas-keyboard-"));
  const dir = join(root, ".design", "drafts", "home", "variant");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "v1.html"), "<!doctype html><html><body><main><h1>Keyboard target heading</h1><p>Supporting text</p></main></body></html>");
  server = Bun.spawn(["bun", CANVAS, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader();
  let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`canvas exited: ${await new Response(server.stderr).text()}`);
    output += new TextDecoder().decode(value);
  }
  const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(output)![0];
  await browser("open", `${url}?static=1`);
  await browser("wait", "--text", "variant");
  expect(await evaluate(`document.querySelector('article iframe').getAttribute('sandbox')`)).toBe("allow-scripts");
  await browser("focus", "article button");
  await browser("press", "Enter");
  await browser("focus", "article iframe");
  await browser("press", "ArrowDown");
  await browser("press", "ArrowDown");
  await browser("wait", "--text", "Keyboard target heading");
  const request = await evaluate(`document.querySelector('#request').value`);
  expect(request).toContain("home/variant (v1)");
  expect(request).toContain("h1:nth-of-type(1)");
  expect(request).toContain("Keyboard target heading");
}, 60_000);
