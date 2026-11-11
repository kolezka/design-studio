import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANVAS = join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((p): p is string => !!p && existsSync(p));
const BROWSER = Bun.which("agent-browser");
const session = `canvas-race-${process.pid}`;
let root = "";
let server: ReturnType<typeof Bun.spawn> | undefined;

afterEach(async () => {
  if (BROWSER) Bun.spawnSync([BROWSER, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  if (server) { server.kill(); await server.exited; server = undefined; }
  if (root) rmSync(root, { recursive: true, force: true });
});

async function browser(...args: string[]) {
  const p = Bun.spawn([BROWSER!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(`agent-browser ${args[0]} failed: ${err} ${out}`);
  return out.trim();
}
async function evaluate(expression: string) {
  return JSON.parse(await browser("eval", "--json", expression)).data.result;
}
async function waitFor(expression: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

test.skipIf(!CHROME || !BROWSER)("ignores stale document selection messages after version navigation", async () => {
  root = mkdtempSync(join(tmpdir(), "canvas-race-"));
  const dir = join(root, ".design", "drafts", "home", "variant");
  mkdirSync(dir, { recursive: true });
  const fixture = (version: number) => `<!doctype html><body><h1>Version ${version}</h1><script>
    addEventListener('message', event => {
      if (event.source !== parent || !event.data || event.data.test !== 'send') return;
      parent.postMessage({type:'design-studio:selection', context:true, nonce:event.data.nonce, selector:'h1', text:event.data.text}, '*');
    });
    parent.postMessage({test:'ready', version:${version}}, '*');
  </script></body>`;
  writeFileSync(join(dir, "v1.html"), fixture(1));
  writeFileSync(join(dir, "v2.html"), fixture(2));
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
  await evaluate(`window.raceMessages = []; window.addEventListener('message', e => { if (e.source === document.querySelector('#dialogFrame').contentWindow) window.raceMessages.push({ origin:e.origin, data:e.data }); }); true`);
  await evaluate(`document.querySelector('article[data-node="home/variant/v2"] .node-footer button:nth-of-type(2)').click(); true`);
  await waitFor(`window.raceMessages.some(m => m.data.test === 'ready' && m.data.version === 2)`);
  const oldNonce = await evaluate(`document.querySelector('#dialogFrame').dataset.nonce`);
  expect(oldNonce).toBeTruthy();
  await evaluate(`document.querySelector('#dialog').close(); true`);
  await waitFor(`!document.querySelector('#dialog').open`);
  await evaluate(`document.querySelector('article[data-node="home/variant/v1"] .node-footer button:nth-of-type(2)').click(); true`);
  await waitFor(`window.raceMessages.some(m => m.data.test === 'ready' && m.data.version === 1)`);
  const currentNonce = await evaluate(`document.querySelector('#dialogFrame').dataset.nonce`);
  expect(currentNonce).toBeTruthy();
  expect(currentNonce).not.toBe(oldNonce);
  await evaluate(`document.querySelector('#dialogFrame').contentWindow.postMessage({test:'send', nonce:${JSON.stringify(oldNonce)}, text:'STALE VERSION'}, '*'); true`);
  await waitFor(`window.raceMessages.some(m => m.data.text === 'STALE VERSION')`);
  const stale = await evaluate(`window.raceMessages.find(m => m.data.text === 'STALE VERSION')`);
  expect(stale.origin).toBe("null");
  expect(await evaluate(`document.querySelector('#request').value`)).not.toContain("STALE VERSION");
  expect(await evaluate(`document.querySelector('#inspector').hidden`)).toBe(true);
  await evaluate(`document.querySelector('#dialogFrame').contentWindow.postMessage({test:'send', nonce:${JSON.stringify(currentNonce)}, text:'CURRENT VERSION'}, '*'); true`);
  await waitFor(`document.querySelector('#request').value.includes('CURRENT VERSION')`);
  const current = await evaluate(`window.raceMessages.find(m => m.data.text === 'CURRENT VERSION')`);
  expect(current.origin).toBe("null");
  expect(await evaluate(`document.querySelector('#request').value`)).toContain("home/variant (v1)");
  expect(await evaluate(`document.querySelector('#inspector').hidden`)).toBe(false);
}, 60_000);
