import { describe, expect, test } from "bun:test";
import { buildGraph } from "../../src/canvas/graph/build";
import { groupNodes, layoutGraph, type Measurements, type Size } from "../../src/canvas/layout";

type Meta = Record<string, unknown>;

const from = (draftId: string, version: number) => ({ parent: { draft: draftId, version } });

function drafts(target: string, entries: [id: string, versions: number[], meta: Meta][]) {
  return { target, drafts: entries.map(([id, versions, meta]) => ({ target, id, meta, metaError: null, versions, versionHashes: {} })) };
}

const CARD: Size = { width: 420, height: 300 };
const HEADER = 20;

/** Every card the same size unless `sizes` says otherwise. */
function measure(sizes: Record<string, Size | undefined> = {}): Measurements {
  return { card: (key) => (key in sizes ? sizes[key] : CARD), header: () => HEADER };
}

function lay(targets: unknown, sizes?: Record<string, Size | undefined>) {
  const nodes = buildGraph(targets);
  const groups = groupNodes(nodes);
  return { nodes, groups, layout: layoutGraph(nodes, groups, measure(sizes)) };
}

describe("grouping", () => {
  test("unassigned drafts come first, then variants and views in name order", () => {
    const { groups } = lay([
      drafts("settings", [["b", [1], { variant: "calm" }], ["loose", [1], {}]]),
      drafts("home", [["a", [1], { variant: "calm" }], ["c", [1], { variant: "bold", variantParent: "calm" }]]),
    ]);
    expect(groups.map((group) => group.header.label)).toEqual(["Unassigned variant", "Variant: bold · From variant: calm", "Variant: calm"]);
    expect(groups.map((group) => group.views.map((view) => view.header.label))).toEqual([["View: settings"], ["View: home"], ["View: home", "View: settings"]]);
    expect(groups[2]?.views[0]?.nodes.map((node) => node.key)).toEqual(["home/a/v1"]);
  });

  test("header ids are unique across variants and views that share a name", () => {
    const { groups } = lay([drafts("home", [["a", [1], { variant: "home" }], ["b", [1], {}]])]);
    const ids = groups.flatMap((group) => [group.header.id, ...group.views.map((view) => view.header.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(groups.map((group) => group.header.kind)).toEqual(["variant", "variant"]);
  });
});

describe("placing cards", () => {
  test("a version sits one column to the right of the version it came from", () => {
    const { layout } = lay([drafts("home", [["current", [1], { status: "baseline" }], ["bold", [1, 2], { versions: { v1: from("current", 1), v2: from("bold", 1) } }]])]);
    const top = HEADER + 24 + HEADER + 16;
    expect(layout.cards.get("home/current/v1")).toEqual({ x: 0, y: top, ...CARD });
    expect(layout.cards.get("home/bold/v1")).toEqual({ x: 510, y: top, ...CARD });
    expect(layout.cards.get("home/bold/v2")).toEqual({ x: 1020, y: top, ...CARD });
  });

  test("siblings stack in their column with a gap", () => {
    const { layout } = lay([drafts("home", [["current", [1], { status: "baseline" }], ["a", [1], { versions: { v1: from("current", 1) } }], ["b", [1], { versions: { v1: from("current", 1) } }]])], { "home/a/v1": { width: 420, height: 500 } });
    const a = layout.cards.get("home/a/v1")!;
    const b = layout.cards.get("home/b/v1")!;
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y + 500 + 90);
  });

  test("columns are shared by the whole canvas and as wide as their widest card", () => {
    const { layout } = lay(
      [
        drafts("home", [["current", [1], { status: "baseline" }], ["next", [1], { versions: { v1: from("current", 1) } }]]),
        drafts("settings", [["current", [1], { status: "baseline" }], ["next", [1], { versions: { v1: from("current", 1) } }]]),
      ],
      { "settings/current/v1": { width: 600, height: 300 } },
    );
    expect(layout.cards.get("home/next/v1")?.x).toBe(690);
    expect(layout.cards.get("settings/next/v1")?.x).toBe(690);
  });

  test("the next view starts below the tallest column of the one above", () => {
    const { layout, groups } = lay(
      [
        drafts("home", [["current", [1], { status: "baseline" }], ["a", [1], { versions: { v1: from("current", 1) } }], ["b", [1], { versions: { v1: from("current", 1) } }]]),
        drafts("settings", [["current", [1], { status: "baseline" }]]),
      ],
    );
    const [home, settings] = groups[0]!.views;
    const homeTop = layout.headers.get(home!.header.id)! + HEADER + 16;
    // Two cards and their gaps in the second column, then the space below a view.
    expect(layout.headers.get(settings!.header.id)).toBe(homeTop + 2 * (300 + 90) + 40);
  });

  test("headers of the next variant start below the last view plus both gaps", () => {
    const { layout, groups } = lay([drafts("home", [["a", [1], { status: "baseline" }], ["b", [1], { status: "baseline", variant: "calm" }]])]);
    const [unassigned, calm] = groups;
    expect(layout.headers.get(unassigned!.header.id)).toBe(0);
    const cardTop = HEADER + 24 + HEADER + 16;
    expect(layout.headers.get(calm!.header.id)).toBe(cardTop + 300 + 90 + 40 + 40);
  });

  test("a version without a card yet takes no room and gets no edge", () => {
    const { layout } = lay([drafts("home", [["current", [1], { status: "baseline" }], ["new", [1], { versions: { v1: from("current", 1) } }]])], { "home/new/v1": undefined });
    expect([...layout.cards.keys()]).toEqual(["home/current/v1"]);
    expect(layout.edges).toEqual([]);
  });

  test("an empty graph lays out to nothing", () => {
    const { layout } = lay([]);
    expect(layout).toEqual({ cards: new Map(), headers: new Map(), edges: [] });
  });
});

describe("edges", () => {
  test("a level edge is a straight line through the middle of the gap", () => {
    const { layout } = lay([drafts("home", [["current", [1], { status: "baseline" }], ["next", [1], { versions: { v1: from("current", 1) } }]])]);
    const [edge] = layout.edges;
    const y = HEADER + 24 + HEADER + 16 + 150;
    expect(edge).toMatchObject({ source: "home/current/v1", target: "home/next/v1", inferred: false, id: JSON.stringify(["home/current/v1", "home/next/v1"]) });
    expect(edge?.path).toBe(`M 420 ${y} L 465 ${y} Q 465 ${y} 465 ${y} L 465 ${y} Q 465 ${y} 465 ${y} L 510 ${y}`);
  });

  test("an edge to a lower card bends down by at most 18", () => {
    const { layout } = lay([drafts("home", [["current", [1], { status: "baseline" }], ["a", [1], { versions: { v1: from("current", 1) } }], ["b", [1], { versions: { v1: from("current", 1) } }]])]);
    const edge = layout.edges.find((candidate) => candidate.target === "home/b/v1")!;
    const startY = HEADER + 24 + HEADER + 16 + 150;
    const endY = startY + 390;
    expect(edge.path).toBe(`M 420 ${startY} L 447 ${startY} Q 465 ${startY} 465 ${startY + 18} L 465 ${endY - 18} Q 465 ${endY} 483 ${endY} L 510 ${endY}`);
  });

  test("an inferred link is marked as such", () => {
    const { layout } = lay([drafts("home", [["old", [1, 2], { status: "baseline" }]])]);
    expect(layout.edges.map((edge) => edge.inferred)).toEqual([true]);
  });
});
