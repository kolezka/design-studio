import { readFileSync } from "node:fs";

type Draft = { target: string; id: string; meta: Record<string, unknown> | null; metaError: string | null; versions: number[]; versionHashes?: Record<string, string> };
type Target = { target: string; drafts: Draft[] };

const template = readFileSync(new URL("./canvas-ui.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("./canvas-ui.css", import.meta.url), "utf8");
const script = readFileSync(new URL("./canvas-ui.browser.js", import.meta.url), "utf8");

export function graphPage(projectName: string, root: string, theme: string, width: number, height: number, targets: Target[]): string {
  const payload = JSON.stringify({ projectName, root, theme: theme === 'dark' ? 'dark' : 'light', width: Math.min(2560, Math.max(320, Number(width) || 1440)), height: Math.min(2400, Math.max(320, Number(height) || 900)), targets }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return template.replace("/* CANVAS_STYLES */", () => styles)
    .replace("/* CANVAS_SCRIPT */", () => script)
    .replace("CANVAS_PAYLOAD", () => payload);
}
