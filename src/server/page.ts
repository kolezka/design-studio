import { readFileSync } from "node:fs";
import { type CanvasBootstrap, themeFrom } from "../shared/bootstrap";
import type { TargetDrafts } from "../shared/drafts";
import { bundleInlineScript } from "./browser-bundle";

const asset = (name: string) => new URL(`../canvas/${name}`, import.meta.url);
const template = readFileSync(asset("page.html"), "utf8");
const styles = readFileSync(asset("page.css"), "utf8");
const script = await bundleInlineScript(asset("main.ts"));

const PLACEHOLDERS = /\/\* CANVAS_STYLES \*\/|\/\* CANVAS_SCRIPT \*\/|CANVAS_PAYLOAD/g;
const DEFAULT_PREVIEW = { width: 1440, height: 900 };
const PREVIEW_LIMITS = { minimum: 320, maximumWidth: 2560, maximumHeight: 2400 };

export interface CanvasPage {
  projectName: string;
  /** Absolute path of the design directory, shown as a tooltip. */
  root: string;
  theme: unknown;
  /** Requested preview size. Anything that is not a usable number falls back to the default. */
  width: unknown;
  height: unknown;
  targets: TargetDrafts[];
}

/** The whole canvas as one HTML document: styles, script and data inline. */
export function renderCanvasPage(page: CanvasPage): string {
  const bootstrap: CanvasBootstrap = {
    projectName: page.projectName,
    root: page.root,
    theme: themeFrom(page.theme),
    width: previewSize(page.width, DEFAULT_PREVIEW.width, PREVIEW_LIMITS.maximumWidth),
    height: previewSize(page.height, DEFAULT_PREVIEW.height, PREVIEW_LIMITS.maximumHeight),
    targets: page.targets,
  };
  const parts: Record<string, string> = {
    "/* CANVAS_STYLES */": styles,
    "/* CANVAS_SCRIPT */": script,
    CANVAS_PAYLOAD: inlineJson(bootstrap),
  };
  // One pass over the template, so nothing inside the inserted data is ever replaced.
  return template.replace(PLACEHOLDERS, (placeholder) => parts[placeholder] ?? placeholder);
}

function previewSize(requested: unknown, fallback: number, maximum: number): number {
  return Math.min(maximum, Math.max(PREVIEW_LIMITS.minimum, Number(requested) || fallback));
}

/** JSON that is safe inside a `<script>`: it cannot close the tag or end a line early. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
