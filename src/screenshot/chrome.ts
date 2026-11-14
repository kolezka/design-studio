import { existsSync } from "node:fs";

/** A Chromium-based browser that can run headless, or null when none is installed. */
export function findChrome(): string | null {
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
  return candidates.find((path): path is string => !!path && existsSync(path)) ?? null;
}
