import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error The adapter is plain JavaScript without types.
import { serveCanvas } from "../dsh/canvas.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

const CHROME = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", Bun.which("google-chrome"), Bun.which("chromium")].find((p): p is string => !!p && existsSync(p));
const BROWSER = Bun.which("agent-browser");
const session = `dsh-canvas-test-${process.pid}`;
const project = mkdtempSync(join(tmpdir(), "design-studio-dsh-browser-"));
const drafts = join(project, ".design", "drafts", "home");

let handler: Handler | undefined;
let dispose: (() => void) | undefined;
let host: Server;
let base = "";

function writeDraft(id: string) {
  mkdirSync(join(drafts, id), { recursive: true });
  writeFileSync(join(drafts, id, "v1.html"), `<!doctype html><body><h1>${id}</h1></body>`);
}

async function browser(...args: string[]) {
  const process = Bun.spawn([BROWSER!, "--session", session, ...args], { stdout: "pipe", stderr: "pipe" });
  const [output, error, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code !== 0) throw new Error(`agent-browser ${args[0]} failed: ${error} ${output}`);
  return output.trim();
}

/** Where each preview on the canvas really loads from, once the draft inside has answered. */
async function loadedPreviews(count: number): Promise<string[]> {
  const read = `[...document.querySelectorAll('iframe')].filter(f => f.dataset.ready && f.dataset.ready === f.dataset.nonce).map(f => new URL(f.src).pathname).sort()`;
  for (let attempt = 0; attempt < 40; attempt++) {
    const previews = JSON.parse(await browser("eval", "--json", read)).data.result as string[];
    if (previews.length >= count) return previews;
    await Bun.sleep(250);
  }
  throw new Error(`fewer than ${count} previews loaded`);
}

beforeAll(async () => {
  writeDraft("hero");
  mkdirSync(join(project, '.design/sessions'), { recursive: true });
  writeFileSync(join(project, '.design/sessions/s1'), '@legacy');
  const ctx = {
    webServer: { register: (route: { handler: Handler }) => ((handler = route.handler), () => (handler = undefined)) },
    connection: { requestRejection: () => undefined },
    sessions: { get: (id: string) => (id === "s1" ? { id } : undefined) },
    workingDirectory: { get: () => project },
    inject: (_services: string[], callback: (sub: unknown) => void) => callback(ctx),
    effect: (start: () => () => void) => (dispose = start()),
  };
  serveCanvas(ctx, join(import.meta.dir, ".."));
  host = createServer((req, res) => (handler ? handler(req, res) : res.writeHead(503).end()));
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(host.address() as AddressInfo).port}`;
});

afterAll(() => {
  if (BROWSER) Bun.spawnSync([BROWSER, "--session", session, "close"], { stdout: "ignore", stderr: "ignore" });
  dispose?.();
  host.close();
  rmSync(project, { recursive: true, force: true });
});

// The canvas used to address its drafts, change feed and theme links from the site root,
// which only works when it owns the whole origin. Under DSH it lives below a path.
test.skipIf(!CHROME || !BROWSER)("the canvas works when it is served below a path, as it is inside DSH", async () => {
  await browser("open", `${base}/design-studio/s1/?theme=dark`);
  await browser("set", "viewport", "1600", "1000");
  expect(await loadedPreviews(1)).toEqual(["/design-studio/s1/d/home/hero/v1.html"]);

  // A new draft arrives over the change feed, with no reload.
  writeDraft("split");
  expect(await loadedPreviews(2)).toEqual(["/design-studio/s1/d/home/hero/v1.html", "/design-studio/s1/d/home/split/v1.html"]);

  // The theme switch stays on the canvas instead of leaving for the site root.
  await browser("eval", "--json", "document.getElementById('light').click()");
  await loadedPreviews(2);
  const page = JSON.parse(await browser("eval", "--json", "({ path: location.pathname, theme: document.documentElement.dataset.theme })")).data.result;
  expect(page).toEqual({ path: "/design-studio/s1/", theme: "light" });

  const fresh = join(project, '.design/briefs/store/drafts/shop/cart');
  mkdirSync(fresh, { recursive: true });
  writeFileSync(join(fresh, 'v1.html'), '<h1>Fresh cart</h1>');
  writeFileSync(join(project, '.design/sessions/s1'), 'store');
  let visible: string[] = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    visible = await loadedPreviews(1);
    if (visible.includes('/design-studio/s1/d/shop/cart/v1.html')) break;
    await Bun.sleep(200);
  }
  expect(visible).toEqual(['/design-studio/s1/d/shop/cart/v1.html']);
}, 60_000);
