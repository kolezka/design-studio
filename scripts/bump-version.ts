#!/usr/bin/env bun
// Bumps the plugin version in every manifest that carries it.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The Claude plugin manifest and the DSH adapter ship at the same version.
export const MANIFESTS = [".claude-plugin/plugin.json", "dsh/package.json"];
export const BUMPS = ["major", "minor", "patch"];

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function nextVersion(current: string, bump: string): string {
  if (!BUMPS.includes(bump)) throw new Error(`bump must be one of ${BUMPS.join(", ")} (got: ${bump})`);
  const parts = SEMVER.exec(current);
  if (!parts) throw new Error(`version is not X.Y.Z: ${current}`);
  const [major, minor, patch] = parts.slice(1).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Swaps the version in the file text, so the rest of the file keeps its formatting.
function withVersion(file: string, text: string, current: string, next: string): string {
  const field = new RegExp(`("version"\\s*:\\s*")${current.replaceAll(".", "\\.")}(")`, "g");
  const found = text.match(field)?.length ?? 0;
  if (found !== 1) throw new Error(`${file}: expected one "version": "${current}" field, found ${found}`);
  const updated = text.replace(field, `$1${next}$2`);
  const expected = JSON.stringify({ ...JSON.parse(text), version: next });
  if (JSON.stringify(JSON.parse(updated)) !== expected) throw new Error(`${file}: the bump changed more than the top-level version`);
  return updated;
}

export function bumpManifests(root: string, bump: string): string {
  const files = MANIFESTS.map((file) => {
    const text = readFileSync(join(root, file), "utf8");
    return { file, text, version: JSON.parse(text).version as unknown };
  });
  const current = files[0].version;
  if (typeof current !== "string") throw new Error(`${files[0].file} has no version`);
  const drifted = files.filter((entry) => entry.version !== current);
  if (drifted.length) {
    const seen = files.map((entry) => `${entry.file} ${entry.version}`).join(", ");
    throw new Error(`manifest versions differ, fix them by hand first: ${seen}`);
  }
  const next = nextVersion(current, bump);
  // Build every new file before writing any, so a failure leaves all of them untouched.
  const updates = files.map((entry) => ({ file: entry.file, text: withVersion(entry.file, entry.text, current, next) }));
  for (const update of updates) writeFileSync(join(root, update.file), update.text);
  return next;
}

if (import.meta.main) {
  const [bump, root = join(import.meta.dir, "..")] = process.argv.slice(2);
  try {
    if (!bump) throw new Error("usage: bun scripts/bump-version.ts <major|minor|patch> [repo root]");
    console.log(bumpManifests(root, bump));
  } catch (error) {
    console.error(`bump-version: ${(error as Error).message}`);
    process.exit(1);
  }
}
