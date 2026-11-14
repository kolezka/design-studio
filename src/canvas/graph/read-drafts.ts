import { isDraftName, isRecord } from "../../shared/drafts";
import { type Draft, isVersionNumber } from "./types";

/**
 * Keeps the drafts that are well formed and drops the rest without failing.
 * The input is the server's JSON, so its shape is checked here, once.
 */
export function readDrafts(targets: unknown): Draft[] {
  if (!Array.isArray(targets)) return [];
  const drafts: Draft[] = [];
  for (const group of targets) {
    if (!isRecord(group) || !isDraftName(group.target) || !Array.isArray(group.drafts)) continue;
    for (const candidate of group.drafts) {
      const draft = readDraft(candidate, group.target);
      if (draft) drafts.push(draft);
    }
  }
  return drafts;
}

function readDraft(candidate: unknown, target: string): Draft | null {
  if (!isRecord(candidate) || !isDraftName(candidate.id) || candidate.target !== target) return null;
  if (!Array.isArray(candidate.versions)) return null;
  const versions = [...new Set(candidate.versions.filter(isVersionNumber))].sort((a, b) => a - b);
  if (!versions.length) return null;
  return {
    target,
    id: candidate.id,
    meta: isRecord(candidate.meta) ? candidate.meta : {},
    metaError: typeof candidate.metaError === "string" ? candidate.metaError : "",
    versions,
    versionHashes: isRecord(candidate.versionHashes) ? candidate.versionHashes : {},
  };
}
