import { breakCycles, resolveParent } from "./lineage";
import { readDrafts } from "./read-drafts";
import { type VersionNode, versionKey } from "./types";
import { placeInVariants } from "./variants";

/** Turns the server's draft list into the version nodes the canvas draws. */
export function buildGraph(targets: unknown): VersionNode[] {
  const drafts = readDrafts(targets);
  const placements = placeInVariants(drafts);
  const keys = new Set(drafts.flatMap((draft) => draft.versions.map((version) => versionKey(draft.target, draft.id, version))));

  const nodes = drafts.flatMap((draft) =>
    draft.versions.map((version): VersionNode => ({
      ...draft,
      ...placements.get(draft)!,
      ...resolveParent(draft, version, drafts, (key) => keys.has(key)),
      version,
      key: versionKey(draft.target, draft.id, version),
    })),
  );
  breakCycles(nodes);
  return nodes;
}
