import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANVAS = process.env.CANVAS_SCRIPT || join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((path): path is string => !!path && existsSync(path));
const BROWSER = Bun.which("agent-browser");
const session = `canvas-layout-${process.pid}`;
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

test.skipIf(!CHROME || !BROWSER)("phone previews with long metadata do not overlap and Fit contains every node", async () => {
  root = mkdtempSync(join(tmpdir(), "canvas-layout-"));
  for (const [id, meta] of [
    ["base", { title: "Base", notes: "Long metadata ".repeat(55) }],
    ["sibling", { title: "Sibling", direction: "Another long direction ".repeat(35) }],
    ["child", { title: "Child", parent: "base", notes: "Child metadata ".repeat(30) }],
  ] as const) {
    const dir = join(root, ".design", "drafts", "home", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
    writeFileSync(join(dir, "v1.html"), `<h1>${id}</h1>`);
  }
  server = Bun.spawn(["bun", CANVAS, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader();
  let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`canvas exited: ${await new Response(server.stderr).text()}`);
    output += new TextDecoder().decode(value);
  }
  await browser("set", "viewport", "1600", "1000");
  await browser("open", `${/http:\/\/127\.0\.0\.1:\d+\//.exec(output)![0]}?static=1`);
  await browser("click", "#phone");
  await browser("wait", "--text", "Sibling");
  expect(await evaluate(`document.querySelector('#phone').getAttribute('aria-current')`)).toBe("page");
  await browser("wait", "--fn", `document.querySelectorAll('article').length === 3`);
  await browser("click", "#fit");
  const result = await evaluate(`(() => {
    const canvas = document.querySelector('#canvas').getBoundingClientRect();
    const cards = [...document.querySelectorAll('article')].map(card => {
      const r = card.getBoundingClientRect();
      return { title: card.querySelector('.node-title').textContent, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    return { canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom }, cards };
  })()`);
  expect(result.cards).toHaveLength(3);
  const base = result.cards.find((card: { title: string }) => card.title === "Base");
  const sibling = result.cards.find((card: { title: string }) => card.title === "Sibling");
  expect(Math.abs(base.left - sibling.left)).toBeLessThan(1);
  expect(base.bottom <= sibling.top || sibling.bottom <= base.top).toBe(true);
  for (const card of result.cards) {
    expect(card.left).toBeGreaterThanOrEqual(result.canvas.left - 1);
    expect(card.right).toBeLessThanOrEqual(result.canvas.right + 1);
    expect(card.top).toBeGreaterThanOrEqual(result.canvas.top - 1);
    expect(card.bottom).toBeLessThanOrEqual(result.canvas.bottom + 1);
  }
}, 60_000);
