import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Shot } from "../screenshot/capture";
import { findChrome } from "../screenshot/chrome";
import { type ShootOptions, shootAll, shootFile } from "../screenshot/shoot-drafts";
import { type Theme, themeFrom } from "../shared/bootstrap";
import { EXIT, CliError, wholeNumber } from "./exit";

const USAGE = `usage: design-studio shot <draft.html> [--out file.png] [--width 1440] [--height 900] [--theme light|dark]
       design-studio shot --all <design dir> [--theme light,dark] [--width 1440] [--height 900]`;

/** `design-studio shot`: renders drafts to PNGs and exits with what happened. */
export function runShot(args: string[]): never {
  const { values, positionals } = parseOptions(args);
  const chrome = findChrome();
  if (!chrome) {
    throw new CliError("No Chrome or Chromium found. Set CHROME_PATH, or use a browser automation tool to screenshot instead.", EXIT.noChrome);
  }
  const size = { width: wholeNumber("width", values.width, 1), height: wholeNumber("height", values.height, 1) };
  const settleMs = wholeNumber("wait", values.wait, 0);

  const [file] = positionals;
  const designDir = values.all ? resolve(values.all) : undefined;
  if (designDir === undefined && (!file || !existsSync(file))) throw new CliError(USAGE);
  if (designDir !== undefined && !existsSync(join(designDir, "drafts"))) {
    throw new CliError(`No drafts found: ${join(designDir, "drafts")} does not exist.`);
  }

  const options: ShootOptions = { chrome, settleMs, ...size };

  // A whole round is reviewed in both themes; a single draft in one.
  const themes = themesFrom(values.theme ?? (designDir === undefined ? "light" : "light,dark"));
  const shots = designDir === undefined ? [shootFile(file as string, themes[0] ?? "light", values.out, options)] : shootAll(designDir, themes, options);
  process.exit(report(shots));
}

function parseOptions(args: string[]) {
  try {
    return parseArgs({
      args,
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
  } catch (error) {
    throw new CliError(`${(error as Error).message}\n${USAGE}`);
  }
}

function themesFrom(list: string): Theme[] {
  return list.split(",").map((name) => themeFrom(name.trim()));
}

/** Prints one line per screenshot and returns the exit code for the whole run. */
function report(shots: Shot[]): number {
  let code: number = EXIT.ok;
  for (const shot of shots) {
    if (shot.failure !== null) {
      console.error(`FAILED ${shot.out}: ${shot.failure}`);
      code = EXIT.renderFailed;
      continue;
    }
    console.log(shot.out);
    for (const error of shot.pageErrors) console.log(`  page error: ${error}`);
    if (shot.pageErrors.length && code === EXIT.ok) code = EXIT.pageThrew;
  }
  if (code === EXIT.pageThrew) console.log("A page threw while rendering. Tailwind errors leave the page unstyled: fix them before reviewing.");
  return code;
}
