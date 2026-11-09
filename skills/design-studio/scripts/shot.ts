// Renders drafts with headless Chrome into PNGs the agent opens and looks at.
//   bun shot.ts <draft.html> [--out file.png] [--width 1440] [--height 900] [--theme light|dark]
//   bun shot.ts --all <.design dir> [--theme light,dark] [--width 1440] [--height 900]
// --all renders the latest version of every draft into shots/ and writes one contact sheet per theme.
// Exit 1: no screenshot. Exit 4: screenshots written, but a page threw (often a Tailwind compile error).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    all: { type: "string" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    theme: { type: "string" },
    wait: { type: "string", default: "4000" },
  },
});

const width = Number(values.width);
const height = Number(values.height);
// Headless Chrome never lays out narrower than 500 px, so a 390 px window only crops a 500 px page.
// Narrow widths render the draft in an iframe of the exact size; the image is then 500 px wide.
const MIN_WINDOW = 500;

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

interface Shot {
  out: string;
  ok: boolean;
  pageErrors: string[];
  failure?: string;
}

function shoot(url: string, out: string, w: number, h: number): Shot {
  mkdirSync(dirname(out), { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "design-shot-"));
  let target = url;
  if (w < MIN_WINDOW) {
    const frame = join(profile, "frame.html");
    writeFileSync(frame, `<!doctype html><body style="margin:0;background:#d4d4d8"><iframe src="${url}" style="display:block;border:0;width:${w}px;height:${h}px;background:#fff"></iframe></body>`);
    target = pathToFileURL(frame).href;
  }
  const proc = Bun.spawnSync(
    [
      chrome!,
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--enable-logging=stderr",
      "--v=0",
      `--user-data-dir=${profile}`,
      `--window-size=${Math.max(w, MIN_WINDOW)},${h}`,
      `--virtual-time-budget=${Number(values.wait)}`,
      `--screenshot=${out}`,
      target,
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  rmSync(profile, { recursive: true, force: true });
  const stderr = proc.stderr.toString();
  // Chrome logs page console output as `INFO:CONSOLE...] "message", source: ...`.
  const pageErrors = [...stderr.matchAll(/:CONSOLE[^\]]*\] "(.*)", source: (\S+)/g)]
    .map((m) => `${m[1]} (${m[2]})`)
    .filter((line) => /Uncaught|Error/.test(line));
  // A zero exit with no file, or a tiny file, is a failed render, not a screenshot.
  const size = existsSync(out) ? statSync(out).size : 0;
  if (proc.exitCode !== 0 || size < 2_000) return { out, ok: false, pageErrors, failure: `exit ${proc.exitCode}, ${size} bytes\n${stderr.slice(-1200)}` };
  return { out, ok: true, pageErrors };
}

function report(shots: Shot[]): never {
  let code = 0;
  for (const s of shots) {
    if (!s.ok) {
      console.error(`FAILED ${s.out}: ${s.failure}`);
      code = 1;
      continue;
    }
    console.log(s.out);
    for (const e of s.pageErrors) console.log(`  page error: ${e}`);
    if (s.pageErrors.length && code === 0) code = 4;
  }
  if (code === 4) console.log("A page threw while rendering. Tailwind errors leave the page unstyled: fix them before reviewing.");
  process.exit(code);
}

const themes = (values.theme ?? (values.all ? "light,dark" : "light")).split(",").map((t) => (t.trim() === "dark" ? "dark" : "light"));

if (!values.all) {
  const input = positionals[0];
  if (!input || !existsSync(input)) {
    console.error("usage: bun shot.ts <draft.html> [--out file.png] [--width 1440] [--height 900] [--theme light|dark]\n       bun shot.ts --all <.design dir>");
    process.exit(2);
  }
  const file = resolve(input);
  const theme = themes[0]!;
  const out = resolve(values.out ?? join(dirname(file), `${basename(file, ".html")}-${theme}-${width}x${height}.png`));
  report([shoot(`${pathToFileURL(file).href}?theme=${theme}`, out, width, height)]);
}

// --all: the latest version of every draft, then a contact sheet per theme.
const root = resolve(values.all!);
const draftsDir = join(root, "drafts");
if (!existsSync(draftsDir)) {
  console.error(`No drafts found: ${draftsDir} does not exist.`);
  process.exit(2);
}
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const latest: { target: string; draft: string; version: number; file: string; status: string }[] = [];
for (const target of readdirSync(draftsDir).sort()) {
  if (!SEGMENT.test(target) || !statSync(join(draftsDir, target)).isDirectory()) continue;
  for (const draft of readdirSync(join(draftsDir, target)).sort()) {
    const dir = join(draftsDir, target, draft);
    if (!SEGMENT.test(draft) || !statSync(dir).isDirectory()) continue;
    const versions = readdirSync(dir)
      .map((f) => /^v(\d+)\.html$/.exec(f))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));
    if (!versions.length) continue;
    const version = Math.max(...versions);
    let status = "candidate";
    const metaFile = join(dir, "meta.json");
    if (existsSync(metaFile)) {
      try {
        status = (JSON.parse(readFileSync(metaFile, "utf8")) as { status?: string }).status ?? status;
      } catch {
        status = "meta.json invalid";
      }
    }
    latest.push({ target, draft, version, file: join(dir, `v${version}.html`), status });
  }
}

const shots: Shot[] = [];
for (const theme of themes) {
  const cells: string[] = [];
  for (const d of latest) {
    const out = join(root, "shots", d.target, d.draft, `v${d.version}-${theme}-${width}x${height}.png`);
    const s = shoot(`${pathToFileURL(d.file).href}?theme=${theme}`, out, width, height);
    shots.push(s);
    const label = `${d.target} / ${d.draft} v${d.version} (${d.status})${s.pageErrors.length ? " PAGE ERROR" : ""}`;
    cells.push(`<figure><img src="${pathToFileURL(out).href}"><figcaption>${label.replace(/[<>&]/g, "")}</figcaption></figure>`);
  }
  const cols = Math.min(3, Math.max(1, latest.length));
  const thumb = 600;
  const cellHeight = Math.round((thumb * height) / Math.max(width, MIN_WINDOW)) + 44;
  const rows = Math.ceil(latest.length / cols);
  const sheetHtml = join(root, "shots", `.sheet-${theme}.html`);
  writeFileSync(
    sheetHtml,
    `<!doctype html><body style="margin:0;padding:16px;background:#a1a1aa;font:14px ui-sans-serif,system-ui,sans-serif"><div style="display:grid;grid-template-columns:repeat(${cols},${thumb}px);gap:16px">${cells.join("")}</div><style>figure{margin:0;background:#fff}img{display:block;width:100%}figcaption{padding:8px 10px;color:#18181b}</style></body>`,
  );
  const sheetOut = join(root, "shots", `sheet-${theme}-${width}x${height}.png`);
  shots.push(shoot(pathToFileURL(sheetHtml).href, sheetOut, cols * thumb + (cols - 1) * 16 + 32, rows * cellHeight + (rows - 1) * 16 + 32));
  rmSync(sheetHtml, { force: true });
}
report(shots);
