// One image with every draft side by side, so a whole round can be judged at a glance.
import { pathToFileURL } from "node:url";
import { MIN_WINDOW_WIDTH, type Viewport } from "./capture";

export interface SheetCell {
  /** Path of the screenshot to show. */
  image: string;
  caption: string;
}

export interface ContactSheet extends Viewport {
  html: string;
}

const MAX_COLUMNS = 3;
const THUMBNAIL_WIDTH = 600;
const CAPTION_HEIGHT = 44;
const GAP = 16;
const PADDING = 16;

/** The sheet as a page, with the window size that shows all of it. `shot` is the size of each screenshot. */
export function contactSheet(cells: SheetCell[], shot: Viewport): ContactSheet {
  const columns = Math.min(MAX_COLUMNS, Math.max(1, cells.length));
  const rows = Math.ceil(cells.length / columns);
  const cellHeight = Math.round((THUMBNAIL_WIDTH * shot.height) / Math.max(shot.width, MIN_WINDOW_WIDTH)) + CAPTION_HEIGHT;
  const figures = cells.map(({ image, caption }) => `<figure><img src="${pathToFileURL(image).href}"><figcaption>${plainText(caption)}</figcaption></figure>`);
  return {
    width: columns * THUMBNAIL_WIDTH + (columns - 1) * GAP + 2 * PADDING,
    height: rows * cellHeight + (rows - 1) * GAP + 2 * PADDING,
    html:
      `<!doctype html><body style="margin:0;padding:${PADDING}px;background:#a1a1aa;font:14px ui-sans-serif,system-ui,sans-serif">` +
      `<div style="display:grid;grid-template-columns:repeat(${columns},${THUMBNAIL_WIDTH}px);gap:${GAP}px">${figures.join("")}</div>` +
      "<style>figure{margin:0;background:#fff}img{display:block;width:100%}figcaption{padding:8px 10px;color:#18181b}</style></body>",
  };
}

/** Captions come from folder names and `meta.json`; markup characters are dropped, not escaped. */
function plainText(text: string): string {
  return text.replace(/[<>&]/g, "");
}
