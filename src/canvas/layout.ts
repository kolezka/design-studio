// Where every card, header and edge goes. Pure: sizes come in, coordinates go out.
//
// Variants are stacked top to bottom, and inside a variant its views (targets).
// A version sits one column to the right of the version it was made from, and
// columns are shared by the whole canvas so lineage reads left to right everywhere.
import { edgeId, type VersionNode } from "./graph/types";

export interface Size {
  width: number;
  height: number;
}

export interface Box extends Size {
  x: number;
  y: number;
}

export interface Header {
  id: string;
  kind: "variant" | "view";
  label: string;
}

export interface ViewGroup {
  header: Header;
  nodes: VersionNode[];
}

export interface VariantGroup {
  header: Header;
  views: ViewGroup[];
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  inferred: boolean;
  /** SVG path data from the parent's right side to the child's left side. */
  path: string;
}

export interface Measurements {
  /** Size of a version's card, or undefined when it has no card yet. */
  card(key: string): Size | undefined;
  header(id: string): number;
}

export interface GraphLayout {
  cards: Map<string, Box>;
  /** Top of each header, by header id. Headers start at the left edge. */
  headers: Map<string, number>;
  edges: Edge[];
}

const COLUMN_GAP = 90;
const CARD_GAP = 90;
const BELOW_VARIANT_HEADER = 24;
const BELOW_VIEW_HEADER = 16;
const BELOW_VIEW = 40;
const BELOW_VARIANT = 40;
const MAX_BEND = 18;

/** Variants in name order (drafts without one first), each with its views in name order. */
export function groupNodes(nodes: VersionNode[]): VariantGroup[] {
  const variants = new Map<string, Map<string, VersionNode[]>>();
  for (const node of nodes) {
    const views = getOrAdd(variants, node.variant ?? "", () => new Map<string, VersionNode[]>());
    getOrAdd(views, node.target, () => []).push(node);
  }
  return sortedByName(variants).map(([variant, views]) => {
    // Every draft of a variant carries the same variant parent.
    const origin = views.values().next().value?.[0]?.variantParent;
    return {
      header: {
        id: JSON.stringify([variant]),
        kind: "variant",
        label: (variant ? `Variant: ${variant}` : "Unassigned variant") + (origin ? ` · From variant: ${origin}` : ""),
      },
      views: sortedByName(views).map(([view, members]) => ({
        header: { id: JSON.stringify([variant, view]), kind: "view", label: `View: ${view}` },
        nodes: members,
      })),
    };
  });
}

export function layoutGraph(nodes: VersionNode[], groups: VariantGroup[], measure: Measurements): GraphLayout {
  const depthOf = depthLookup(nodes);
  const columns = measureColumns(nodes, depthOf, measure);
  const cards = new Map<string, Box>();
  const headers = new Map<string, number>();

  let y = 0;
  for (const variant of groups) {
    headers.set(variant.header.id, y);
    y += measure.header(variant.header.id) + BELOW_VARIANT_HEADER;
    for (const view of variant.views) {
      headers.set(view.header.id, y);
      y += measure.header(view.header.id) + BELOW_VIEW_HEADER;
      y = placeView(view.nodes, y, { depthOf, columns, measure, cards }) + BELOW_VIEW;
    }
    y += BELOW_VARIANT;
  }
  return { cards, headers, edges: connect(nodes, cards, depthOf, columns) };
}

interface Column {
  x: number;
  width: number;
}

interface Placement {
  depthOf: (node: VersionNode) => number;
  columns: Map<number, Column>;
  measure: Measurements;
  cards: Map<string, Box>;
}

/** Stacks a view's cards in their columns from `top` down and returns where the view ends. */
function placeView(nodes: VersionNode[], top: number, { depthOf, columns, measure, cards }: Placement): number {
  const nextFreeY = new Map<number, number>();
  for (const node of nodes) {
    const size = measure.card(node.key);
    if (!size) continue;
    const depth = depthOf(node);
    const y = nextFreeY.get(depth) ?? top;
    cards.set(node.key, { x: columns.get(depth)?.x ?? 0, y, ...size });
    nextFreeY.set(depth, y + size.height + CARD_GAP);
  }
  return Math.max(top, ...nextFreeY.values());
}

/** How many versions lie between a node and the root of its lineage. */
function depthLookup(nodes: VersionNode[]): (node: VersionNode) => number {
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const depths = new Map<string, number>();
  const depthOf = (node: VersionNode): number => {
    let depth = depths.get(node.key);
    if (depth === undefined) {
      const parent = node.parentKey === null ? undefined : byKey.get(node.parentKey);
      depth = parent ? depthOf(parent) + 1 : 0;
      depths.set(node.key, depth);
    }
    return depth;
  };
  return depthOf;
}

/** Each column is as wide as its widest card. */
function measureColumns(nodes: VersionNode[], depthOf: (node: VersionNode) => number, measure: Measurements): Map<number, Column> {
  const widths = new Map<number, number>();
  for (const node of nodes) {
    const size = measure.card(node.key);
    if (size) widths.set(depthOf(node), Math.max(widths.get(depthOf(node)) ?? 0, size.width));
  }
  const columns = new Map<number, Column>();
  let x = 0;
  for (let depth = 0; depth <= Math.max(-1, ...widths.keys()); depth++) {
    const width = widths.get(depth) ?? 0;
    columns.set(depth, { x, width });
    x += width + COLUMN_GAP;
  }
  return columns;
}

function connect(nodes: VersionNode[], cards: Map<string, Box>, depthOf: (node: VersionNode) => number, columns: Map<number, Column>): Edge[] {
  const edges: Edge[] = [];
  for (const node of nodes) {
    const to = cards.get(node.key);
    const from = node.parentKey === null ? undefined : cards.get(node.parentKey);
    const parentColumn = columns.get(depthOf(node) - 1);
    if (node.parentKey === null || !to || !from || !parentColumn) continue;
    // Edges turn in the middle of the gap between the two columns.
    const laneX = (parentColumn.x + parentColumn.width + to.x) / 2;
    edges.push({ id: edgeId(node), source: node.parentKey, target: node.key, inferred: node.inferred, path: edgePath(from, to, laneX) });
  }
  return edges;
}

/** Out of the parent, along a vertical lane, into the child, with rounded corners. */
function edgePath(from: Box, to: Box, laneX: number): string {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height / 2;
  const direction = Math.sign(endY - startY);
  const bend = Math.min(MAX_BEND, Math.abs(endY - startY) / 2);
  return [
    `M ${startX} ${startY}`,
    `L ${laneX - bend} ${startY}`,
    `Q ${laneX} ${startY} ${laneX} ${startY + direction * bend}`,
    `L ${laneX} ${endY - direction * bend}`,
    `Q ${laneX} ${endY} ${laneX + bend} ${endY}`,
    `L ${to.x} ${endY}`,
  ].join(" ");
}

function sortedByName<Value>(entries: Map<string, Value>): [string, Value][] {
  return [...entries].sort(([a], [b]) => a.localeCompare(b));
}

function getOrAdd<Key, Value>(map: Map<Key, Value>, key: Key, create: () => Value): Value {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
}
