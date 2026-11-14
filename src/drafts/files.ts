// File reads that never follow a symlink and never block on a FIFO or device.
// Drafts are written by tools and people; a draft folder is not trusted.
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";

const NOT_A_FILE = "not a regular file";

export function isDirectory(path: string): boolean {
  return lstatSync(path).isDirectory();
}

export function readRegularFile(path: string): string {
  if (!lstatSync(path).isFile()) throw new Error(NOT_A_FILE);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
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
export function fileFingerprint(path: string): string {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile()) throw new Error(NOT_A_FILE);
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
}

export function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}
