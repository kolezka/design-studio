import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { renderCanvasPage } from "../src/server/page";
import { instrumentDraft } from "../src/server/instrument-draft";

const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("google-chrome"), Bun.which("chromium")].find((p): p is string => !!p && existsSync(p));
const browser = Bun.which("agent-browser");
const session = `canvas-selection-${process.pid}`;
const targets = [{ target: "home", drafts: [{ target: "home", id: "first", meta: { title: "first" }, metaError: null, versions: [1] }] }];
const draft = instrumentDraft(`<!doctype html><html><body><button id="action" style="position:absolute;top:20px;left:20px" onclick="this.textContent='Activated'">Original</button><div id="dynamic" style="position:absolute;top:80px;left:20px"></div><div id="host" style="position:absolute;top:140px;left:20px"></div><script>document.querySelector('#dynamic').innerHTML='<span>Dynamic content</span>';document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<button>Shadow content</button>';</script></body></html>`);
const server = Bun.serve({ port: 0, fetch(req) { return new Response(new URL(req.url).pathname === "/" ? renderCanvasPage({ projectName: "Test", root: "/tmp", theme: "light", width: 390, height: 844, targets }) : draft, { headers: { "Content-Type": "text/html" } }); } });
afterAll(() => { if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" }); server.stop(); });
async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${args[0]}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(js: string) { return JSON.parse(await run("eval", "--json", js)).data.result; }

test.skipIf(!chrome || !browser)("full preview selects dynamic and shadow elements and allows interaction", async () => {
  await run("set", "viewport", "1600", "1000");
  await run("open", `http://127.0.0.1:${server.port}/?static=1`);
  await run("find", "text", "Full preview", "click");
  await run("wait", "--fn", "document.querySelector('#dialog').open && document.querySelector('#dialogFrame').dataset.ready === document.querySelector('#dialogFrame').dataset.nonce");
  const point = async (y: number) => {
    const rect = await evaluate(`(() => { const r=document.querySelector('#dialogFrame').getBoundingClientRect(); return {x:r.left+40,y:r.top+${y}}; })()`);
    await run("mouse", "move", String(rect.x), String(rect.y));
  };
  await point(90);
  await run("mouse", "down");
  await run("mouse", "up");
  await run("wait", "--text", "Dynamic content");
  expect(await evaluate("document.querySelector('#selection').textContent")).toContain("Dynamic content");
  const separated = await evaluate(`(() => { const a=document.querySelector('#inspector').getBoundingClientRect(), b=document.querySelector('#dialogClose').getBoundingClientRect(); return a.top >= b.bottom; })()`);
  expect(separated).toBe(true);
  await point(150);
  await run("mouse", "down", "right");
  await run("mouse", "up", "right");
  await run("wait", "--text", "Shadow content");
  expect(await evaluate("document.querySelector('#selection').textContent")).toContain("::shadow");
  await run("click", "#dialogSelect");
  await point(30);
  await run("mouse", "down");
  await run("mouse", "up");
  await run("click", "#dialogSelect");
  await point(30);
  await run("mouse", "down");
  await run("mouse", "up");
  await run("wait", "--text", "Activated");
  expect(await evaluate("document.querySelector('#selection').textContent")).toContain("Activated");
}, 60_000);
