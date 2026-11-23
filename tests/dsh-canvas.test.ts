import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error The adapter is plain JavaScript without types.
import { CANVAS_PREFIX, serveCanvas } from "../dsh/canvas.js";

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

const pluginRoot = join(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "design-studio-dsh-canvas-"));
const withDrafts = join(scratch, "with-drafts");
const withoutDrafts = join(scratch, "without-drafts");
const directories: Record<string, string> = { drafted: withDrafts, fresh: withDrafts, empty: withoutDrafts };

let signedIn = true;
let handler: Handler | undefined;
let dispose: (() => void) | undefined;
let host: Server;
let base = "";

beforeAll(async () => {
  mkdirSync(join(withDrafts, ".design", "drafts", "home", "hero"), { recursive: true });
  writeFileSync(join(withDrafts, ".design", "drafts", "home", "hero", "v1.html"), "<!doctype html><title>Hero</title><h1>Hero</h1>");
  mkdirSync(withoutDrafts, { recursive: true });

  // The smallest DSH host the adapter needs: one prefix route, a login check, sessions and their folders.
  const ctx = {
    webServer: {
      register(route: { kind: string; path: string; handler: Handler }) {
        expect({ kind: route.kind, path: route.path }).toEqual({ kind: "prefix", path: CANVAS_PREFIX });
        handler = route.handler;
        return () => (handler = undefined);
      },
    },
    connection: { requestRejection: () => (signedIn ? undefined : 401) },
    sessions: { get: (id: string) => (id in directories ? { id } : undefined) },
    workingDirectory: { get: (session: { id: string }) => directories[session.id] },
    inject: (_services: string[], callback: (sub: unknown) => void) => callback(ctx),
    effect: (start: () => () => void) => (dispose = start()),
  };
  serveCanvas(ctx, pluginRoot);

  host = createServer((req, res) => (handler ? handler(req, res) : res.writeHead(503).end()));
  await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(host.address() as AddressInfo).port}`;
});

afterAll(() => {
  dispose?.();
  host.close();
  rmSync(scratch, { recursive: true, force: true });
});

test("a visitor who is not signed in to DSH gets nothing from the canvas", async () => {
  signedIn = false;
  try {
    const response = await fetch(`${base}/design-studio/drafted/`);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  } finally {
    signedIn = true;
  }
});

test("only live sessions and read requests are served", async () => {
  expect((await fetch(`${base}/design-studio/nobody/`)).status).toBe(404);
  expect((await fetch(`${base}/design-studio/drafted`)).status).toBe(404);
  // A session id that is not valid percent-encoding is just an unknown session.
  expect((await fetch(`${base}/design-studio/%E0%A4%A/`)).status).toBe(404);
  const write = await fetch(`${base}/design-studio/drafted/api/drafts`, { method: "POST" });
  expect({ status: write.status, allow: write.headers.get("allow") }).toEqual({ status: 405, allow: "GET, HEAD" });
});

test("a session without drafts gets a page that says so", async () => {
  const response = await fetch(`${base}/design-studio/empty/`);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("No drafts yet");
  expect((await fetch(`${base}/design-studio/empty/api/drafts`)).status).toBe(404);
});

test("a fresh session in a workspace with legacy drafts does not silently reopen them", async () => {
  expect(await (await fetch(`${base}/design-studio/fresh/`)).text()).toContain('No drafts yet');
  expect((await fetch(`${base}/design-studio/fresh/d/home/hero/v1.html`)).status).toBe(404);
});

test("a session with drafts gets its canvas, drafts and change feed through DSH", async () => {
  mkdirSync(join(withDrafts, '.design/sessions'), { recursive: true });
  writeFileSync(join(withDrafts, '.design/sessions/drafted'), '@legacy');
  const page = await fetch(`${base}/design-studio/drafted/?theme=dark`);
  expect(page.status).toBe(200);
  expect(page.headers.get("content-type")).toContain("text/html");
  const html = await page.text();
  expect(html).toContain('"theme":"dark"');
  expect(html).toContain(JSON.stringify(join(withDrafts, ".design")));

  const drafts = await fetch(`${base}/design-studio/drafted/api/drafts`);
  // Only the canvas page itself is served without the sandbox.
  expect(page.headers.get("content-security-policy")).toBeNull();
  expect(drafts.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
  const { targets } = (await drafts.json()) as { targets: { target: string }[] };
  expect(targets.map((entry) => entry.target)).toEqual(["home"]);

  const draft = await fetch(`${base}/design-studio/drafted/d/home/hero/v1.html`);
  expect(draft.status).toBe(200);
  // Drafts run scripts, so they must stay sandboxed away from the DSH origin.
  expect(draft.headers.get("content-security-policy")).toBe("sandbox allow-scripts");
  expect(await draft.text()).toContain("<h1>Hero</h1>");

  const abort = new AbortController();
  const events = await fetch(`${base}/design-studio/drafted/events`, { signal: abort.signal });
  expect(events.status).toBe(200);
  expect(events.headers.get("content-type")).toContain("text/event-stream");
  abort.abort();
}, 30_000);
