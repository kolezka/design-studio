import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browser = Bun.which("agent-browser");
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("google-chrome"), Bun.which("chromium")].find(p => p && existsSync(p));
const session = `canvas-motion-${process.pid}`;
let root = "";
let server: ReturnType<typeof Bun.spawn> | undefined;

async function run(...args: string[]) {
  const process = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code) throw new Error(`agent-browser ${args[0]}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(expression: string) { return JSON.parse(await run("eval", "--json", expression)).data.result; }
async function until(expression: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await Bun.sleep(100); }
  throw new Error(`Timed out: ${expression}`);
}
afterEach(async () => {
  if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  if (server) { server.kill(); await server.exited; server = undefined; }
  if (root) { rmSync(root, { recursive: true, force: true }); root = ""; }
});
async function start(reduced = false) {
  root = mkdtempSync(join(tmpdir(), "canvas-motion-"));
  const dir = join(root, ".design", "drafts", "home", "draft");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "v1.html"), "<!doctype html><h1>Selected preview</h1>");
  writeFileSync(join(dir, "v2.html"), "<!doctype html><h1>Another version</h1>");
  server = Bun.spawn(["bun", join(import.meta.dir, "..", "bin", "design-studio"), "canvas", "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader(); let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const next = await reader.read();
    if (next.done) throw new Error(`canvas exited: ${await new Response(server.stderr).text()}`);
    output += new TextDecoder().decode(next.value);
  }
  await run("set", "viewport", "1600", "1000");
  if (reduced) await run("set", "media", "light", "reduced-motion");
  await run("open", output.match(/http:\/\/127\.0\.0\.1:\d+\//)![0]);
  await until("document.querySelector('#status').textContent.includes('connected') && document.querySelector('[data-node=\"home/draft/v2\"]') && document.querySelector('[data-target=\"home/draft/v2\"]')");
  await evaluate(`(() => {
    window.motionCalls = [];
    const original = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      const animation = original.call(this, frames, options);
      window.motionCalls.push({element: this, frames: animation.effect.getKeyframes(), duration: animation.effect.getTiming().duration});
      return animation;
    };
    return true;
  })()`);
  return dir;
}
const calls = `window.motionCalls.map(c => ({node: c.element.closest('[data-node]')?.dataset.node || null, source: c.element.dataset.source || null, target: c.element.dataset.target || null, frames: c.frames, duration: c.duration}))`;

test.skipIf(!browser || !chrome)("live nodes and edges animate once, not on fit or resize", async () => {
  const dir = await start();
  writeFileSync(join(dir, "v3.html"), "<!doctype html><h1>New version</h1>");
  await until(`document.querySelector('[data-node="home/draft/v3"]') && document.querySelector('[data-target="home/draft/v3"]') && window.motionCalls.length >= 2`);
  const observed = await evaluate(calls);
  expect(observed.filter((c: any) => c.node === "home/draft/v3")).toHaveLength(1);
  expect(observed.filter((c: any) => c.source === "home/draft/v2" && c.target === "home/draft/v3")).toHaveLength(1);
  expect(observed.some((c: any) => c.node === "home/draft/v1" || c.node === "home/draft/v2" || c.target === "home/draft/v2")).toBe(false);
  for (const call of observed) expect(call.duration).toBeGreaterThan(0);
  await evaluate("(window.motionCalls.length = 0, document.querySelector('#fit').click(), window.dispatchEvent(new Event('resize')), true)");
  await run("set", "viewport", "1400", "900");
  await Bun.sleep(700);
  expect(await evaluate(calls)).toEqual([]);
}, 60000);

test.skipIf(!browser || !chrome)("changed preview animates while unrelated updates preserve selection", async () => {
  const dir = await start();
  await evaluate(`(() => {
    const card = document.querySelector('[data-node="home/draft/v1"]');
    card.querySelector('button').click();
    const frame = card.querySelector('iframe');
    window.dispatchEvent(new MessageEvent('message', {origin:'null', source:frame.contentWindow, data:{type:'design-studio:selection', nonce:frame.dataset.nonce, selector:'h1', text:'Selected preview'}}));
    return true;
  })()`);
  await run("fill", "#description", "Keep this request");
  const snapshot = `(() => { const card=document.querySelector('[data-node="home/draft/v1"]'), frame=card.querySelector('iframe'); return { selected:card.classList.contains('selected'), selection:document.querySelector('#selection').textContent, request:document.querySelector('#request').value, description:document.querySelector('#description').value, src:frame.getAttribute('src'), nonce:frame.dataset.nonce }; })()`;
  const before = await evaluate(snapshot);
  expect(before.selection).toContain("Selected preview");
  writeFileSync(join(dir, "v2.html"), "<!doctype html><h1>Changed other version</h1>");
  await until(`window.motionCalls.some(c => c.element.closest('[data-node]')?.dataset.node === 'home/draft/v2')`);
  expect(await evaluate(snapshot)).toEqual(before);
  const update = (await evaluate(calls)).filter((c: any) => c.node === "home/draft/v2");
  expect(update.length).toBeGreaterThan(0);
  expect(update.some((c: any) => c.duration > 0 && c.frames.length > 1 && c.frames[0].opacity !== c.frames[c.frames.length - 1].opacity)).toBe(true);
  expect((await evaluate(calls)).some((c: any) => c.node === "home/draft/v1")).toBe(false);
}, 60000);

test.skipIf(!browser || !chrome)("reduced motion disables live node, edge and preview animations", async () => {
  const dir = await start(true);
  expect(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")).toBe(true);
  const nonce = await evaluate(`document.querySelector('[data-node="home/draft/v1"] iframe').dataset.nonce`);
  writeFileSync(join(dir, "v3.html"), "<!doctype html><h1>New version</h1>");
  await until(`document.querySelector('[data-node="home/draft/v3"]') && document.querySelector('[data-target="home/draft/v3"]')`);
  writeFileSync(join(dir, "v1.html"), "<!doctype html><h1>Updated version</h1>");
  await until(`document.querySelector('[data-node="home/draft/v1"] iframe').dataset.nonce !== ${JSON.stringify(nonce)}`);
  await Bun.sleep(700);
  expect(await evaluate(calls)).toEqual([]);
}, 60000);
