// What the server reports about `.design/drafts`. The canvas page receives it as JSON.
/** `meta.json` as written by whoever made the draft. Nothing in it is trusted. */
export type DraftMeta = Record<string, unknown>;

export interface DraftSummary {
  target: string;
  id: string;
  meta: DraftMeta;
  /** Why `meta.json` could not be used, or null when it is fine or absent. */
  metaError: string | null;
  versions: number[];
  /** Version number to a fingerprint that changes when the file is rewritten. */
  versionHashes: Record<string, string>;
}

export interface TargetDrafts {
  target: string;
  drafts: DraftSummary[];
}

const DRAFT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const VERSION_FILE = /^v(\d+)\.html$/;

/** Target and draft folder names must be safe as one path segment and one URL segment. */
export function isDraftName(value: unknown): value is string {
  return typeof value === "string" && DRAFT_NAME.test(value);
}

/** The version number of a `v<N>.html` file name, or null for any other name. */
export function versionOfFile(fileName: string): number | null {
  const match = VERSION_FILE.exec(fileName);
  return match ? Number(match[1]) : null;
}

export function versionFile(version: number): string {
  return `v${version}.html`;
}
