// Renders a draft with headless Chrome and writes a PNG the agent can open and look at.
// Usage: bun shot.ts <draft.html> [--out file.png] [--width 1440] [--height 900] [--theme light|dark]
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    theme: { type: "string", default: "light" },
    wait: { type: "string", default: "4000" },
  },
});

const input = positionals[0];
if (!input || !existsSync(input)) {
  console.error("usage: bun shot.ts <draft.html> [--out file.png] [--width 1440] [--height 900] [--theme light|dark]");
  process.exit(2);
}
const theme = values.theme === "dark" ? "dark" : "light";
const width = Number(values.width);
const height = Number(values.height);
const file = resolve(input);
const out = resolve(values.out ?? join(dirname(file), `${basename(file, ".html")}-${theme}-${width}.png`));

function findChrome(): string | null {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    Bun.which("google-chrome"),
    Bun.which("chromium"),
    Bun.which("chromium-browser"),
  ];
  return candidates.find((p): p is string => !!p && existsSync(p)) ?? null;
}

const chrome = findChrome();
if (!chrome) {
  console.error("No Chrome or Chromium found. Set CHROME_PATH, or use a browser automation tool to screenshot instead.");
  process.exit(3);
}

mkdirSync(dirname(out), { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "design-shot-"));
let url = `${pathToFileURL(file).href}?theme=${theme}`;
// Headless Chrome never lays out narrower than 500 px, so a 390 px window only crops a 500 px page.
// Narrow widths render the draft in an iframe of the exact size; the image is then 500 px wide.
const MIN_WINDOW = 500;
if (width < MIN_WINDOW) {
  const frame = join(profile, "frame.html");
  writeFileSync(
    frame,
    `<!doctype html><body style="margin:0;background:#d4d4d8"><iframe src="${url}" style="display:block;border:0;width:${width}px;height:${height}px;background:#fff"></iframe></body>`,
  );
  url = pathToFileURL(frame).href;
}
const proc = Bun.spawnSync(
  [
    chrome,
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--window-size=${Math.max(width, MIN_WINDOW)},${height}`,
    `--virtual-time-budget=${Number(values.wait)}`,
    `--screenshot=${out}`,
    url,
  ],
  { stdout: "pipe", stderr: "pipe", timeout: 60_000 },
);
rmSync(profile, { recursive: true, force: true });

// A zero exit with no file, or a tiny file, is a failed render, not a screenshot.
const size = existsSync(out) ? statSync(out).size : 0;
if (proc.exitCode !== 0 || size < 2_000) {
  console.error(`Screenshot failed (exit ${proc.exitCode}, ${size} bytes).\n${proc.stderr.toString().slice(-1500)}`);
  process.exit(1);
}
console.log(out);
