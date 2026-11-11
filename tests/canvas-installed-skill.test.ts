import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repository = join(import.meta.dir, "..");
const claude = Bun.which("claude");
const browser = Bun.which("agent-browser");
const chrome = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((path): path is string => !!path && existsSync(path));
const processes: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
const session = `canvas-installed-${process.pid}`;

afterEach(async () => {
  if (browser) Bun.spawnSync([browser, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  for (const process of processes.splice(0)) { process.kill(); await process.exited; }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "canvas-installed-"));
  roots.push(root);
  const config = join(root, "claude-config");
  const project = join(root, "unrelated-project");
  for (const args of [["marketplace", "add", repository], ["install", "design-studio@design-studio-local", "--scope", "user"]]) {
    const result = Bun.spawnSync([claude!, "plugin", ...args, "--json"], { cwd: root, env: { ...globalThis.process.env, CLAUDE_CONFIG_DIR: config }, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(`Claude plugin ${args[0]} failed: ${result.stderr.toString()} ${result.stdout.toString()}`);
  }
  const registry = JSON.parse(readFileSync(join(config, "plugins", "installed_plugins.json"), "utf8"));
  const installed = join(registry.plugins["design-studio@design-studio-local"][0].installPath, "skills", "design-studio");
  for (const asset of ["canvas-ui.html", "canvas-ui.css", "canvas-ui.browser.js"]) {
    expect(readFileSync(join(installed, "scripts", asset), "utf8").length).toBeGreaterThan(0);
  }
  const draft = join(project, ".design", "drafts", "home", "sample");
  mkdirSync(draft, { recursive: true });
  writeFileSync(join(draft, "meta.json"), JSON.stringify({ title: "Installed skill draft" }));
  writeFileSync(join(draft, "v1.html"), "<!doctype html><h1>Installed preview content</h1>");
  const process = Bun.spawn([processExecPath(), join(installed, "scripts", "canvas.ts"), "--port", "0"], { cwd: project, stdout: "pipe", stderr: "pipe", env: { ...globalThis.process.env, NODE_PATH: "" } });
  processes.push(process);
  const reader = process.stdout.getReader();
  let output = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(output)) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`canvas exited: ${await new Response(process.stderr).text()}`);
    output += new TextDecoder().decode(value);
  }
  return { installed, project, url: /http:\/\/127\.0\.0\.1:\d+\//.exec(output)![0] };
}

function processExecPath() { return process.execPath; }

async function runBrowser(...args: string[]) {
  const process = Bun.spawn([browser!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code !== 0) throw new Error(`agent-browser ${args[0]}: ${err} ${out}`);
  return out.trim();
}

test.skipIf(!claude)("marketplace-installed skill serves its bootstrap from an unrelated project", async () => {
  const { url, installed, project } = await fixture();
  const response = await fetch(url);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  const html = await response.text();
  expect(html).toContain("Proposal graph");
  expect(html).toContain("Installed skill draft");
  const preview = await fetch(new URL("d/home/sample/v1.html", url));
  expect(preview.status).toBe(200);
  expect(await preview.text()).toContain("Installed preview content");
  const script = `const { graphPage } = await import(${JSON.stringify(join(installed, "scripts", "canvas-ui.ts"))}); const html = graphPage('Standalone project', '/tmp/design', 'light', 1440, 900, []); if (!html.includes('Proposal graph') || !html.includes('Standalone project')) process.exit(1);`;
  const direct = Bun.spawn([processExecPath(), "-e", script], { cwd: project, stdout: "pipe", stderr: "pipe", env: { ...process.env, NODE_PATH: "" } });
  const [code, error] = await Promise.all([direct.exited, new Response(direct.stderr).text()]);
  expect({ code, error }).toEqual({ code: 0, error: "" });
}, 20_000);

test.skipIf(!claude || !browser || !chrome)("marketplace-installed skill bootstraps a rendered graph in a browser", async () => {
  const { url } = await fixture();
  await runBrowser("open", `${url}?static=1`);
  await runBrowser("wait", "--text", "Installed skill draft");
  const result = JSON.parse(await runBrowser("eval", "--json", `(() => { const card = document.querySelector('article[data-node="home/sample/v1"]'); const frame = card?.querySelector('iframe'); return { title: card?.textContent, src: frame?.getAttribute('src'), project: document.querySelector('#project')?.textContent, style: card && getComputedStyle(card).position }; })()`)).data.result;
  expect(result.title).toContain("Installed skill draft");
  expect(result.src).toContain("/d/home/sample/v1.html");
  expect(result.project).toBe("unrelated-project");
  expect(result.style).toBe("absolute");
}, 60_000);
