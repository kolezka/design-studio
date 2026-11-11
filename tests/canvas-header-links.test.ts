import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANVAS = process.env.CANVAS_SCRIPT || join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((path): path is string => !!path && existsSync(path));
const BROWSER = Bun.which("agent-browser");
const session = `canvas-header-${process.pid}`;
let server: ReturnType<typeof Bun.spawn> | undefined;
let root: string | undefined;

afterEach(async () => {
  if (BROWSER) Bun.spawnSync([BROWSER, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  if (server) { server.kill(); await server.exited; server = undefined; }
  if (root) { rmSync(root, { recursive: true, force: true }); root = undefined; }
});

async function browser(...args: string[]) {
  const process = Bun.spawn([BROWSER!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code !== 0) throw new Error(`agent-browser ${args[0]} failed: ${error} ${output}`);
  return output.trim();
}

async function evaluate(expression: string) {
  return JSON.parse(await browser("eval", "--json", expression)).data.result;
}

// The theme and size switches are links; unstyled they render as default blue underlined text.
test.skipIf(!CHROME || !BROWSER)("theme and size switches use canvas colours and mark the current choice", async () => {
  root = mkdtempSync(join(tmpdir(), "canvas-header-"));
  const dir = join(root, ".design", "drafts", "home", "base");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "v1.html"), "<h1>base</h1>");
  server = Bun.spawn(["bun", CANVAS, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader();
  let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`canvas exited: ${await new Response(server.stderr).text()}`);
    output += new TextDecoder().decode(value);
  }
  const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(output)![0];
  await browser("set", "viewport", "1600", "1000");

  for (const theme of ["light", "dark"]) {
    await browser("open", `${url}?theme=${theme}&w=1440&h=900&static=1`);
    await browser("wait", "--text", "Proposal graph");
    const links = await evaluate(`(() => { const ink = getComputedStyle(document.body).color; return ['light','dark','desktop','tablet','phone'].map(id => { const a = document.getElementById(id), s = getComputedStyle(a); return { id, current: a.getAttribute('aria-current'), color: s.color, background: s.backgroundColor, decoration: s.textDecorationLine, ink }; }); })()`);
    const current = links.filter((l: { current: string | null }) => l.current === "page").map((l: { id: string }) => l.id);
    expect(current).toEqual([theme, "desktop"]);
    for (const link of links) {
      expect(link.decoration).toBe("none");
      expect(link.color).not.toBe("rgb(0, 0, 238)");
      if (!link.current) expect(link.color).toBe(link.ink);
    }
    const idle = links.find((l: { current: string | null }) => !l.current)!;
    for (const id of current) expect(links.find((l: { id: string }) => l.id === id)!.background).not.toBe(idle.background);
  }
}, 60_000);
