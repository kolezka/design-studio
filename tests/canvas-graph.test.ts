import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANVAS = join(import.meta.dir, "..", "bin", "design-studio");
const processes: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
afterEach(async () => {
  for (const process of processes.splice(0)) {
    process.kill();
    await process.exited;
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "canvas-graph-"));
  roots.push(root);
  for (const [id, meta, versions] of [
    ["base", { title: "Base", status: "baseline" }, [1]],
    ["variant", { title: "Variant", parent: "base", status: "candidate" }, [1, 3]],
  ] as const) {
    const dir = join(root, ".design", "drafts", "home", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta));
    for (const version of versions) writeFileSync(join(dir, `v${version}.html`), `<title>${id} v${version}</title>`);
  }
  const broken = join(root, ".design", "drafts", "home", "broken");
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, "meta.json"), "{ invalid");
  writeFileSync(join(broken, "v1.html"), "broken");
  const process = Bun.spawn(["bun", CANVAS, "canvas", "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  processes.push(process);
  const reader = process.stdout.getReader();
  let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`canvas exited: ${await new Response(process.stderr).text()}`);
    output += new TextDecoder().decode(value);
  }
  return { root, base: /http:\/\/127\.0\.0\.1:\d+/.exec(output)![0] };
}

const request = { target: "home", draft: "variant", version: 3, selector: "h1", text: "Hello", description: "Make heading larger" };
function post(base: string, body: unknown = request, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/requests`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, ...headers },
    body: JSON.stringify(body),
  });
}

function expectClientError(status: number) {
  expect(status).toBeGreaterThanOrEqual(400);
  expect(status).toBeLessThan(500);
}

test("draft graph exposes target, lineage, versions and malformed metadata", async () => {
  const { base } = await fixture();
  const response = await fetch(`${base}/api/drafts`);
  expect(response.status).toBe(200);
  const graph = await response.json();
  const home = graph.targets.find((entry: { target: string }) => entry.target === "home");
  expect(home).toBeDefined();
  const variant = home.drafts.find((entry: { id: string }) => entry.id === "variant");
  expect(variant).toMatchObject({ target: "home", id: "variant", meta: { parent: "base" }, metaError: null, versions: [1, 3] });
  expect(home.drafts.find((entry: { id: string }) => entry.id === "base")).toMatchObject({ target: "home", versions: [1] });
  const broken = home.drafts.find((entry: { id: string }) => entry.id === "broken");
  expect(broken.metaError).toBeTruthy();
  expect(broken.versions).toEqual([1]);
});

test("hostile origins, non-JSON and invalid requests are rejected without writes", async () => {
  const { root, base } = await fixture();
  const cases = [
    () => post(base, request, { origin: "https://evil.example" }),
    () => post(base, request, { "content-type": "text/plain" }),
    () => post(base, { ...request, target: "../../outside" }),
    () => post(base, { ...request, target: "missing" }),
    () => post(base, { ...request, draft: "../outside" }),
    () => post(base, { ...request, version: 2 }),
    () => post(base, { ...request, version: "../../outside" }),
    () => post(base, { ...request, description: "   " }),
  ];
  for (const send of cases) expectClientError((await send()).status);
  const dir = join(root, ".design", "requests");
  expect(existsSync(dir) ? readdirSync(dir, { recursive: true }).length : 0).toBe(0);
  expect(existsSync(join(root, "outside"))).toBe(false);
});
