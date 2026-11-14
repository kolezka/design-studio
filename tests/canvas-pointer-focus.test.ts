import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { graphPage } from "../skills/design-studio/scripts/canvas-ui";
import { instrumentDraft } from "../skills/design-studio/scripts/canvas-bridge";

const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("google-chrome"), Bun.which("chromium")].find((path): path is string => !!path && existsSync(path));
const browser = Bun.which("agent-browser");
const session = `canvas-pointer-focus-${process.pid}`;
const targets = [{ target: "home", drafts: [{ target: "home", id: "first", meta: { title: "First" }, metaError: null, versions: [1] }] }];
const draft = instrumentDraft('<!doctype html><html><body><button style="position:absolute;top:20px;left:20px">Preview element</button><button>Second element</button></body></html>');
const server = Bun.serve({ port: 0, fetch(req) { return new Response(new URL(req.url).pathname === "/" ? graphPage("Test", "/tmp", "light", 390, 844, targets) : draft, { headers: { "Content-Type": "text/html" } }); } });
afterAll(() => { if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" }); server.stop(); });
async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${args.join(" ")}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(js: string) { return JSON.parse(await run("eval", "--json", js)).data.result; }

test.skipIf(!chrome || !browser)("pointer focus waits for click while keyboard focus selects", async () => {
  await run("set", "viewport", "1600", "1000");
  await run("open", `http://127.0.0.1:${server.port}/?static=1`);
  await run("find", "text", "Full preview", "click");
  await run("wait", "--fn", "document.querySelector('#dialog').open && document.querySelector('#dialogFrame').dataset.ready === document.querySelector('#dialogFrame').dataset.nonce");
  const point = await evaluate("(() => { const r = document.querySelector('#dialogFrame').getBoundingClientRect(); return { x: r.left + 40, y: r.top + 30 }; })()");
  await run("mouse", "move", String(point.x), String(point.y));
  await run("mouse", "down");
  expect(await evaluate("document.querySelector('#inspector').hidden")).toBe(true);
  await run("mouse", "up");
  await run("wait", "--fn", "document.querySelector('#selection').textContent.includes('Preview element')");
  expect(await evaluate("document.querySelector('#selection').textContent")).toContain("button:nth-of-type(1)");
  await run("press", "Tab");
  await run("wait", "--fn", "document.querySelector('#selection').textContent.includes('Second element')");
}, 60_000);
