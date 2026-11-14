import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const canvas = join(import.meta.dir, "..", "bin", "design-studio");
const browser = Bun.which("agent-browser");
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", Bun.which("google-chrome"), Bun.which("chromium")].find(p => p && existsSync(p));
const session = `canvas-lineage-${process.pid}`;
let root = "";
let server: ReturnType<typeof Bun.spawn> | undefined;

afterEach(async () => {
  if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  if (server) { server.kill(); await server.exited; server = undefined; }
  if (root) { rmSync(root, { recursive: true, force: true }); root = ""; }
});

async function run(...args: string[]) {
  const process = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code) throw new Error(`agent-browser ${args[0]}: ${err} ${out}`);
  return out.trim();
}
async function evaluate(expression: string) { return JSON.parse(await run("eval", "--json", expression)).data.result; }
async function until(expression: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await Bun.sleep(100); }
  throw new Error(`Timed out: ${expression}`);
}
function draft(id: string, meta: object, versions: number[]) {
  const dir = join(root, ".design", "drafts", "home", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
  for (const v of versions) writeFileSync(join(dir, `v${v}.html`), `<!doctype html><h1>${id} v${v}</h1>`);
}
async function start(live = false) {
  root = mkdtempSync(join(tmpdir(), "canvas-lineage-"));
  draft("base", { title: "Base", status: "baseline" }, [1, 2]);
  draft("variant", { title: "Variant", versions: { v1: { parent: { draft: "base", version: 1 } }, v2: { parent: { draft: "variant", version: 1 } } } }, [1, 2]);
  draft("branch", { title: "Branch", versions: { v1: { parent: { draft: "base", version: 1 } } } }, [1]);
  draft("legacy", { title: "Legacy", parent: "base" }, [1, 2]);
  draft("missing", { versions: { v1: { parent: { draft: "absent", version: 1 } } } }, [1]);
  draft("bad-version", { versions: { v1: { parent: { draft: "base", version: 99 } } } }, [1]);
  draft("unique", {}, [1]);
  draft("legacy-unique", { parent: "unique" }, [1]);
  draft("legacy-missing", { parent: "absent" }, [1]);
  draft("legacy-invalid", { parent: 42 }, [1]);
  draft("legacy-root", { parent: null }, [1, 2]);
  draft("unreadable", {}, [1, 2]);
  writeFileSync(join(root, ".design", "drafts", "home", "unreadable", "meta.json"), "{");
  draft("invalid-container-null", { versions: null }, [1, 2]);
  draft("invalid-container-array", { versions: [] }, [1, 2]);
  draft("invalid-container-string", { versions: "bad" }, [1, 2]);
  draft("invalid-entry", { versions: { v2: null } }, [1, 2]);
  draft("explicit-root", { versions: { v2: {} } }, [1, 2]);
  draft("null-parent", { versions: { v2: { parent: null } } }, [1, 2]);
  draft("cycle-a", { versions: { v1: { parent: { draft: "cycle-b", version: 1 } } } }, [1]);
  draft("cycle-b", { versions: { v1: { parent: { draft: "cycle-a", version: 1 } } } }, [1]);
  server = Bun.spawn(["bun", canvas, "canvas", "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const reader = server.stdout.getReader(); let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const next = await reader.read();
    if (next.done) throw new Error(`canvas exited: ${await new Response(server.stderr).text()}`);
    output += new TextDecoder().decode(next.value);
  }
  await run("set", "viewport", "1600", "1000");
  await run("open", `${output.match(/http:\/\/127\.0\.0\.1:\d+\//)![0]}${live ? "" : "?static=1"}`);
  await run("wait", "--text", "Variant");
}

const enabled = !!browser && !!chrome;
test.skipIf(!enabled)("version nodes preserve explicit branches and show matching previews", async () => {
  await start();
  const result = await evaluate(`(() => ({ nodes: [...document.querySelectorAll('[data-node]')].map(n => ({id:n.dataset.node, src:n.querySelector('iframe')?.getAttribute('src')})), edges:[...document.querySelectorAll('[data-source][data-target]')].map(e => ({source:e.dataset.source,target:e.dataset.target,inferred:e.dataset.inferred})) }))()`);
  for (const id of ["home/base/v1", "home/base/v2", "home/variant/v1", "home/variant/v2", "home/branch/v1"]) {
    const node = result.nodes.find((n: { id: string }) => n.id === id);
    expect(node).toBeDefined();
    expect(node.src).toContain(`/d/${id}.html`);
  }
  for (const [source, target] of [["home/base/v1", "home/variant/v1"], ["home/variant/v1", "home/variant/v2"], ["home/base/v1", "home/branch/v1"]]) {
    expect(result.edges.some((e: { source: string; target: string; inferred?: string }) => e.source === source && e.target === target && e.inferred !== "true")).toBe(true);
  }
}, 60000);

test.skipIf(!enabled)("legacy links are inferred and invalid parents do not create dangling or cyclic edges", async () => {
  await start();
  const result = await evaluate(`(() => ({ nodes:[...document.querySelectorAll('[data-node]')].map(n=>n.dataset.node), edges:[...document.querySelectorAll('[data-source][data-target]')].map(e=>({source:e.dataset.source,target:e.dataset.target,inferred:e.dataset.inferred})) }))()`);
  for (const id of ["home/legacy/v1", "home/legacy/v2", "home/missing/v1", "home/bad-version/v1", "home/cycle-a/v1", "home/cycle-b/v1"]) expect(result.nodes).toContain(id);
  expect(result.edges.some((e: { source: string; target: string; inferred: string }) => e.source === "home/legacy/v1" && e.target === "home/legacy/v2" && e.inferred === "true")).toBe(true);
  expect(result.edges.some((e: { target: string }) => e.target === "home/legacy/v1")).toBe(false);
  const warnings = await evaluate(`['legacy', 'missing', 'bad-version', 'cycle-a', 'cycle-b'].map(id => document.querySelector('[data-node="home/' + id + '/v1"]').textContent)`);
  for (const warning of warnings) expect(warning.toLowerCase()).toMatch(/ambiguous|missing|not found|invalid|cycle/);
  for (const edge of result.edges) { expect(result.nodes).toContain(edge.source); expect(result.nodes).toContain(edge.target); }
  expect(result.edges.some((e: { target: string }) => ["home/missing/v1", "home/bad-version/v1"].includes(e.target))).toBe(false);
  const parents = new Map<string, string>(result.edges.map((e: { source: string; target: string }) => [e.target, e.source]));
  for (const id of result.nodes) {
    const visited = new Set<string>(); let cursor: string | undefined = id;
    while (cursor && parents.has(cursor)) { expect(visited.has(cursor)).toBe(false); if (visited.has(cursor)) break; visited.add(cursor); cursor = parents.get(cursor); }
  }
}, 60000);

test.skipIf(!enabled)("malformed metadata and explicit roots do not infer lineage", async () => {
  await start();
  const result = await evaluate(`(() => ({ nodes: Object.fromEntries([...document.querySelectorAll('[data-node]')].map(n => [n.dataset.node, n.textContent])), edges: [...document.querySelectorAll('[data-source][data-target]')].map(e => ({source:e.dataset.source,target:e.dataset.target,inferred:e.dataset.inferred})) }))()`);
  for (const id of ["invalid-container-null", "invalid-container-array", "invalid-container-string"]) {
    for (const version of [1, 2]) expect(result.nodes[`home/${id}/v${version}`]).toContain("Invalid version metadata");
  }
  expect(result.nodes["home/invalid-entry/v2"]).toContain("Invalid version metadata");
  expect(result.nodes["home/null-parent/v2"]).toContain("Invalid parent reference");
  expect(result.nodes["home/legacy-missing/v1"]).toContain("Missing parent draft");
  expect(result.nodes["home/legacy-invalid/v1"]).toContain("Invalid legacy parent reference");
  for (const id of ["invalid-container-null", "invalid-container-array", "invalid-container-string", "invalid-entry", "explicit-root", "null-parent"]) {
    expect(result.edges.some((edge: { target: string }) => edge.target === `home/${id}/v2`)).toBe(false);
  }
  expect(result.edges).toContainEqual({ source: "home/unique/v1", target: "home/legacy-unique/v1", inferred: "false" });
}, 60000);

test.skipIf(!enabled)("unreadable metadata and legacy null roots do not create parent links", async () => {
  await start();
  const result = await evaluate(`(() => ({ nodes: Object.fromEntries([...document.querySelectorAll('[data-node]')].map(n => [n.dataset.node, n.textContent])), edges: [...document.querySelectorAll('[data-source][data-target]')].map(e => ({source:e.dataset.source,target:e.dataset.target})) }))()`);
  for (const version of [1, 2]) {
    expect(result.nodes[`home/unreadable/v${version}`]).toContain("Metadata error:");
    expect(result.edges.some((edge: { target: string }) => edge.target === `home/unreadable/v${version}`)).toBe(false);
  }
  expect(result.nodes["home/legacy-root/v1"]).not.toContain("Warning:");
  expect(result.edges.some((edge: { target: string }) => edge.target === "home/legacy-root/v1")).toBe(false);
  expect(result.edges).toContainEqual({ source: "home/legacy-root/v1", target: "home/legacy-root/v2" });
}, 60000);

test.skipIf(!enabled)("live additions preserve selected preview and viewport", async () => {
  await start(true);
  await until("document.querySelector('#status').textContent.includes('connected')");
  await until("document.querySelector('[data-node=\"home/variant/v1\"]') !== null");
  await run("click", "#in");
  await run("click", "#right");
  const before = await evaluate(`(() => { const n=document.querySelector('[data-node="home/variant/v1"]'); n.querySelector('button').click(); return {transform:document.querySelector('#world').style.transform, src:n.querySelector('iframe').getAttribute('src')}; })()`);
  writeFileSync(join(root, ".design", "drafts", "home", "variant", "v3.html"), "<h1>variant v3</h1>");
  await until("document.querySelector('[data-node=\"home/variant/v3\"]') !== null");
  const after = await evaluate(`(() => { const n=document.querySelector('[data-node="home/variant/v1"]'); return {transform:document.querySelector('#world').style.transform, src:n.querySelector('iframe').getAttribute('src'), selected:n.matches('.selected, [aria-selected="true"]')}; })()`);
  expect(after.transform).toBe(before.transform);
  expect(after.src).toBe(before.src);
  expect(after.selected).toBe(true);
}, 60000);
