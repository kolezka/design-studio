import { describe, expect, test } from "bun:test";
import { buildGraph } from "../../src/canvas/graph/build";
import { compareGraphs } from "../../src/canvas/graph/changes";
import type { VersionNode } from "../../src/canvas/graph/types";

type Meta = Record<string, unknown>;

function draft(id: string, versions: number[], meta: Meta = {}, extra: Record<string, unknown> = {}) {
  return { target: "home", id, meta, metaError: null, versions, versionHashes: {}, ...extra };
}

function graph(...drafts: ReturnType<typeof draft>[]): Map<string, VersionNode> {
  return new Map(buildGraph([{ target: "home", drafts }]).map((node) => [node.key, node]));
}

const from = (draftId: string, version: number) => ({ parent: { draft: draftId, version } });

describe("reading the server's draft list", () => {
  test("anything that is not a list of targets gives an empty graph", () => {
    for (const input of [null, undefined, "drafts", 7, {}, [null, 1, "x", { target: "home" }, { target: "home", drafts: "none" }]]) {
      expect(buildGraph(input)).toEqual([]);
    }
  });

  test("drafts with unsafe names or a foreign target are dropped, the rest stay", () => {
    const nodes = buildGraph([
      { target: "../etc", drafts: [draft("a", [1])] },
      { target: "home", drafts: [draft("ok", [1]), draft("bad name", [1]), { ...draft("stray", [1]), target: "other" }, null, draft("empty", [])] },
    ]);
    expect(nodes.map((node) => node.key)).toEqual(["home/ok/v1"]);
  });

  test("versions are deduplicated, sorted, and limited to whole numbers from zero", () => {
    const nodes = buildGraph([{ target: "home", drafts: [draft("a", [3, 1, 3, -1, 2.5, "2" as unknown as number, 0])] }]);
    expect(nodes.map((node) => node.version)).toEqual([0, 1, 3]);
    expect(nodes[0]?.versions).toEqual([0, 1, 3]);
  });

  test("unusable meta and fingerprints become empty objects", () => {
    const [node] = buildGraph([{ target: "home", drafts: [draft("a", [1], [] as unknown as Meta, { versionHashes: "x", metaError: 5 })] }]);
    expect(node).toMatchObject({ meta: {}, versionHashes: {}, metaError: "" });
  });
});

