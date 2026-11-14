// Screenshots of drafts: one file, or the latest version of every draft plus contact sheets.
import { rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { scanDrafts } from "../drafts/scan";
import type { Theme } from "../shared/bootstrap";
import { type DraftSummary, versionFile } from "../shared/drafts";
import { capture, type Shot, type Viewport } from "./capture";
import { contactSheet, type SheetCell } from "./contact-sheet";

export interface ShootOptions extends Viewport {
  chrome: string;
  settleMs: number;
}

/** Screenshots one draft file. Without `out`, the PNG is written beside the draft. */
export function shootFile(file: string, theme: Theme, out: string | undefined, options: ShootOptions): Shot {
  const draft = resolve(file);
  const name = `${basename(draft, ".html")}-${theme}-${sizeLabel(options)}.png`;
  return shoot(draft, theme, resolve(out ?? join(dirname(draft), name)), options);
}

/**
 * Screenshots the latest version of every draft under `root/drafts` into
 * `root/shots/<target>/<draft>/`, then one contact sheet per theme into `root/shots/`.
 */
export function shootAll(root: string, themes: Theme[], options: ShootOptions): Shot[] {
  const shotsDir = join(root, "shots");
  const drafts = scanDrafts(join(root, "drafts")).flatMap((target) => target.drafts);
  const shots: Shot[] = [];

  for (const theme of themes) {
    const cells: SheetCell[] = [];
    for (const draft of drafts) {
      const version = Math.max(...draft.versions);
      const out = join(shotsDir, draft.target, draft.id, `v${version}-${theme}-${sizeLabel(options)}.png`);
      const shot = shoot(join(root, "drafts", draft.target, draft.id, versionFile(version)), theme, out, options);
      shots.push(shot);
      const flag = shot.pageErrors.length ? " PAGE ERROR" : "";
      cells.push({ image: out, caption: `${draft.target} / ${draft.id} v${version} (${statusOf(draft)})${flag}` });
    }
    shots.push(shootSheet(cells, join(shotsDir, `sheet-${theme}-${sizeLabel(options)}.png`), options));
  }
  return shots;
}

function shoot(draftFile: string, theme: Theme, out: string, { chrome, width, height, settleMs }: ShootOptions): Shot {
  return capture(chrome, { url: `${pathToFileURL(draftFile).href}?theme=${theme}`, out, width, height, settleMs });
}

function shootSheet(cells: SheetCell[], out: string, options: ShootOptions): Shot {
  const sheet = contactSheet(cells, options);
  // Chrome needs the sheet as a file. It sits beside the images it shows and goes away afterwards.
  const page = join(dirname(out), `.${basename(out, ".png")}.html`);
  writeFileSync(page, sheet.html);
  try {
    return capture(options.chrome, { url: pathToFileURL(page).href, out, width: sheet.width, height: sheet.height, settleMs: options.settleMs });
  } finally {
    rmSync(page, { force: true });
  }
}

function statusOf(draft: DraftSummary): string {
  if (draft.metaError) return "meta.json invalid";
  return typeof draft.meta.status === "string" ? draft.meta.status : "candidate";
}

function sizeLabel({ width, height }: Viewport): string {
  return `${width}x${height}`;
}
