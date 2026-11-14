import { edgeId, type VersionNode } from "./types";

/** What a live update changed, by version key or edge id. */
export interface GraphChanges {
  addedNodes: Set<string>;
  addedEdges: Set<string>;
  /** Versions whose preview must be loaded again. */
  stalePreviews: Set<string>;
  /** The stale previews whose file is known to have been rewritten. */
  rewritten: Set<string>;
}

export function compareGraphs(before: VersionNode[], after: VersionNode[]): GraphChanges {
  const previous = new Map(before.map((node) => [node.key, node]));
  const previousEdges = new Set(before.map(edgeId));
  const changes: GraphChanges = { addedNodes: new Set(), addedEdges: new Set(), stalePreviews: new Set(), rewritten: new Set() };

  for (const node of after) {
    const edge = edgeId(node);
    if (edge && !previousEdges.has(edge)) changes.addedEdges.add(edge);
    const old = previous.get(node.key);
    if (!old) {
      changes.addedNodes.add(node.key);
      continue;
    }
    const fingerprint = node.versionHashes[node.version];
    const oldFingerprint = old.versionHashes[node.version];
    if (fingerprint && oldFingerprint && fingerprint === oldFingerprint) continue;
    // Without both fingerprints there is no telling, so the preview is reloaded to be safe.
    changes.stalePreviews.add(node.key);
    if (fingerprint && oldFingerprint) changes.rewritten.add(node.key);
  }
  return changes;
}
