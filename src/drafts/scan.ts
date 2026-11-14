// Reads `.design/drafts/<target>/<draft>/v<N>.html` into draft summaries.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { type DraftMeta, type DraftSummary, isDraftName, type TargetDrafts, versionOfFile } from "../shared/drafts";
import { isRecord } from "../shared/guards";
import { fileFingerprint, isDirectory, isMissingFile, readRegularFile, type Symlinks } from "./files";

const REVIEW_ORDER = ["baseline", "selected", "candidate", "rejected"];

/**
 * Every target that has at least one draft with a version, both in name order.
 * Linked folders and files are left out unless `symlinks` says to follow them.
 */
export function scanDrafts(draftsDir: string, symlinks: Symlinks = "refuse"): TargetDrafts[] {
  const targets: TargetDrafts[] = [];
  for (const target of readdirSync(draftsDir).filter(isDraftName).sort()) {
    const targetDir = join(draftsDir, target);
    const drafts: DraftSummary[] = [];
    for (const id of (listFolder(targetDir, "target", symlinks) ?? []).filter(isDraftName)) {
      const draft = readDraft(target, id, join(targetDir, id), symlinks);
      if (draft) drafts.push(draft);
    }
    if (drafts.length) targets.push({ target, drafts });
  }
  return targets;
}

/** The order drafts are reviewed in: baseline, then selected, candidates, rejected. */
export function inReviewOrder(targets: TargetDrafts[]): TargetDrafts[] {
  // A draft without a status is a candidate; an unknown status goes last.
  const rank = (draft: DraftSummary) => {
    const status = draft.meta.status ?? "candidate";
    const index = REVIEW_ORDER.findIndex((name) => name === status);
    return index === -1 ? REVIEW_ORDER.length : index;
  };
  return targets.map(({ target, drafts }) => ({
    target,
    drafts: [...drafts].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)),
  }));
}

function readDraft(target: string, id: string, dir: string, symlinks: Symlinks): DraftSummary | null {
  const files = listFolder(dir, "draft", symlinks);
  if (!files) return null;
  const versions: number[] = [];
  const versionHashes: Record<string, string> = {};
  for (const file of files) {
    const version = versionOfFile(file);
    if (version === null) continue;
    try {
      versionHashes[String(version)] = fileFingerprint(join(dir, file), symlinks);
      versions.push(version);
    } catch (error) {
      console.error(`Cannot inspect version ${join(dir, file)}:`, error);
    }
  }
  if (!versions.length) return null;
  versions.sort((a, b) => a - b);
  const { meta, error } = readMeta(dir, symlinks);
  return { target, id, meta, metaError: error, versions, versionHashes };
}

/** Entries of a target or draft folder in name order, or null when it is not a real folder. */
function listFolder(dir: string, kind: "target" | "draft", symlinks: Symlinks): string[] | null {
  try {
    if (!isDirectory(dir, symlinks)) return null;
    return readdirSync(dir).sort();
  } catch (error) {
    console.error(`Cannot scan ${kind} ${dir}:`, error);
    return null;
  }
}

function readMeta(dir: string, symlinks: Symlinks): { meta: DraftMeta; error: string | null } {
  try {
    const meta: unknown = JSON.parse(readRegularFile(join(dir, "meta.json"), symlinks));
    if (!isRecord(meta)) return { meta: {}, error: "meta.json must contain an object" };
    return { meta, error: null };
  } catch (error) {
    if (isMissingFile(error)) return { meta: {}, error: null };
    const reason = error instanceof Error ? error.message : String(error);
    return { meta: {}, error: `meta.json is not valid JSON or could not be read: ${reason}` };
  }
}