describe("version parents", () => {
  test("a declared parent links to that exact version", () => {
    const nodes = graph(draft("current", [1], { status: "baseline" }), draft("bold", [1, 2], { versions: { v1: from("current", 1), v2: from("bold", 1) } }));
    expect(nodes.get("home/bold/v1")).toMatchObject({ parentKey: "home/current/v1", inferred: false, warning: "" });
    expect(nodes.get("home/bold/v2")).toMatchObject({ parentKey: "home/bold/v1", inferred: false, warning: "" });
    expect(nodes.get("home/current/v1")).toMatchObject({ parentKey: null, warning: "" });
  });

  test("an entry without a parent is a root on purpose", () => {
    const nodes = graph(draft("fresh", [1, 2], { versions: { v1: {}, v2: {} } }));
    expect(nodes.get("home/fresh/v1")).toMatchObject({ parentKey: null, warning: "" });
    // Not even the previous version is assumed.
    expect(nodes.get("home/fresh/v2")).toMatchObject({ parentKey: null, inferred: false, warning: "" });
  });

  test("without an entry, the previous version of the same draft is inferred", () => {
    const nodes = graph(draft("old", [1, 2, 5], { status: "baseline" }));
    expect(nodes.get("home/old/v2")).toMatchObject({ parentKey: "home/old/v1", inferred: true });
    expect(nodes.get("home/old/v5")).toMatchObject({ parentKey: "home/old/v2", inferred: true });
  });

  test("a legacy draft-level parent works only when that draft has one version", () => {
    const nodes = graph(
      draft("current", [1], { status: "baseline" }),
      draft("many", [1, 2], { status: "baseline" }),
      draft("child", [1], { parent: "current" }),
      draft("unsure", [1], { parent: "many" }),
      draft("orphan", [1], { parent: "gone" }),
      draft("odd", [1], { parent: 4 }),
      draft("root", [1], { parent: null }),
    );
    expect(nodes.get("home/child/v1")).toMatchObject({ parentKey: "home/current/v1", inferred: false, warning: "" });
    expect(nodes.get("home/unsure/v1")).toMatchObject({ parentKey: null, warning: "Ambiguous legacy parent: many has multiple versions" });
    expect(nodes.get("home/orphan/v1")).toMatchObject({ parentKey: null, warning: "Missing parent draft: gone" });
    expect(nodes.get("home/odd/v1")).toMatchObject({ parentKey: null, warning: "Invalid legacy parent reference" });
    expect(nodes.get("home/root/v1")).toMatchObject({ parentKey: null, warning: "" });
  });

  test("a first version with no source is flagged unless it is the baseline", () => {
    const nodes = graph(draft("current", [1], { status: "baseline" }), draft("loose", [1]));
    expect(nodes.get("home/current/v1")?.warning).toBe("");
    expect(nodes.get("home/loose/v1")?.warning).toBe("Missing parent reference");
  });

  test("broken declarations are reported and never linked", () => {
    const nodes = graph(
      draft("a", [1], { versions: "v1" }),
      draft("b", [1], { versions: { v1: "current" } }),
      draft("c", [1], { versions: { v1: { parent: "current/v1" } } }),
      draft("d", [1], { versions: { v1: from("../x", 1) } }),
      draft("e", [1], { versions: { v1: from("current", 9) } }),
      draft("f", [1], { versions: { v1: { parent: { draft: "current", version: "1" } } } }),
    );
    expect(nodes.get("home/a/v1")?.warning).toBe("Invalid version metadata");
    expect(nodes.get("home/b/v1")?.warning).toBe("Invalid version metadata");
    expect(nodes.get("home/c/v1")?.warning).toBe("Invalid parent reference");
    expect(nodes.get("home/d/v1")?.warning).toBe("Invalid parent reference");
    expect(nodes.get("home/e/v1")?.warning).toBe("Missing parent: home/current/v9");
    expect(nodes.get("home/f/v1")?.warning).toBe("Invalid parent reference");
    for (const node of nodes.values()) expect(node.parentKey).toBeNull();
  });

  test("a parent in another target does not count", () => {
    const nodes = buildGraph([
      { target: "home", drafts: [draft("current", [1], { status: "baseline" })] },
      { target: "settings", drafts: [{ ...draft("calm", [1], { versions: { v1: from("current", 1) } }), target: "settings" }] },
    ]);
    expect(nodes.find((node) => node.key === "settings/calm/v1")?.warning).toBe("Missing parent: settings/current/v1");
  });

  test("a draft with unreadable metadata gets no parent and no lineage warning", () => {
    const nodes = graph(draft("broken", [1, 2], {}, { metaError: "meta.json must contain an object" }));
    expect(nodes.get("home/broken/v2")).toMatchObject({ parentKey: null, inferred: false, warning: "", metaError: "meta.json must contain an object" });
  });

  test("every link of a loop is cut, and versions hanging off it keep theirs", () => {
    // One tail is read before the loop it leads into and one after: both must survive.
    const nodes = graph(
      draft("before", [1], { versions: { v1: from("a", 1) } }),
      draft("a", [1], { versions: { v1: from("b", 1) } }),
      draft("b", [1], { versions: { v1: from("c", 1) } }),
      draft("c", [1], { versions: { v1: from("a", 1) } }),
      draft("after", [1], { versions: { v1: from("a", 1) } }),
      draft("self", [1], { versions: { v1: from("self", 1) } }),
    );
    for (const key of ["home/a/v1", "home/b/v1", "home/c/v1", "home/self/v1"]) {
      expect(nodes.get(key)).toMatchObject({ parentKey: null, inferred: false, warning: "Cycle in parent references" });
    }
    for (const key of ["home/before/v1", "home/after/v1"]) {
      expect(nodes.get(key)).toMatchObject({ parentKey: "home/a/v1", warning: "" });
    }
  });
});

