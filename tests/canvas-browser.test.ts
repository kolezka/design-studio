import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANVAS = join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((p): p is string => !!p && existsSync(p));
const BROWSER = Bun.which("agent-browser");
const processes: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
const session = `canvas-test-${process.pid}`;
afterEach(async () => {
  if (BROWSER) Bun.spawnSync([BROWSER, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  for (const process of processes.splice(0)) { process.kill(); await process.exited; }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
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

async function start(extraDrafts = 0, live = false) {
  const root = mkdtempSync(join(tmpdir(), "canvas-browser-"));
  roots.push(root);
  for (const [id, meta, versions] of [
    ["base", { title: "Base", status: "baseline" }, [1]],
    ["variant", { title: "Variant", parent: "base", tokens: "stone" }, [1, 2]],
    ["broken", null, [1]],
  ] as const) {
    const dir = join(root, ".design", "drafts", "home", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "meta.json"), meta ? JSON.stringify(meta) : "{ invalid");
    for (const v of versions) writeFileSync(join(dir, `v${v}.html`), `<!doctype html><body><h1>${id} version ${v}</h1></body>`);
  }
  for (let i = 0; i < extraDrafts; i++) {
    const dir = join(root, ".design", "drafts", "home", `extra-${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "v1.html"), `<h1>Extra ${i}</h1>`);
  }
  const canvas = Bun.spawn(["bun", CANVAS, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  processes.push(canvas);
  const reader = canvas.stdout.getReader();
  let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`canvas exited: ${await new Response(canvas.stderr).text()}`);
    output += new TextDecoder().decode(value);
  }
  const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(output)![0];
  await browser("set", "viewport", "1600", "1000");
  await browser("open", `${url}?theme=dark${live ? "" : "&static=1"}`);
  await browser("wait", "--text", "Variant");
  return root;
}

async function selectVariantElement(button = "left") {
  const point = await evaluate(`(() => { const r = document.querySelector('iframe[title="Preview: Variant"]').getBoundingClientRect(); return { x: Math.round(r.left + 12), y: Math.round(r.top + 12) }; })()`);
  await browser("mouse", "move", String(point.x), String(point.y));
  await browser("mouse", "down", button);
  await browser("mouse", "up", button);
  await browser("wait", "--text", "variant version 2");
}

async function waitFor(expression: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

test.skipIf(!CHROME || !BROWSER)("graph renders readable previews, lineage, metadata and versions", async () => {
  await start();
  const result = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('article')];
    const variant = cards.find(c => c.textContent.includes('Variant'));
    const frame = variant.querySelector('iframe');
    const box = frame.getBoundingClientRect();
    return { titles: cards.map(c => c.textContent), sandbox: frame.getAttribute('sandbox'), src: frame.getAttribute('src'), width: box.width, height: box.height, edges: document.querySelectorAll('svg path').length };
  })()`);
  expect(result.titles.join(" ")).toContain("meta.json is not valid JSON");
  expect(result.titles.join(" ")).toContain("Style: stone");
  expect(result.sandbox).toBe("allow-scripts");
  expect(result.src).toContain("/d/home/variant/v2.html?theme=dark");
  expect(result.width).toBeGreaterThan(150);
  expect(result.height).toBeGreaterThan(90);
  expect(result.edges).toBe(1);
  await browser("select", '[aria-label="Version for Variant"]', "1");
  expect(await evaluate(`document.querySelector('iframe[title="Preview: Variant"]').getAttribute('src')`)).toContain("/v1.html?theme=dark");
}, 60_000);

test.skipIf(!CHROME || !BROWSER)("a large graph initially keeps previews readable", async () => {
  await start(15);
  const width = await evaluate(`document.querySelector('iframe[title="Preview: Base"]').getBoundingClientRect().width`);
  expect(width).toBeGreaterThan(150);
}, 60_000);

test.skipIf(!CHROME || !BROWSER)("selecting a preview element adds its context to the request", async () => {
  await start();
  await evaluate(`([...document.querySelectorAll('article')].find(c => c.textContent.includes('Variant')).querySelectorAll('button')[0].click(), true)`);
  const point = await evaluate(`(() => { const r = document.querySelector('iframe[title="Preview: Variant"]').getBoundingClientRect(); return { x: Math.round(r.left + 12), y: Math.round(r.top + 12) }; })()`);
  await browser("mouse", "move", String(point.x), String(point.y));
  await browser("mouse", "down");
  await browser("mouse", "up");
  await browser("wait", "--text", "variant version 2");
  const result = await evaluate(`document.querySelector('#request').value`);
  expect(result).toContain("home/variant (v2)");
  expect(result).toContain("variant version 2");
  expect(result).toContain("h1:nth-of-type(1)");
}, 60_000);

test.skipIf(!CHROME || !BROWSER)("full preview opens the selected version", async () => {
  await start();
  await browser("select", '[aria-label="Version for Variant"]', "1");
  await evaluate(`([...document.querySelectorAll('article')].find(c => c.textContent.includes('Variant')).querySelectorAll('button')[1].click(), true)`);
  const result = await evaluate(`(() => { const dialog = document.querySelector('dialog[open]'); const frame = dialog.querySelector('iframe'); return { text: dialog.textContent, src: frame.getAttribute('src'), sandbox: frame.getAttribute('sandbox'), width: frame.getBoundingClientRect().width }; })()`);
  expect(result.text).toContain("Variant");
  expect(result.src).toContain("/v1.html?theme=dark");
  expect(result.sandbox).toBe("allow-scripts");
  expect(result.width).toBeGreaterThan(400);
}, 60_000);

test.skipIf(!CHROME || !BROWSER)("live draft edits refresh the selected version and invalidate its old element", async () => {
  const root = await start(0, true);
  await browser("select", '[aria-label="Version for Variant"]', "1");
  await waitFor(`document.querySelector('iframe[title="Preview: Variant"]').getAttribute('src').includes('/v1.html')`);
  await evaluate(`([...document.querySelectorAll('article')].find(c => c.textContent.includes('Variant')).querySelectorAll('button')[0].click(), true)`);
  const point = await evaluate(`(() => { const r = document.querySelector('iframe[title="Preview: Variant"]').getBoundingClientRect(); return { x: Math.round(r.left + 12), y: Math.round(r.top + 12) }; })()`);
  await browser("mouse", "move", String(point.x), String(point.y));
  await browser("mouse", "down");
  await browser("mouse", "up");
  await browser("wait", "--text", "variant version 1");
  const oldSrc = await evaluate(`document.querySelector('iframe[title="Preview: Variant"]').getAttribute('src')`);
  writeFileSync(join(root, ".design", "drafts", "home", "variant", "v1.html"), "<!doctype html><body><h1>Updated live draft</h1></body>");
  await waitFor(`document.querySelector('iframe[title="Preview: Variant"]').getAttribute('src') !== ${JSON.stringify(oldSrc)}`);
  expect(await evaluate(`document.querySelector('[aria-label="Version for Variant"]').value`)).toBe("1");
  expect(await evaluate(`document.querySelector('#request').value`)).not.toContain("variant version 1");
  await browser("mouse", "move", String(point.x), String(point.y));
  await browser("mouse", "down");
  await browser("mouse", "up");
  await browser("wait", "--text", "Updated live draft");
  expect(await evaluate(`document.querySelector('#request').value`)).toContain("home/variant (v1)");
}, 60_000);

test.skipIf(!CHROME || !BROWSER)("changing versions clears the selected element", async () => {
  await start();
  await evaluate(`([...document.querySelectorAll('article')].find(c => c.textContent.includes('Variant')).querySelectorAll('button')[0].click(), true)`);
  await selectVariantElement();
  await browser("select", '[aria-label="Version for Variant"]', "1");
  const request = await evaluate(`document.querySelector('#request').value`);
  expect(request).toContain("home/variant (v1)");
  expect(request).not.toContain("Selected element:");
  expect(request).not.toContain("variant version 2");
}, 60_000);

test.skipIf(!CHROME || !BROWSER)("right-click selects an element without enabling selection mode", async () => {
  await start();
  await selectVariantElement("right");
  expect(await evaluate(`document.querySelector('#request').value`)).toContain("variant version 2");
  const point = await evaluate(`(() => { const r = document.querySelector('iframe[title="Preview: Variant"]').getBoundingClientRect(); return { x: Math.round(r.left + 12), y: Math.round(r.top + 65) }; })()`);
  await browser("mouse", "move", String(point.x), String(point.y));
  await browser("mouse", "down");
  await browser("mouse", "up");
  await Bun.sleep(200);
  expect(await evaluate(`document.querySelector('#request').value`)).toContain("variant version 2");
  expect(await evaluate(`document.querySelector('#request').value`)).toContain("h1:nth-of-type(1)");
}, 60_000);
