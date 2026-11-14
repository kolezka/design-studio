// Renders a page to a PNG with headless Chrome.
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Headless Chrome never lays out narrower than this, so a 390 px window only crops
 * a 500 px page. Narrower pages are rendered in an iframe of the exact size instead;
 * the image is then 500 px wide with the page on the left.
 */
export const MIN_WINDOW_WIDTH = 500;

const TIMEOUT_MS = 60_000;
/** A PNG smaller than this is an empty render, whatever Chrome's exit code says. */
const SMALLEST_REAL_PNG = 2_000;
const LOG_TAIL = 1_200;
// Chrome logs page console output as `INFO:CONSOLE...] "message", source: ...`.
const CONSOLE_LINE = /:CONSOLE[^\]]*\] "(.*)", source: (\S+)/g;

export interface Viewport {
  width: number;
  height: number;
}

export interface CaptureRequest extends Viewport {
  url: string;
  /** Path of the PNG to write. Its folder is created when missing. */
  out: string;
  /** How long the page may keep working before the picture is taken, in page time. */
  settleMs: number;
}

export interface Shot {
  out: string;
  /** Why no usable PNG was written, or null when there is one. */
  failure: string | null;
  /** Errors the page threw while rendering. The PNG exists, but may show a broken page. */
  pageErrors: string[];
}

export function capture(chrome: string, { url, out, width, height, settleMs }: CaptureRequest): Shot {
  mkdirSync(dirname(out), { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "design-shot-"));
  try {
    const page = width < MIN_WINDOW_WIDTH ? frameAround(url, { width, height }, profile) : url;
    const chromeRun = Bun.spawnSync(
      [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--enable-logging=stderr",
        "--v=0",
        `--user-data-dir=${profile}`,
        `--window-size=${Math.max(width, MIN_WINDOW_WIDTH)},${height}`,
        `--virtual-time-budget=${settleMs}`,
        `--screenshot=${out}`,
        page,
      ],
      { stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS },
    );
    const log = chromeRun.stderr.toString();
    const bytes = existsSync(out) ? statSync(out).size : 0;
    const rendered = chromeRun.exitCode === 0 && bytes >= SMALLEST_REAL_PNG;
    return {
      out,
      failure: rendered ? null : `exit ${chromeRun.exitCode}, ${bytes} bytes\n${log.slice(-LOG_TAIL)}`,
      pageErrors: pageErrorsIn(log),
    };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

function pageErrorsIn(chromeLog: string): string[] {
  return [...chromeLog.matchAll(CONSOLE_LINE)]
    .map(([, message, source]) => `${message} (${source})`)
    .filter((line) => /Uncaught|Error/.test(line));
}

/** Writes a page that shows `url` in an iframe of the given size and returns its URL. */
function frameAround(url: string, { width, height }: Viewport, dir: string): string {
  const file = join(dir, "frame.html");
  writeFileSync(
    file,
    `<!doctype html><body style="margin:0;background:#d4d4d8"><iframe src="${url}" style="display:block;border:0;width:${width}px;height:${height}px;background:#fff"></iframe></body>`,
  );
  return pathToFileURL(file).href;
}
