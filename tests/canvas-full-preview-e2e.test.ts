import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { graphPage } from "../skills/design-studio/scripts/canvas-ui";
import { instrumentDraft } from "../skills/design-studio/scripts/canvas-bridge";

const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((path): path is string => !!path && existsSync(path));
const browser = Bun.which("agent-browser");
const session = `canvas-full-preview-e2e-${process.pid}`;
const targets = [{ target: "home", drafts: [{ target: "home", id: "first", meta: { title: "First" }, metaError: null, versions: [1] }] }];
// The image stalls, so the iframe load event stays pending while the test runs.
const draft = instrumentDraft(`<!doctype html><html><body><button style="position:absolute;top:20px;left:20px" onclick="this.textContent='Activated'">Slow draft</button><img src="/slow.png" style="position:absolute;top:200px;left:20px;width:10px;height:10px"></body></html>`);
const server = Bun.serve({
  port: 0,
  idleTimeout: 30,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/slow.png") { await Bun.sleep(15000); return new Response("", { headers: { "Content-Type": "image/png" } }); }
    return new Response(path === "/" ? graphPage("Test", "/tmp", "light", 390, 844, targets) : draft, { headers: { "Content-Type": "text/html" } });
  },
});
afterAll(() => { if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" }); server.stop(true); });
async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${args.join(" ")}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(js: string) { return JSON.parse(await run("eval", "--json", js)).data.result; }
async function openCanvas(width: number, height: number) {
  await run("set", "viewport", String(width), String(height));
  await run("open", `http://127.0.0.1:${server.port}/?static=1`);
  await run("wait", "--text", "First");
  await run("eval", "window.__draftLoads = 0; document.querySelector('#dialogFrame').addEventListener('load', (e) => { if (e.target.src.includes('ds_nonce')) window.__draftLoads++; })");
}
async function openFullPreview() {
  await run("find", "text", "Full preview", "click");
  await run("wait", "--fn", "document.querySelector('#dialog').open && document.querySelector('#dialogFrame').dataset.ready === document.querySelector('#dialogFrame').dataset.nonce");
}
async function clickPreview() {
  const p = await evaluate("(() => { const r = document.querySelector('#dialogFrame').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + 30) }; })()");
  await run("mouse", "move", String(p.x), String(p.y));
  await run("mouse", "down");
  await run("mouse", "up");
}

test.skipIf(!chrome || !browser)("full preview selects an element on the first click, before slow assets load", async () => {
  await openCanvas(1600, 1000);
  await openFullPreview();
  expect(await evaluate("window.__draftLoads")).toBe(0);
  await clickPreview();
  await run("wait", "--fn", "!document.querySelector('#inspector').hidden && document.querySelector('#selection').textContent.includes('Slow draft')");
  expect(await evaluate("document.querySelector('#request').value")).toContain("Slow draft");
}, 30000);

test.skipIf(!chrome || !browser)("full preview selects again after reopening and passes clicks through in interact mode", async () => {
  await openCanvas(390, 844);
  await openFullPreview();
  await run("eval", "document.querySelector('#dialogClose').click()");
  expect(await evaluate("document.querySelector('#dialog').open")).toBe(false);

  await openFullPreview();
  await clickPreview();
  await run("wait", "--fn", "!document.querySelector('#inspector').hidden && document.querySelector('#selection').textContent.includes('Slow draft')");

  // Close and reopen in one task: the queued close event must not blank the new preview.
  await run("eval", "document.querySelector('#dialog').close(); [...document.querySelectorAll('button')].find(b => b.textContent === 'Full preview').click(); true");
  await run("wait", "--fn", "document.querySelector('#dialog').open && document.querySelector('#dialogFrame').dataset.ready === document.querySelector('#dialogFrame').dataset.nonce");
  expect(await evaluate("document.querySelector('#dialogFrame').src")).toContain("ds_nonce");
  expect(await evaluate("!!document.querySelector('#dialog #inspector')")).toBe(true);
  await clickPreview();
  await run("wait", "--fn", "!document.querySelector('#inspector').hidden && document.querySelector('#selection').textContent.includes('Slow draft')");

  // With selection off, the click reaches the draft's own handler.
  await run("eval", "document.querySelector('#dialogSelect').click()");
  expect(await evaluate("document.querySelector('#dialogSelect').getAttribute('aria-pressed')")).toBe("false");
  await clickPreview();
  await run("eval", "document.querySelector('#dialogSelect').click()");
  await clickPreview();
  await run("wait", "--fn", "document.querySelector('#selection').textContent.includes('Activated')");
}, 45000);
