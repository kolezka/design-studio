import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANVAS = join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const procs: ReturnType<typeof Bun.spawn>[] = [];
afterEach(() => {
  for (const p of procs.splice(0)) p.kill();
});

function draft(root: string, target: string, id: string, meta: string | null, versions = [1]) {
  const dir = join(root, ".design", "drafts", target, id);
  mkdirSync(dir, { recursive: true });
  for (const v of versions) writeFileSync(join(dir, `v${v}.html`), `<!doctype html><title>${id} v${v}</title>`);
  if (meta !== null) writeFileSync(join(dir, "meta.json"), meta);
}

async function start(root: string) {
  const p = Bun.spawn(["bun", CANVAS, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  procs.push(p);
  const reader = p.stdout.getReader();
  let text = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(text)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`canvas exited: ${await new Response(p.stderr).text()}`);
    text += new TextDecoder().decode(value);
  }
  return /http:\/\/127\.0\.0\.1:\d+/.exec(text)![0];
}

test("the canvas lists drafts by status and shows the latest version", async () => {
  const root = mkdtempSync(join(tmpdir(), "canvas-"));
  draft(root, "home", "b-variant", JSON.stringify({ title: "Variant", status: "candidate", tokens: "stone and teal" }), [1, 2]);
  draft(root, "home", "a-current", JSON.stringify({ title: "Current UI", status: "baseline" }));
  draft(root, "home", "c-old", JSON.stringify({ title: "Dropped", status: "rejected" }));
  const base = await start(root);
  const html = await (await fetch(`${base}/?theme=dark`)).text();
  const order = ["Current UI", "Variant", "Dropped"].map((t) => html.indexOf(`<strong>${t}</strong>`));
  expect(order.every((i) => i > 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(html).toContain('src="/d/home/b-variant/v2.html?theme=dark"');
  expect(html).toContain('sandbox="allow-scripts"');
  expect(html).toContain("Style: stone and teal");
  const res = await fetch(`${base}/d/home/b-variant/v1.html`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("b-variant v1");
});

test("a malformed meta.json is shown as an error on its card, not dropped silently", async () => {
  const root = mkdtempSync(join(tmpdir(), "canvas-"));
  draft(root, "home", "broken", "{ nope");
  const html = await (await fetch(`${await start(root)}/`)).text();
  expect(html).toContain("meta.json is not valid JSON");
  expect(html).toContain("<strong>broken</strong>");
});

test("the canvas serves only draft versions, and only to its own host", async () => {
  const root = mkdtempSync(join(tmpdir(), "canvas-"));
  draft(root, "home", "a", JSON.stringify({ title: "A" }));
  writeFileSync(join(root, ".design", "secret.txt"), "not a draft");
  const base = await start(root);
  const status = async (path: string, headers?: Record<string, string>) => (await fetch(base + path, { headers })).status;
  expect(await status("/d/home/a/v1.html")).toBe(200);
  expect(await status("/d/home/a/meta.json")).toBe(404);
  expect(await status("/d/home/..%2F..%2Fsecret.txt/v1.html")).toBe(404);
  expect(await status("/d/..%2F../a/v1.html")).toBe(404);
  expect(await status("/", { host: "evil.example" })).toBe(403);
  expect(await status("/d/home/a/v1.html", { host: "evil.example" })).toBe(403);
});
