// Read-only local canvas for .design/drafts: every target and draft side by side, live reload.
// Usage: bun canvas.ts [--dir .design] [--port 4870] [--open]
import { existsSync, readdirSync, readFileSync, statSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { dir: { type: "string", default: ".design" }, port: { type: "string", default: "4870" }, open: { type: "boolean", default: false } },
});
const root = resolve(values.dir!);
const draftsDir = join(root, "drafts");
if (!existsSync(draftsDir)) {
  console.error(`No drafts found: ${draftsDir} does not exist.`);
  process.exit(2);
}

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

const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

function readMeta(dir: string): { meta: Meta; error: string | null } {
  const file = join(dir, "meta.json");
  if (!existsSync(file)) return { meta: {}, error: null };
  try {
    return { meta: JSON.parse(readFileSync(file, "utf8")) as Meta, error: null };
  } catch (err) {
    return { meta: {}, error: `meta.json is not valid JSON: ${err instanceof Error ? err.message : err}` };
  }
}

function scan(): Map<string, Draft[]> {
  const targets = new Map<string, Draft[]>();
  for (const target of readdirSync(draftsDir).sort()) {
    if (!SEGMENT.test(target) || !isDir(join(draftsDir, target))) continue;
    const drafts: Draft[] = [];
    for (const id of readdirSync(join(draftsDir, target)).sort()) {
      const dir = join(draftsDir, target, id);
      if (!SEGMENT.test(id) || !isDir(dir)) continue;
      const versions = readdirSync(dir)
        .map((f) => /^v(\d+)\.html$/.exec(f))
        .filter((m): m is RegExpExecArray => m !== null)
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

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function card(d: Draft, theme: string, width: number, height: number): string {
  const latest = d.versions.at(-1)!;
  const src = (v: number, t = theme) => `/d/${d.target}/${d.id}/v${v}.html?theme=${t}`;
  const versions = d.versions.map((v) => `<a href="${src(v)}" target="_blank" rel="noopener">v${v}</a>`).join(" ");
  const status = d.meta.status ?? "candidate";
  return `<article class="card" data-status="${esc(status)}">
  <div class="frame" style="--w:${width}px;--h:${height}px">
    <iframe src="${src(latest)}" sandbox="allow-scripts" loading="lazy" title="${esc(d.meta.title ?? d.id)}"></iframe>
  </div>
  <div class="meta">
    <div class="row"><strong>${esc(d.meta.title ?? d.id)}</strong><span class="badge">${esc(status)}</span></div>
    ${d.meta.direction ? `<p>${esc(d.meta.direction)}</p>` : ""}
    ${d.meta.tokens ? `<p class="muted">Style: ${esc(d.meta.tokens)}</p>` : ""}
    ${d.meta.notes ? `<p class="muted">${esc(d.meta.notes)}</p>` : ""}
    ${d.metaError ? `<p class="error">${esc(d.metaError)}</p>` : ""}
    <div class="row muted"><span><code>${esc(d.id)}</code>${d.meta.parent ? ` from <code>${esc(d.meta.parent)}</code>` : ""}</span><span>${versions} &middot; <a href="${src(latest, theme === "dark" ? "light" : "dark")}" target="_blank" rel="noopener">${theme === "dark" ? "light" : "dark"}</a></span></div>
  </div>
</article>`;
}

function page(theme: string, width: number, height: number): string {
  const targets = scan();
  const sections = [...targets]
    .map(([target, drafts]) => `<section><h2>${esc(target)}</h2><div class="grid">${drafts.map((d) => card(d, theme, width, height)).join("")}</div></section>`)
    .join("");
  const link = (t: string, w: number, h: number, label: string, on: boolean) => `<a class="${on ? "on" : ""}" href="/?theme=${t}&w=${w}&h=${h}">${label}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design canvas</title>
<style>
:root{color-scheme:light dark;--bg:#f4f4f5;--panel:#fff;--fg:#18181b;--muted:#71717a;--line:#e4e4e7;--accent:#4f46e5}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--panel:#18181b;--fg:#f4f4f5;--muted:#a1a1aa;--line:#27272a;--accent:#818cf8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
header{position:sticky;top:0;z-index:1;display:flex;gap:16px;align-items:center;justify-content:space-between;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--line)}
header nav{display:flex;gap:6px}header nav a{padding:3px 10px;border:1px solid var(--line);border-radius:6px;color:var(--muted);text-decoration:none}header nav a.on{color:var(--fg);border-color:var(--accent)}
main{padding:20px;display:grid;gap:32px}h2{margin:0 0 12px;font-size:15px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:20px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}.card[data-status=selected]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.card[data-status=rejected]{opacity:.55}
.frame{position:relative;width:100%;aspect-ratio:var(--w)/var(--h);overflow:hidden;border-bottom:1px solid var(--line);container-type:inline-size}
.frame iframe{position:absolute;top:0;left:0;width:var(--w);height:var(--h);border:0;transform-origin:0 0;transform:scale(calc(100cqw / var(--w)))}
.meta{padding:10px 14px;display:grid;gap:4px}.meta p{margin:0}.row{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.badge{font-size:12px;padding:0 8px;border:1px solid var(--line);border-radius:99px;color:var(--muted)}.muted{color:var(--muted);font-size:12px}.error{color:#e11d48;font-size:12px}
a{color:var(--accent)}code{font:12px ui-monospace,monospace}
</style></head><body>
<header><strong>Design canvas <span class="muted">${esc(root)}</span></strong><nav>
${link("light", width, height, "Light", theme === "light")}${link("dark", width, height, "Dark", theme === "dark")}
${link(theme, 1440, 900, "Desktop", width === 1440)}${link(theme, 768, 1024, "Tablet", width === 768)}${link(theme, 390, 844, "Phone", width === 390)}
</nav></header>
<main>${sections || `<p class="muted">No drafts yet. Each draft is drafts/&lt;target&gt;/&lt;draft&gt;/v1.html.</p>`}</main>
<script>new EventSource("/events").onmessage = () => location.reload();</script>
</body></html>`;
}

// Live reload: any change under the design directory reloads open canvases.
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
        return new Response(page(theme, Math.min(Math.max(w, 320), 2560), Math.min(Math.max(h, 320), 2400)), { headers: { "content-type": "text/html; charset=utf-8" } });
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
        if (existsSync(file)) return new Response(Bun.file(file), { headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff" } });
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
