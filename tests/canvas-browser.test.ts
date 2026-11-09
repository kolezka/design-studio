import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Layout bugs (a preview frame with zero height) only show in a real browser, not in the HTML.
const CANVAS = join(import.meta.dir, "..", "skills", "design-studio", "scripts", "canvas.ts");
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  Bun.which("google-chrome"),
  Bun.which("chromium"),
].find((p): p is string => !!p && existsSync(p));

const procs: ReturnType<typeof Bun.spawn>[] = [];
afterEach(() => {
  for (const p of procs.splice(0)) p.kill();
});

test.skipIf(!CHROME)("preview frames have a height and scale the draft to the card", async () => {
  const root = mkdtempSync(join(tmpdir(), "canvas-browser-"));
  for (const id of ["a", "b"]) {
    const dir = join(root, ".design", "drafts", "home", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "v1.html"), `<!doctype html><body style="margin:0;background:#4f46e5;height:100vh">${id}</body>`);
  }
  const canvas = Bun.spawn(["bun", CANVAS, "--port", "0"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  procs.push(canvas);
  const reader = canvas.stdout.getReader();
  let text = "";
  while (!/http:\/\/127\.0\.0\.1:\d+\//.test(text)) {
    const { value, done } = await reader.read();
    if (done) throw new Error("canvas exited");
    text += new TextDecoder().decode(value);
  }
  const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(text)![0];

  const profile = mkdtempSync(join(tmpdir(), "canvas-browser-chrome-"));
  const chrome = Bun.spawnSync(
    [CHROME!, "--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, "--window-size=1600,1000", "--timeout=3000", "--dump-dom", `${url}?static=1`],
    { stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  rmSync(profile, { recursive: true, force: true });
  const dom = chrome.stdout.toString();
  const frames = [...dom.matchAll(/class="frame"[^>]*data-scale="([\d.]+)"[^>]*data-height="(\d+)"/g)].map((m) => ({ scale: Number(m[1]), height: Number(m[2]) }));
  expect(frames.length).toBe(2);
  for (const f of frames) {
    // A card is at least 480 px wide, so a 1440 x 900 draft scales by a third or more.
    expect(f.scale).toBeGreaterThan(0.3);
    expect(f.scale).toBeLessThan(1);
    expect(f.height).toBeGreaterThan(150);
    expect(Math.abs(f.height - 900 * f.scale)).toBeLessThan(3);
  }
});
