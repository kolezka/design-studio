// Read-only local server for the proposal canvas. It never writes to the design directory.
import { basename, dirname, join } from "node:path";
import { isDirectory, isMissingFile, readRegularFile } from "../drafts/files";
import { inReviewOrder, scanDrafts } from "../drafts/scan";
import { isDraftName } from "../shared/drafts";
import { ChangeFeed } from "./change-feed";
import { instrumentDraft } from "./instrument-draft";
import { renderCanvasPage } from "./page";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost):\d+$/;
const DRAFT_ROUTE = /^\/d\/([^/]+)\/([^/]+)\/(v\d+\.html)$/;
const HTML = "text/html; charset=utf-8";

export interface CanvasServerOptions {
  /** The design directory, the one that contains `drafts/`. */
  root: string;
  /** Preferred port. When it is taken, the operating system picks a free one. */
  port: number;
}

export function startCanvasServer({ root, port }: CanvasServerOptions): Bun.Server<undefined> {
  const draftsDir = join(root, "drafts");
  const changes = new ChangeFeed(root);
  const projectName = projectNameOf(root);
  const listDrafts = () => inReviewOrder(scanDrafts(draftsDir));

  const respond = (request: Request): Response => {
    const url = new URL(request.url);
    // A page on another origin can reach 127.0.0.1 through DNS rebinding; its Host header gives it away.
    if (!LOCAL_HOST.test(request.headers.get("host") ?? "")) return new Response("forbidden host", { status: 403 });
    if (url.pathname === "/") {
      const page = renderCanvasPage({
        projectName,
        root,
        theme: url.searchParams.get("theme"),
        width: url.searchParams.get("w"),
        height: url.searchParams.get("h"),
        targets: listDrafts(),
      });
      return new Response(page, { headers: { "content-type": HTML } });
    }
    if (url.pathname === "/api/drafts" && request.method === "GET") {
      return Response.json({ targets: listDrafts() }, { headers: { "cache-control": "no-store" } });
    }
    if (url.pathname === "/events") return changes.subscribe();
    return draftResponse(draftsDir, url.pathname) ?? new Response("not found", { status: 404 });
  };

  const listen = (onPort: number) => Bun.serve({ hostname: "127.0.0.1", port: onPort, idleTimeout: 0, fetch: respond });
  try {
    return listen(port);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "EADDRINUSE") throw error;
    return listen(0);
  }
}

/** The header names the project, not the path: `app/.design` is shown as `app`. */
function projectNameOf(root: string): string {
  return basename(root) === ".design" ? basename(dirname(root)) : basename(root);
}

/** One draft version with the selection bridge added, or null when the path is not a draft. */
function draftResponse(draftsDir: string, pathname: string): Response | null {
  const [, target, draft, file] = DRAFT_ROUTE.exec(pathname) ?? [];
  if (!isDraftName(target) || !isDraftName(draft) || !file) return null;
  const targetDir = join(draftsDir, target);
  const path = join(targetDir, draft, file);
  try {
    if (!isDirectory(targetDir) || !isDirectory(dirname(path))) return null;
    return new Response(instrumentDraft(readRegularFile(path)), {
      headers: {
        "content-type": HTML,
        "x-content-type-options": "nosniff",
        // Drafts run scripts, but in an opaque origin that cannot reach this server's data.
        "content-security-policy": "sandbox allow-scripts",
      },
    });
  } catch (error) {
    if (!isMissingFile(error)) console.error(`Cannot serve draft ${path}:`, error);
    return null;
  }
}
