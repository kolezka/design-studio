import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const canvas = join(import.meta.dir, "..", "skills/design-studio/scripts/canvas.ts");
const browser = Bun.which("agent-browser");
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("google-chrome"), Bun.which("chromium")].find(p => p && existsSync(p));
const session = `canvas-variants-${process.pid}`;
let root = "";
let server: ReturnType<typeof Bun.spawn> | undefined;
const fixture = new Map<string, string>();

afterEach(async () => {
  if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  if (server) { server.kill(); await server.exited; server = undefined; }
  if (root) { rmSync(root, { recursive: true, force: true }); root = ""; }
  fixture.clear();
});

async function run(...args: string[]) {
  const proc = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(`agent-browser ${args[0]}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(expression: string) { return JSON.parse(await run("eval", "--json", expression)).data.result; }
function draft(target: string, id: string, meta: object, versions = [1]) {
  const dir = join(root, ".design", "drafts", target, id);
  mkdirSync(dir, { recursive: true });
  const files = new Map<string, string>([["meta.json", JSON.stringify(meta, null, 2)]]);
  for (const version of versions) files.set(`v${version}.html`, `<!doctype html><h1>${target} ${id} v${version}</h1>`);
  for (const [name, content] of files) {
    const path = join(dir, name);
    writeFileSync(path, content);
    fixture.set(path, content);
  }
}
async function start() {
  root = mkdtempSync(join(tmpdir(), "canvas-variants-"));
  for (const target of ["home", "settings", "account"]) {
    draft(target, "original", { title: `${target} alpha`, variant: "alpha", versions: { v1: {}, v2: { parent: { draft: "original", version: 1 } } } }, [1, 2]);
    draft(target, "alternate", { title: `${target} beta`, variant: "beta", variantParent: "alpha", versions: { v1: { parent: { draft: "original", version: 1 } }, v2: { parent: { draft: "alternate", version: 1 } } } }, [1, 2]);
  }
  const longView = `view-${"wide".repeat(18)}`;
  const longVariant = `variant-${"wide".repeat(18)}`;
  draft(longView, "original", { variant: "alpha", versions: { v1: {} } });
  draft(longView, "alternate", { variant: "beta", variantParent: "alpha", versions: { v1: { parent: { draft: "original", version: 1 } } } });
  draft("home", "long-variant", { variant: longVariant, variantParent: "alpha", versions: { v1: { parent: { draft: "original", version: 1 } } } });
  draft("home", "baseline", { title: "Unassigned baseline", versions: { v1: {} } });
  draft("home", "alternative", { title: "Variant alternative", variant: "gamma", versions: { v1: { parent: { draft: "baseline", version: 1 } } } });
  draft("home", "alpha", { title: "Legacy ambiguous", parent: "original" });
  draft("home", "missing-origin", { variant: "missing-origin", variantParent: "does-not-exist" });
  draft("home", "conflict-a", { variant: "conflict", variantParent: "alpha" });
  draft("settings", "conflict-b", { variant: "conflict", variantParent: "beta" });
  draft("home", "omitted-a", { variant: "omitted", variantParent: "alpha" });
  draft("settings", "omitted-b", { variant: "omitted" });
  draft("home", "cycle-a", { variant: "cycle-a", variantParent: "cycle-b" });
  draft("settings", "cycle-b", { variant: "cycle-b", variantParent: "cycle-a" });
  server = Bun.spawn(["bun", canvas, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader(); let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const next = await reader.read();
    if (next.done) throw new Error(`canvas exited: ${await new Response(server.stderr).text()}`);
    output += new TextDecoder().decode(next.value);
  }
  await run("set", "viewport", "1600", "1000");
  await run("open", `${output.match(/http:\/\/127\.0\.0\.1:\d+\//)![0]}?static=1`);
  await run("wait", "--text", "Legacy ambiguous");
}

const enabled = !!browser && !!chrome;
test.skipIf(!enabled)("variant groups preserve per-view version lineage and provenance without changing fixtures", async () => {
  await start();
  const result = await evaluate(`(() => ({ headers: [...document.querySelectorAll('.variant-header')].map(n => ({text:n.textContent, top:parseFloat(n.style.top)})), nodes: Object.fromEntries([...document.querySelectorAll('[data-node]')].map(n => [n.dataset.node, {text:n.textContent, top:parseFloat(n.style.top), src:n.querySelector('iframe')?.getAttribute('src')}])), edges: [...document.querySelectorAll('[data-source][data-target]')].map(e => ({source:e.dataset.source,target:e.dataset.target,inferred:e.dataset.inferred})) }))()`);
  const alpha = result.headers.find((h: { text: string }) => h.text === "Variant: alpha");
  const beta = result.headers.find((h: { text: string }) => h.text.includes("Variant: beta"));
  const unassigned = result.headers.find((h: { text: string }) => h.text.includes("Unassigned variant"));
  expect(alpha).toBeDefined(); expect(beta?.text).toContain("From variant: alpha"); expect(unassigned).toBeDefined();
  const group = (top: number) => result.headers.filter((h: { top: number }) => h.top < top).sort((a: { top: number }, b: { top: number }) => b.top - a.top)[0]?.text;
  for (const target of ["home", "settings", "account"]) {
    for (const [id, variant] of [["original", "alpha"], ["alternate", "beta"]]) {
      for (const version of [1, 2]) {
        const key = `${target}/${id}/v${version}`;
        expect(result.nodes[key]).toBeDefined();
        expect(result.nodes[key].src).toContain(`/d/${key}.html`);
        expect(group(result.nodes[key].top)).toContain(`Variant: ${variant}`);
      }
      expect(result.edges).toContainEqual({ source: `${target}/${id}/v1`, target: `${target}/${id}/v2`, inferred: "false" });
    }
    expect(result.edges).toContainEqual({ source: `${target}/original/v1`, target: `${target}/alternate/v1`, inferred: "false" });
  }
  expect(group(result.nodes["home/alpha/v1"].top)).toContain("Unassigned variant");
  expect(result.nodes["home/alpha/v1"].text.toLowerCase()).toContain("ambiguous");
  expect(result.edges.some((e: { target: string }) => e.target === "home/alpha/v1")).toBe(false);
  for (const edge of result.edges) expect(edge.source.split("/")[0]).toBe(edge.target.split("/")[0]);
  for (const [path, content] of fixture) expect(readFileSync(path, "utf8")).toBe(content);
}, 60000);

test.skipIf(!enabled)("version edges avoid unrelated cards across variant groups", async () => {
  await start();
  const result = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-node]')].map(n => ({key:n.dataset.node, x:parseFloat(n.style.left), y:parseFloat(n.style.top), width:n.offsetWidth, height:n.offsetHeight}));
    const headers = [...document.querySelectorAll('.variant-header, .view-header')].map(n => ({key:n.textContent, x:n.offsetLeft, y:n.offsetTop, width:n.offsetWidth, height:n.offsetHeight}));
    const collisions = [];
    for (const path of document.querySelectorAll('[data-source][data-target]')) {
      const length = path.getTotalLength();
      for (let i = 0; i <= Math.ceil(length); i++) {
        const p = path.getPointAtLength(Math.min(i, length));
        for (const card of [...cards, ...headers]) {
          if (card.key === path.dataset.source || card.key === path.dataset.target) continue;
          if (p.x > card.x && p.x < card.x + card.width && p.y > card.y && p.y < card.y + card.height) {
            const collision = [path.dataset.source, path.dataset.target, card.key].join(' → ');
            if (!collisions.includes(collision)) collisions.push(collision);
          }
        }
      }
    }
    const boxes = [...cards, ...headers];
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) overlaps.push([a.key, b.key]);
    }
    return { collisions, overlaps, headers, edges:[...document.querySelectorAll('[data-source][data-target]')].map(p => [p.dataset.source, p.dataset.target]) };
  })()`);
  expect(result.headers.some((h: { key: string; width: number }) => h.key.startsWith("View: view-wide") && h.width > 350)).toBe(true);
  expect(result.headers.some((h: { key: string; width: number }) => h.key.startsWith("Variant: variant-wide") && h.width > 350)).toBe(true);
  expect(result.edges).toContainEqual(["home/baseline/v1", "home/alternative/v1"]);
  expect(result.collisions).toEqual([]);
  expect(result.overlaps).toEqual([]);
  await run("click", "#fit");
  const fit = await evaluate(`(() => {
    const canvas = document.querySelector('#canvas').getBoundingClientRect();
    return [...document.querySelectorAll('[data-node], .variant-header, .view-header')].every(n => {
      const r = n.getBoundingClientRect();
      return r.left >= canvas.left - 1 && r.right <= canvas.right + 1 && r.top >= canvas.top - 1 && r.bottom <= canvas.bottom + 1;
    });
  })()`);
  expect(fit).toBe(true);
  const beforePan = await evaluate(`document.querySelector('#world').style.transform`);
  await run("click", "#right");
  const afterPan = await evaluate(`document.querySelector('#world').style.transform`);
  expect(afterPan).not.toBe(beforePan);
}, 60000);

test.skipIf(!enabled)("invalid variant origins remain visible and warn rather than assert provenance", async () => {
  await start();
  const result = await evaluate(`(() => ({ headers:[...document.querySelectorAll('.variant-header')].map(n=>n.textContent), nodes:Object.fromEntries([...document.querySelectorAll('[data-node]')].map(n=>[n.dataset.node,n.textContent])) }))()`);
  expect(result.nodes["home/missing-origin/v1"].toLowerCase()).toMatch(/missing.*variant|variant.*missing/);
  for (const id of ["home/conflict-a/v1", "settings/conflict-b/v1", "home/omitted-a/v1", "settings/omitted-b/v1"]) expect(result.nodes[id].toLowerCase()).toMatch(/conflict/);
  for (const id of ["home/cycle-a/v1", "settings/cycle-b/v1"]) expect(result.nodes[id].toLowerCase()).toMatch(/cycle|cyclic/);
  for (const variant of ["missing-origin", "conflict", "omitted", "cycle-a", "cycle-b"]) {
    const header = result.headers.find((text: string) => text.startsWith(`Variant: ${variant}`));
    expect(header).toBeDefined();
    expect(header).not.toContain("From variant:");
  }
  for (const [path, content] of fixture) expect(readFileSync(path, "utf8")).toBe(content);
}, 60000);
