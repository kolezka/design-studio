// A variant is a design direction shared by drafts of several targets. Drafts opt in
// with `meta.variant`, and may name the variant theirs came from in `meta.variantParent`.
// Nothing is inferred from draft names.
import { isDraftName } from "../../shared/drafts";
import type { Draft, VariantPlacement } from "./types";

interface Variant {
  drafts: Draft[];
  /** Every parent its drafts declare. null stands for a draft that declares none. */
  declaredParents: Set<string | null>;
  hasInvalidParent: boolean;
  parent: string | null;
  warning: string;
}

export function placeInVariants(drafts: Draft[]): Map<Draft, VariantPlacement> {
  const variants = collectVariants(drafts);
  for (const variant of variants.values()) settleParent(variant, variants);
  for (const name of variantsInCycles(variants)) variants.get(name)!.warning = "Cycle in variant parents";

  const placements = new Map<Draft, VariantPlacement>();
  for (const draft of drafts) {
    const name = declaredVariant(draft);
    const variant = name === null ? undefined : variants.get(name);
    const variantWarnings = declarationWarnings(draft);
    if (variant?.warning) variantWarnings.push(variant.warning);
    placements.set(draft, {
      variant: name,
      variantParent: variant && !variant.warning ? variant.parent : null,
      variantWarnings,
    });
  }
  return placements;
}

function declaredVariant(draft: Draft): string | null {
  return isDraftName(draft.meta.variant) ? draft.meta.variant : null;
}

function declarationWarnings(draft: Draft): string[] {
  const warnings: string[] = [];
  const variant = declaredVariant(draft);
  if (Object.hasOwn(draft.meta, "variant") && variant === null) warnings.push("Invalid variant");
  if (Object.hasOwn(draft.meta, "variantParent")) {
    if (!isDraftName(draft.meta.variantParent)) warnings.push("Invalid variant parent");
    else if (variant === null) warnings.push("Variant parent without valid variant");
  }
  return warnings;
}

function collectVariants(drafts: Draft[]): Map<string, Variant> {
  const variants = new Map<string, Variant>();
  for (const draft of drafts) {
    const name = declaredVariant(draft);
    if (name === null) continue;
    let variant = variants.get(name);
    if (!variant) {
      variant = { drafts: [], declaredParents: new Set(), hasInvalidParent: false, parent: null, warning: "" };
      variants.set(name, variant);
    }
    variant.drafts.push(draft);
    const parent = draft.meta.variantParent;
    if (!Object.hasOwn(draft.meta, "variantParent")) variant.declaredParents.add(null);
    else if (isDraftName(parent)) variant.declaredParents.add(parent);
    else variant.hasInvalidParent = true;
  }
  return variants;
}

/** A variant has a parent only when all of its drafts agree on one that exists. */
function settleParent(variant: Variant, variants: Map<string, Variant>): void {
  const parents = [...variant.declaredParents];
  const only = parents[0] ?? null;
  if (parents.length > 1) {
    variant.warning = `Conflicting variant parents: ${parents.map((parent) => parent ?? "(none)").join(", ")}`;
  } else if (variant.hasInvalidParent) {
    variant.warning = "Invalid variant parent declaration";
  } else if (only !== null && !variants.has(only)) {
    variant.warning = `Missing parent variant: ${only}`;
  } else {
    variant.parent = only;
  }
}

function variantsInCycles(variants: Map<string, Variant>): Set<string> {
  const inCycle = new Set<string>();
  for (const start of variants.keys()) {
    const walked = new Set<string>();
    let name: string | null = start;
    while (name !== null && !walked.has(name)) {
      walked.add(name);
      name = variants.get(name)?.parent ?? null;
    }
    // The walk came back to a variant it had passed: everything from there on is the cycle.
    for (let member = name; member !== null && !inCycle.has(member); member = variants.get(member)?.parent ?? null) {
      inCycle.add(member);
    }
  }
  return inCycle;
}
