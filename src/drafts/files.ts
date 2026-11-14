// File reads for draft folders, which are written by tools and people and are not trusted.
// Nothing here blocks on a FIFO or device, and by default nothing follows a symlink.
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, statSync } from "node:fs";

/**
 * `refuse` is for anything served over HTTP: a link must not lead out of the drafts folder.
 * `follow` reads the folder the way its owner would, for work that stays on this machine.
 */
export type Symlinks = "refuse" | "follow";

const NOT_A_FILE = "not a regular file";

export function isDirectory(path: string, symlinks: Symlinks = "refuse"): boolean {
  return statOf(path, symlinks).isDirectory();
}

export function readRegularFile(path: string, symlinks: Symlinks = "refuse"): string {
  if (!statOf(path, symlinks).isFile()) throw new Error(NOT_A_FILE);
  const noFollow = symlinks === "refuse" ? (constants.O_NOFOLLOW ?? 0) : 0;
  const descriptor = openSync(path, constants.O_RDONLY | noFollow | (constants.O_NONBLOCK ?? 0));
  try {
    // The path may have been swapped between the check and the open.
    if (!fstatSync(descriptor).isFile()) throw new Error(NOT_A_FILE);
    return readFileSync(descriptor, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Changes whenever the file is rewritten or replaced, without reading its content.
 * Two writes that leave every stat field equal are not told apart.
 */
export function fileFingerprint(path: string, symlinks: Symlinks = "refuse"): string {
  const stat = statOf(path, symlinks);
  if (!stat.isFile()) throw new Error(NOT_A_FILE);
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

export function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function statOf(path: string, symlinks: Symlinks) {
  return symlinks === "follow" ? statSync(path, { bigint: true }) : lstatSync(path, { bigint: true });
}