describe("variants", () => {
  const variantOf = (nodes: Map<string, VersionNode>, id: string) => {
    const { variant, variantParent, variantWarnings } = nodes.get(`home/${id}/v1`)!;
    return { variant, variantParent, variantWarnings };
  };

  test("a draft belongs to the variant it declares, and to none otherwise", () => {
    const nodes = graph(draft("a", [1], { variant: "calm" }), draft("calm", [1]));
    expect(variantOf(nodes, "a")).toEqual({ variant: "calm", variantParent: null, variantWarnings: [] });
    // The folder name is not a declaration.
    expect(variantOf(nodes, "calm")).toEqual({ variant: null, variantParent: null, variantWarnings: [] });
  });

  test("a variant takes its parent when all of its drafts agree on an existing one", () => {
    const nodes = graph(draft("a", [1], { variant: "calm" }), draft("b", [1], { variant: "bold", variantParent: "calm" }), draft("c", [1], { variant: "bold", variantParent: "calm" }));
    expect(variantOf(nodes, "b")).toEqual({ variant: "bold", variantParent: "calm", variantWarnings: [] });
    expect(variantOf(nodes, "c").variantParent).toBe("calm");
  });

  test("drafts that disagree lose the parent, and one that says nothing counts as disagreeing", () => {
    const nodes = graph(
      draft("root", [1], { variant: "calm" }),
      draft("other", [1], { variant: "dense" }),
      draft("a", [1], { variant: "bold", variantParent: "calm" }),
      draft("b", [1], { variant: "bold", variantParent: "dense" }),
      draft("c", [1], { variant: "bold" }),
    );
    for (const id of ["a", "b", "c"]) {
      expect(variantOf(nodes, id)).toEqual({ variant: "bold", variantParent: null, variantWarnings: ["Conflicting variant parents: calm, dense, (none)"] });
    }
  });

  test("a missing or malformed parent is reported on every draft of the variant", () => {
    const nodes = graph(draft("a", [1], { variant: "bold", variantParent: "gone" }), draft("b", [1], { variant: "dense", variantParent: 3 }), draft("c", [1], { variant: "dense" }));
    expect(variantOf(nodes, "a")).toEqual({ variant: "bold", variantParent: null, variantWarnings: ["Missing parent variant: gone"] });
    expect(variantOf(nodes, "b").variantWarnings).toEqual(["Invalid variant parent", "Invalid variant parent declaration"]);
    expect(variantOf(nodes, "c").variantWarnings).toEqual(["Invalid variant parent declaration"]);
  });

  test("a malformed variant leaves the draft unassigned", () => {
    const nodes = graph(draft("a", [1], { variant: "two words" }), draft("b", [1], { variantParent: "calm" }), draft("c", [1], { variant: 1, variantParent: "!" }));
    expect(variantOf(nodes, "a")).toEqual({ variant: null, variantParent: null, variantWarnings: ["Invalid variant"] });
    expect(variantOf(nodes, "b").variantWarnings).toEqual(["Variant parent without valid variant"]);
    expect(variantOf(nodes, "c").variantWarnings).toEqual(["Invalid variant", "Invalid variant parent"]);
  });

  test("variants that derive from each other in a loop all lose their parent", () => {
    const nodes = graph(
      draft("a", [1], { variant: "one", variantParent: "two" }),
      draft("b", [1], { variant: "two", variantParent: "one" }),
      draft("c", [1], { variant: "three", variantParent: "one" }),
      draft("d", [1], { variant: "solo", variantParent: "solo" }),
    );
    for (const id of ["a", "b", "d"]) {
      expect(variantOf(nodes, id)).toMatchObject({ variantParent: null, variantWarnings: ["Cycle in variant parents"] });
    }
    // Deriving from a variant in a loop is fine: only the loop itself is broken.
    expect(variantOf(nodes, "c")).toEqual({ variant: "three", variantParent: "one", variantWarnings: [] });
  });
});

describe("what a live update changed", () => {
  const withHashes = (hashes: Record<string, unknown>, versions = [1]) => buildGraph([{ target: "home", drafts: [draft("a", versions, { status: "baseline" }, { versionHashes: hashes })] }]);

  test("new versions and the edges into them are reported once", () => {
    const changes = compareGraphs(withHashes({ 1: "x" }), withHashes({ 1: "x", 2: "y" }, [1, 2]));
    expect([...changes.addedNodes]).toEqual(["home/a/v2"]);
    expect([...changes.addedEdges]).toEqual([JSON.stringify(["home/a/v1", "home/a/v2"])]);
    expect(changes.stalePreviews.size).toBe(0);
  });

  test("a rewritten file is stale and marked as rewritten", () => {
    const changes = compareGraphs(withHashes({ 1: "x" }), withHashes({ 1: "y" }));
    expect([...changes.stalePreviews]).toEqual(["home/a/v1"]);
    expect([...changes.rewritten]).toEqual(["home/a/v1"]);
    expect(changes.addedNodes.size).toBe(0);
  });

  test("an unchanged fingerprint leaves the preview alone", () => {
    const changes = compareGraphs(withHashes({ 1: "x" }), withHashes({ 1: "x" }));
    expect(changes.stalePreviews.size + changes.rewritten.size + changes.addedNodes.size + changes.addedEdges.size).toBe(0);
  });

  test("a missing fingerprint reloads the preview without calling it rewritten", () => {
    for (const [before, after] of [[{}, { 1: "x" }], [{ 1: "x" }, {}], [{}, {}]]) {
      const changes = compareGraphs(withHashes(before!), withHashes(after!));
      expect([...changes.stalePreviews]).toEqual(["home/a/v1"]);
      expect(changes.rewritten.size).toBe(0);
    }
  });

  test("a parent that changed is a new edge on an old node", () => {
    const linked = (parent: string) => buildGraph([{ target: "home", drafts: [draft("x", [1], { status: "baseline" }), draft("y", [1], { status: "baseline" }), draft("z", [1], { versions: { v1: from(parent, 1) } })] }]);
    const changes = compareGraphs(linked("x"), linked("y"));
    expect(changes.addedNodes.size).toBe(0);
    expect([...changes.addedEdges]).toEqual([JSON.stringify(["home/y/v1", "home/z/v1"])]);
  });
});
