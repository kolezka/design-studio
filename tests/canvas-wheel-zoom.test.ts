import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { renderCanvasPage } from "../src/server/page";

const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("google-chrome"), Bun.which("chromium")].find((path): path is string => !!path && existsSync(path));
const browser = Bun.which("agent-browser");
const session = `canvas-wheel-zoom-${process.pid}`;
const server = Bun.serve({ port: 0, fetch() { return new Response(renderCanvasPage({ projectName: "Test", root: "/tmp", theme: "light", width: 390, height: 844, targets: [] }), { headers: { "Content-Type": "text/html" } }); } });
afterAll(() => { if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" }); server.stop(); });
async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${args.join(" ")}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(js: string) { return JSON.parse(await run("eval", "--json", js)).data.result; }

test.skipIf(!chrome || !browser)("wheel zoom preserves the point under the pointer and leaves inspector scrolling alone", async () => {
  await run("set", "viewport", "1600", "1000");
  await run("open", `http://127.0.0.1:${server.port}/?static=1`);
  const result = await evaluate(`(() => {
    const canvas = document.querySelector('#canvas');
    const world = document.querySelector('#world');
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(rect.left + 300), y = Math.round(rect.top + 200);
    const point = () => { const m = new DOMMatrix(getComputedStyle(world).transform); return { x: (x - rect.left - canvas.clientLeft - m.e) / m.a, y: (y - rect.top - canvas.clientTop - m.f) / m.d, zoom: m.a }; };
    const before = point();
    const event = new WheelEvent('wheel', { deltaY: -120, clientX: x, clientY: y, bubbles: true, cancelable: true });
    canvas.dispatchEvent(event);
    const after = point();
    const small = new WheelEvent('wheel', { deltaY: 2, clientX: x, clientY: y, bubbles: true, cancelable: true });
    canvas.dispatchEvent(small);
    const touchpad = point();
    const inspector = document.querySelector('#inspector');
    const scroll = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    inspector.dispatchEvent(scroll);
    return { before, after, touchpad, canceled: event.defaultPrevented, inspectorCanceled: scroll.defaultPrevented, final: point() };
  })()`);
  expect(result.after.zoom).toBeGreaterThan(result.before.zoom);
  expect(result.after.x).toBeCloseTo(result.before.x, 3);
  expect(result.after.y).toBeCloseTo(result.before.y, 3);
  expect(result.touchpad.zoom).toBeLessThan(result.after.zoom);
  expect(result.canceled).toBe(true);
  expect(result.inspectorCanceled).toBe(false);
  expect(result.final.zoom).toBe(result.touchpad.zoom);
}, 60_000);
