// Which version each version was made from.
//
// A version names its parent in `meta.versions.v<N>.parent`. An entry without a parent
// marks a root on purpose. Drafts written before that field existed fall back to the
// previous version of the same draft, then to the draft-level `meta.parent`.
import { isDraftName } from "../../shared/drafts";
import { isRecord } from "../../shared/guards";
import { type Draft, isVersionNumber, type ParentLink, type VersionNode, versionKey } from "./types";

const ROOT: ParentLink = { parentKey: null, inferred: false, warning: "" };
const unlinked = (warning: string): ParentLink => ({ ...ROOT, warning });
const linked = (parentKey: string, inferred = false): ParentLink => ({ parentKey, inferred, warning: "" });

/**
 * @param drafts every draft on the canvas, to look up a legacy parent
 * @param exists whether a version key is on the canvas
 */
export function resolveParent(draft: Draft, version: number, drafts: Draft[], exists: (key: string) => boolean): ParentLink {
  if (draft.metaError) return ROOT;
  const { meta } = draft;
  const declared = meta.versions;
  if (Object.hasOwn(meta, "versions") && !isRecord(declared)) return unlinked("Invalid version metadata");

  const name = `v${version}`;
  if (isRecord(declared) && Object.hasOwn(declared, name)) {
    const entry = declared[name];
    if (!isRecord(entry)) return unlinked("Invalid version metadata");
    return Object.hasOwn(entry, "parent") ? declaredParent(draft.target, entry.parent, exists) : ROOT;
  }

  const previous = draft.versions[draft.versions.indexOf(version) - 1];
  if (previous !== undefined) return linked(versionKey(draft.target, draft.id, previous), true);
  if (Object.hasOwn(meta, "parent")) return legacyParent(draft, drafts);
  return meta.status === "baseline" ? ROOT : unlinked("Missing parent reference");
}

function declaredParent(target: string, parent: unknown, exists: (key: string) => boolean): ParentLink {
  if (!isRecord(parent) || !isDraftName(parent.draft) || !isVersionNumber(parent.version)) {
    return unlinked("Invalid parent reference");
  }
  const key = versionKey(target, parent.draft, parent.version);
  return exists(key) ? linked(key) : unlinked(`Missing parent: ${key}`);
}

/** `meta.parent` names a draft, not a version, so it only works when that draft has one version. */
function legacyParent(draft: Draft, drafts: Draft[]): ParentLink {
  const parentId = draft.meta.parent;
  if (parentId === null) return ROOT;
  if (!isDraftName(parentId)) return unlinked("Invalid legacy parent reference");
  const parent = drafts.find((candidate) => candidate.target === draft.target && candidate.id === parentId);
  if (!parent) return unlinked(`Missing parent draft: ${parentId}`);
  const [version, ...others] = parent.versions;
  if (version === undefined || others.length) return unlinked(`Ambiguous legacy parent: ${parentId} has multiple versions`);
  return linked(versionKey(draft.target, parentId, version));
}

/** Cuts every parent link that is part of a loop, so the graph can be laid out as a tree. */
export function breakCycles(nodes: VersionNode[]): void {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const settled = new Set<string>();
  for (const start of nodes) {
    const chain: VersionNode[] = [];
    const positionInChain = new Map<string, number>();
    let node: VersionNode | undefined = start;
    while (node && !settled.has(node.key) && !positionInChain.has(node.key)) {
      positionInChain.set(node.key, chain.length);
      chain.push(node);
      node = node.parentKey === null ? undefined : byKey.get(node.parentKey);
    }
    const loopStart = node && positionInChain.get(node.key);
    if (loopStart !== undefined) {
      for (const member of chain.slice(loopStart)) Object.assign(member, unlinked("Cycle in parent references"));
    }
    for (const member of chain) settled.add(member.key);
  }
}
