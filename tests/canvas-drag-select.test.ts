import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { renderCanvasPage } from "../src/server/page";
import { instrumentDraft } from "../src/server/instrument-draft";

const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((path): path is string => !!path && existsSync(path));
const browser = Bun.which("agent-browser");
const session = `canvas-drag-select-${process.pid}`;
const targets = [{ target: "home", drafts: [{ target: "home", id: "first", meta: { title: "First" }, metaError: null, versions: [1] }] }];
const button = (top: number, label: string) => `<button style="position:absolute;top:${top}px;left:20px;width:120px;height:30px">${label}</button>`;
const draft = instrumentDraft(`<!doctype html><html><body style="margin:0">${button(20, "Alpha")}${button(70, "Beta")}${button(200, "Gamma")}</body></html>`);
const server = Bun.serve({ port: 0, fetch(req) { return new Response(new URL(req.url).pathname === "/" ? renderCanvasPage({ projectName: "Test", root: "/tmp", theme: "light", width: 390, height: 844, targets }) : draft, { headers: { "Content-Type": "text/html" } }); } });
afterAll(() => { if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" }); server.stop(true); });
async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${args.join(" ")}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(js: string) { return JSON.parse(await run("eval", "--json", js)).data.result; }
async function openFullPreview() {
  await run("set", "viewport", "1600", "1000");
  await run("open", `http://127.0.0.1:${server.port}/?static=1`);
  await run("wait", "--text", "First");
  await run("find", "text", "Full preview", "click");
  await run("wait", "--fn", "document.querySelector('#dialog').open && document.querySelector('#dialogFrame').dataset.ready === document.querySelector('#dialogFrame').dataset.nonce");
  return origin();
}
// The frame moves when the inspector opens, so read its position before each gesture.
function origin() { return evaluate("(() => { const r = document.querySelector('#dialogFrame').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; })()"); }
async function drag(from: [number, number], to: [number, number]) {
  await run("mouse", "move", String(from[0]), String(from[1]));
  await run("mouse", "down");
  for (const t of [0.3, 0.7, 1]) await run("mouse", "move", String(Math.round(from[0] + (to[0] - from[0]) * t)), String(Math.round(from[1] + (to[1] - from[1]) * t)));
  await run("mouse", "up");
}

test.skipIf(!chrome || !browser)("dragging a box in the preview selects every element inside it", async () => {
  let o = await openFullPreview();
  // Box covers Alpha and Beta, not Gamma.
  await drag([o.x + 10, o.y + 10], [o.x + 160, o.y + 120]);
  await run("wait", "--fn", "document.querySelector('#request').value.includes('Selected elements:')");
  const request = await evaluate("document.querySelector('#request').value");
  expect(request).toContain("button:nth-of-type(1) (Alpha)");
  expect(request).toContain("button:nth-of-type(2) (Beta)");
  expect(request).not.toContain("Gamma");
  // The separator must survive pages without a UTF-8 charset declaration.
  expect(await evaluate("document.querySelector('#selection').textContent")).toBe("2 elements · Alpha · Beta");
  // The box overlay is removed after the drag.
  expect(await evaluate("document.querySelector('#dialogFrame').contentDocument")).toBeNull();
}, 45000);

test.skipIf(!chrome || !browser)("a drag around one element selects it and a plain click still selects", async () => {
  let o = await openFullPreview();
  await drag([o.x + 10, o.y + 190], [o.x + 160, o.y + 240]);
  await run("wait", "--fn", "document.querySelector('#request').value.includes('Selected text: Gamma')");
  expect(await evaluate("document.querySelector('#request').value")).not.toContain("Selected elements:");
  o = await origin();

  await run("mouse", "move", String(o.x + 60), String(o.y + 35));
  await run("mouse", "down");
  await run("mouse", "up");
  await run("wait", "--fn", "document.querySelector('#request').value.includes('Selected text: Alpha')");
}, 45000);

test.skipIf(!chrome || !browser)("a drag over empty space keeps the previous selection", async () => {
  let o = await openFullPreview();
  await run("mouse", "move", String(o.x + 60), String(o.y + 85));
  await run("mouse", "down");
  await run("mouse", "up");
  await run("wait", "--fn", "document.querySelector('#request').value.includes('Selected text: Beta')");
  o = await origin();
  await drag([o.x + 200, o.y + 400], [o.x + 350, o.y + 500]);
  await Bun.sleep(300);
  expect(await evaluate("document.querySelector('#request').value")).toContain("Selected text: Beta");
}, 45000);
