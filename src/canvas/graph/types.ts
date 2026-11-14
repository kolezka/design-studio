import type { DraftMeta } from "../../shared/drafts";

/** One draft folder, after everything the server sent about it was checked. */
export interface Draft {
  target: string;
  id: string;
  meta: DraftMeta;
  /** Empty when `meta.json` is usable. */
  metaError: string;
  /** Ascending, without duplicates, never empty. */
  versions: number[];
  versionHashes: Record<string, unknown>;
}

/** Where a draft sits among the variants of a design. */
export interface VariantPlacement {
  /** The variant the draft declares, or null when it declares none that is valid. */
  variant: string | null;
  /** The variant this one was derived from, when that is declared consistently. */
  variantParent: string | null;
  variantWarnings: string[];
}

export interface ParentLink {
  /** Key of the version this one was made from, or null for a root. */
  parentKey: string | null;
  /** True when the parent is the previous version of the same draft, not a declared one. */
  inferred: boolean;
  /** Why no parent could be linked. Empty when there is nothing to report. */
  warning: string;
}

/** One version of one draft: a card on the canvas. */
export interface VersionNode extends Draft, VariantPlacement, ParentLink {
  version: number;
  /** `<target>/<draft>/v<N>`, unique on the canvas. */
  key: string;
}

export function versionKey(target: string, draftId: string, version: number): string {
  return `${target}/${draftId}/v${version}`;
}

export function isVersionNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/** Id of the edge into a node, or an empty string when it has no parent. */
export function edgeId(node: Pick<VersionNode, "key" | "parentKey">): string {
  return node.parentKey === null ? "" : JSON.stringify([node.parentKey, node.key]);
}
