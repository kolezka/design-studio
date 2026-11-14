import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startCanvasServer } from "../server/canvas-server";
import { CliError, wholeNumber } from "./exit";

/** `design-studio canvas`: serves the canvas until the process is killed. */
export function runCanvas(args: string[]): void {
  const { values } = parseOptions(args);
  const root = resolve(values.dir);
  const draftsDir = join(root, "drafts");
  if (!existsSync(draftsDir)) throw new CliError(`No drafts found: ${draftsDir} does not exist.`);

  const server = startCanvasServer({ root, port: wholeNumber("port", values.port, 0) });
  const address = `http://127.0.0.1:${server.port}/`;
  console.log(`Design canvas on ${address} (${root}). Stop it with: kill ${process.pid}`);
  if (values.open) openInBrowser(address);
}

function parseOptions(args: string[]) {
  try {
    return parseArgs({
      args,
      options: {
        dir: { type: "string", default: ".design" },
        port: { type: "string", default: "4870" },
        open: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    throw new CliError(`${(error as Error).message}\nusage: design-studio canvas [--dir .design] [--port 4870] [--open]`);
  }
}

function openInBrowser(address: string): void {
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  Bun.spawn([opener, address], { stdout: "ignore", stderr: "ignore" });
}
