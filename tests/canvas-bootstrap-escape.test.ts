import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { renderCanvasPage } from "../src/server/page";

const project = "Project </script><script>globalThis.injected=true</script>\u2028\u2029 \\ $& $` $' $$";
const root = "Root </script><script>globalThis.injected=true</script>\u2029\u2028 \\ $& $` $' $$";
const html = renderCanvasPage({ projectName: project, root, theme: "light", width: 1440, height: 900, targets: [] });
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("google-chrome"), Bun.which("chromium")].find((p): p is string => !!p && existsSync(p));
const browser = Bun.which("agent-browser");
const session = `canvas-bootstrap-${process.pid}`;
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const control = new URL(req.url).pathname === "/control";
    return new Response(control ? "<!doctype html><script>globalThis.injected=true</script>" : html, { headers: { "Content-Type": "text/html" } });
  },
});
afterAll(() => {
  if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  server.stop();
});
async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`${args[0]}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(js: string) { return JSON.parse(await run("eval", "--json", js)).data.result; }

test("bootstrap data cannot terminate the inline script", () => {
  expect(html).not.toContain("</script><script>globalThis.injected");
  expect(html).toContain("\\u003c/script>");
  expect(html).toContain("\\u2028\\u2029");
});

test.skipIf(!chrome || !browser)("hostile bootstrap data round trips without executing injected scripts", async () => {
  const base = `http://127.0.0.1:${server.port}`;
  await run("open", `${base}/control`);
  expect(await evaluate("globalThis.injected === true")).toBe(true);
  await run("open", `${base}/?static=1`);
  const result = await evaluate(`(() => ({ project: document.querySelector('#project').textContent, root: document.querySelector('#project').title, sideProject: document.querySelector('#sideProject').textContent, injected: globalThis.injected === true }))()`);
  expect(result).toEqual({ project, root, sideProject: project, injected: false });
}, 60_000);
