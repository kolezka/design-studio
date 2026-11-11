// Read-only local canvas for .design/drafts with live proposal previews.
// Usage: bun canvas.ts [--dir .design] [--port 4870] [--open]
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readdirSync, readFileSync, watch } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { graphPage } from "./canvas-ui";
import { instrumentDraft } from "./canvas-bridge";

const { values } = parseArgs({
  options: { dir: { type: "string", default: ".design" }, port: { type: "string", default: "4870" }, open: { type: "boolean", default: false } },
});
const root = resolve(values.dir!);
const draftsDir = join(root, "drafts");
if (!existsSync(draftsDir)) {
  console.error(`No drafts found: ${draftsDir} does not exist.`);
  process.exit(2);
}

// The header names the project, not the full path; the path is in the tooltip.
const projectName = basename(root) === ".design" ? basename(dirname(root)) : basename(root);
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const STATUS_ORDER = ["baseline", "selected", "candidate", "rejected"];

interface Meta {
  title?: string;
  direction?: string;
  status?: string;
  parent?: string | null;
  tokens?: string;
  notes?: string;
}
interface Draft {
  target: string;
  id: string;
  meta: Meta;
  metaError: string | null;
  versions: number[];
}

const isDir = (p: string) => lstatSync(p).isDirectory();

function readRegularFile(file: string): string {
  if (!lstatSync(file).isFile()) throw new Error("not a regular file");
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    if (!fstatSync(fd).isFile()) throw new Error("not a regular file");
    return readFileSync(fd, "utf8");
  } finally {
    closeSync(fd);
  }
}

function readMeta(dir: string): { meta: Meta; error: string | null } {
  const file = join(dir, "meta.json");
  try {
    const meta: unknown = JSON.parse(readRegularFile(file));
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return { meta: {}, error: "meta.json must contain an object" };
    }
    return { meta: meta as Meta, error: null };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { meta: {}, error: null };
    return { meta: {}, error: `meta.json is not valid JSON or could not be read: ${err instanceof Error ? err.message : err}` };
  }
}

function scan(): Map<string, Draft[]> {
  const targets = new Map<string, Draft[]>();
  for (const target of readdirSync(draftsDir).sort()) {
    const targetDir = join(draftsDir, target);
    let ids: string[];
    try {
      if (!SEGMENT.test(target) || !isDir(targetDir)) continue;
      ids = readdirSync(targetDir).sort();
    } catch (err) {
      console.error(`Cannot scan target ${targetDir}:`, err);
      continue;
    }
    const drafts: Draft[] = [];
    for (const id of ids) {
      const dir = join(targetDir, id);
      let files: string[];
      try {
        if (!SEGMENT.test(id) || !isDir(dir)) continue;
        files = readdirSync(dir);
      } catch (err) {
        console.error(`Cannot scan draft ${dir}:`, err);
        continue;
      }
      const versions = files
        .map((f) => /^v(\d+)\.html$/.exec(f))
        .filter((m): m is RegExpExecArray => m !== null)
        .filter((m) => {
          try { return lstatSync(join(dir, m[0])).isFile(); }
          catch (err) { console.error(`Cannot inspect version ${join(dir, m[0])}:`, err); return false; }
        })
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b);
      if (!versions.length) continue;
      const { meta, error } = readMeta(dir);
      drafts.push({ target, id, meta, metaError: error, versions });
    }
    const rank = (d: Draft) => {
      const i = STATUS_ORDER.indexOf(d.meta.status ?? "candidate");
      return i === -1 ? STATUS_ORDER.length : i;
    };
    drafts.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
    if (drafts.length) targets.set(target, drafts);
  }
  return targets;
}

// Notify open canvases when the design directory changes.
const clients = new Set<ReadableStreamDefaultController<string>>();
let pending: ReturnType<typeof setTimeout> | undefined;
watch(root, { recursive: true }, () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    for (const c of clients) c.enqueue("data: change\n\n");
  }, 150);
});

function serve(port: number) {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    idleTimeout: 0,
    fetch(req) {
      const url = new URL(req.url);
      const host = req.headers.get("host") ?? "";
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return new Response("forbidden host", { status: 403 });
      if (url.pathname === "/") {
        const theme = url.searchParams.get("theme") === "dark" ? "dark" : "light";
        const w = Number(url.searchParams.get("w")) || 1440;
        const h = Number(url.searchParams.get("h")) || 900;
        const targets = [...scan()].map(([target, drafts]) => ({ target, drafts }));
        return new Response(graphPage(projectName, root, theme, Math.min(Math.max(w, 320), 2560), Math.min(Math.max(h, 320), 2400), targets), { headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (url.pathname === "/api/drafts" && req.method === "GET") {
        const targets = [...scan()].map(([target, drafts]) => ({ target, drafts }));
        return Response.json({ targets }, { headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/events") {
        let self: ReadableStreamDefaultController<string>;
        const stream = new ReadableStream<string>({
          start(c) {
            self = c;
            clients.add(c);
            c.enqueue(": connected\n\n");
          },
          cancel() {
            clients.delete(self);
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
      }
      const m = /^\/d\/([^/]+)\/([^/]+)\/(v\d+\.html)$/.exec(url.pathname);
      if (m && SEGMENT.test(m[1]!) && SEGMENT.test(m[2]!)) {
        const file = join(draftsDir, m[1]!, m[2]!, m[3]!);
        try {
          if (isDir(join(draftsDir, m[1]!)) && isDir(join(draftsDir, m[1]!, m[2]!))) {
            return new Response(instrumentDraft(readRegularFile(file)), { headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "content-security-policy": "sandbox allow-scripts" } });
          }
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.error(`Cannot serve draft ${file}:`, err);
        }
      }
      return new Response("not found", { status: 404 });
    },
  });
}

let server: ReturnType<typeof serve>;
try {
  server = serve(Number(values.port));
} catch (err) {
  if ((err as { code?: string }).code !== "EADDRINUSE") throw err;
  server = serve(0); // the preferred port is taken; let the OS pick one
}
const address = `http://127.0.0.1:${server.port}/`;
console.log(`Design canvas on ${address} (${root}). Stop it with: kill ${process.pid}`);
if (values.open) Bun.spawn([process.platform === "darwin" ? "open" : "xdg-open", address], { stdout: "ignore", stderr: "ignore" });
