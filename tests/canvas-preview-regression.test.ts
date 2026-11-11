import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { graphPage } from "../skills/design-studio/scripts/canvas-ui";
import { instrumentDraft } from "../skills/design-studio/scripts/canvas-bridge";

const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((p): p is string => !!p && existsSync(p));
const browser = Bun.which("agent-browser");
const session = `canvas-preview-regression-${process.pid}`;
const targets = [{ target: "home", drafts: ["first", "second"].map(id => ({ target: "home", id, meta: { title: id }, metaError: null, versions: [0, 1] })) }];
const server = Bun.serve({ port: 0, fetch(req) { const url = new URL(req.url); return new Response(url.pathname === "/" ? graphPage("Test", "/tmp", "light", Number(url.searchParams.get("w")) || 390, Number(url.searchParams.get("h")) || 844, targets) : instrumentDraft("<!doctype html><h1>Preview</h1>"), { headers: { "Content-Type": "text/html" } }); } });
afterAll(() => { if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" }); server.stop(); });
async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${args[0]}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(js: string) { return JSON.parse(await run("eval", "--json", js)).data.result; }

test.skipIf(!chrome || !browser)("preview keeps device dimensions and requests do not cross drafts", async () => {
  await run("set", "viewport", "1600", "1000");
  await run("open", `http://127.0.0.1:${server.port}/?static=1`);
  await run("wait", "--text", "first");
  const click = (id: string, index: number) => evaluate(`([...document.querySelectorAll('article')].find(c => c.querySelector('.node-title').textContent === '${id}').querySelectorAll('button')[${index}].click(), true)`);
  await run("select", '[aria-label="Version for first"]', "0");
  await click("first", 0);
  expect(await evaluate("document.querySelector('#request').value")).toContain("home/first (v0)");
  await run("fill", "#description", "Make it blue");
  await click("first", 0);
  expect(await evaluate("document.querySelector('#description').value")).toBe("Make it blue");
  await click("second", 0);
  expect(await evaluate("document.querySelector('#description').value")).toBe("");
  await run("fill", "#description", "Second draft change");
  await click("first", 1);
  expect(await evaluate("document.querySelector('#description').value")).toBe("");
  const size = await evaluate(`(() => { const f = document.querySelector('#dialogFrame'); return [f.clientWidth, f.clientHeight]; })()`);
  expect(size).toEqual([390, 844]);
  await run("fill", "#description", "Full preview change");
  await evaluate("(document.querySelector('#dialog').close(), true)");
  await evaluate(`(() => { const f = [...document.querySelectorAll('article')].find(c => c.querySelector('.node-title').textContent === 'second').querySelector('iframe'); window.dispatchEvent(new MessageEvent('message', { origin: 'null', source: f.contentWindow, data: { type: 'design-studio:selection', nonce: f.dataset.nonce, selector: 'h1', text: 'Preview', context: true } })); return true; })()`);
  expect(await evaluate("document.querySelector('#description').value")).toBe("");
}, 60_000);


test.skipIf(!chrome || !browser)("full preview keeps selection editor separate at desktop and phone widths", async () => {
  for (const [width, height, frameWidth, frameHeight] of [[1600, 1000, 1440, 900], [390, 844, 390, 844]]) {
    await run("set", "viewport", String(width), String(height));
    await run("open", `http://127.0.0.1:${server.port}/?static=1&w=${frameWidth}&h=${frameHeight}`);
    await run("wait", "--text", "first");
    await evaluate("(document.querySelector('article .node-footer button:nth-of-type(2)').click(), true)");
    await run("wait", "--load", "networkidle");
    const point = await evaluate("(() => { const r = document.querySelector('#dialogFrame').getBoundingClientRect(); return [r.left + 30, r.top + 30]; })()");
    await run("mouse", "move", String(point[0]), String(point[1]));
    await run("mouse", "down");
    await run("mouse", "up");
    await run("wait", "--fn", "document.querySelector('#selection').textContent.includes('Preview')");
    const result = await evaluate(`(() => {
      const f = document.querySelector('#dialogFrame'), i = document.querySelector('#inspector'), v = document.querySelector('.dialog-viewport');
      const a = f.getBoundingClientRect(), b = i.getBoundingClientRect(), c = v.getBoundingClientRect();
      const visible = { left: Math.max(a.left, c.left), right: Math.min(a.right, c.right), top: Math.max(a.top, c.top), bottom: Math.min(a.bottom, c.bottom) };
      v.scrollLeft = v.scrollWidth; v.scrollTop = v.scrollHeight;
      return { size: [f.clientWidth, f.clientHeight], overlap: visible.left < b.right && b.left < visible.right && visible.top < b.bottom && b.top < visible.bottom, viewportOverlap: c.left < b.right && b.left < c.right && c.top < b.bottom && b.top < c.bottom, reachesRight: v.scrollLeft + v.clientWidth >= f.offsetLeft + f.offsetWidth - v.offsetLeft, reachesBottom: v.scrollTop + v.clientHeight >= f.offsetTop + f.offsetHeight - v.offsetTop };
    })()`);
    expect(result.size).toEqual([frameWidth, frameHeight]);
    expect(result.overlap).toBe(false);
    expect(result.viewportOverlap).toBe(false);
    expect(result.reachesRight).toBe(true);
    expect(result.reachesBottom).toBe(true);
  }
}, 60_000);
