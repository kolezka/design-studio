import { describe, expect, test } from "bun:test";
import { buildGraph } from "../../src/canvas/graph/build";
import { describeSelection, NO_SELECTION, readDraftMessage, requestText } from "../../src/canvas/request";

const NONCE = "5f0c";
const selection = (fields: Record<string, unknown> = {}) => ({ type: "design-studio:selection", nonce: NONCE, context: false, selector: "main:nth-of-type(1)", text: "Hello", ...fields });

describe("messages from a draft", () => {
  test("ready and selection are accepted with the frame's nonce", () => {
    expect(readDraftMessage({ type: "design-studio:ready", nonce: NONCE }, NONCE)).toEqual({ kind: "ready" });
    expect(readDraftMessage(selection(), NONCE)).toEqual({ kind: "selection", fromContextMenu: false, selection: { selector: "main:nth-of-type(1)", text: "Hello", items: [] } });
    expect(readDraftMessage(selection({ context: true }), NONCE)).toMatchObject({ fromContextMenu: true });
  });

  test("a wrong, missing or empty nonce is refused", () => {
    expect(readDraftMessage(selection({ nonce: "other" }), NONCE)).toBeNull();
    expect(readDraftMessage(selection({ nonce: undefined }), NONCE)).toBeNull();
    // A frame that was never loaded has no nonce, and nothing may match that.
    expect(readDraftMessage(selection({ nonce: undefined }), undefined)).toBeNull();
    expect(readDraftMessage(selection({ nonce: "" }), "")).toBeNull();
  });

  test("anything that is not a known message is refused", () => {
    for (const data of [null, "design-studio:ready", 4, [], { nonce: NONCE }, { type: "design-studio:select", nonce: NONCE, enabled: true }]) {
      expect(readDraftMessage(data, NONCE)).toBeNull();
    }
  });

  test("oversized or malformed selections are refused", () => {
    expect(readDraftMessage(selection({ selector: "" }), NONCE)).toBeNull();
    expect(readDraftMessage(selection({ selector: 4 }), NONCE)).toBeNull();
    expect(readDraftMessage(selection({ text: null }), NONCE)).toBeNull();
    expect(readDraftMessage(selection({ selector: "x".repeat(1001) }), NONCE)).toBeNull();
    expect(readDraftMessage(selection({ text: "x".repeat(2001) }), NONCE)).toBeNull();
    expect(readDraftMessage(selection({ selector: "x".repeat(1000), text: "x".repeat(2000) }), NONCE)).not.toBeNull();
  });

  test("bad items are dropped, and too many items drop the whole list", () => {
    const good = { selector: "p:nth-of-type(1)", text: "One", extra: "ignored" };
    const message = readDraftMessage(selection({ items: [good, { selector: "", text: "x" }, { selector: "p", text: "x".repeat(501) }, null, "p"] }), NONCE);
    expect(message).toMatchObject({ selection: { items: [{ selector: "p:nth-of-type(1)", text: "One" }] } });
    expect(readDraftMessage(selection({ items: Array.from({ length: 21 }, () => good) }), NONCE)).toMatchObject({ selection: { items: [] } });
    expect(readDraftMessage(selection({ items: "p" }), NONCE)).toMatchObject({ selection: { items: [] } });
  });
});

describe("the change request", () => {
  const [node] = buildGraph([{ target: "home", drafts: [{ target: "home", id: "bold", meta: {}, metaError: null, versions: [2] }] }]);

  test("without a draft there is nothing to ask for", () => {
    expect(requestText(undefined, null, "Make it blue")).toBe("");
  });

  test("names the draft and version, then the change", () => {
    expect(requestText(node, null, "Make it blue")).toBe("Please update design draft home/bold (v2).\nRequested change: Make it blue");
  });

  test("one selected element is given with its text", () => {
    expect(requestText(node, { selector: "h1:nth-of-type(1)", text: "Welcome", items: [] }, "Shorter")).toBe(
      "Please update design draft home/bold (v2).\nSelected element: h1:nth-of-type(1)\nSelected text: Welcome\nRequested change: Shorter",
    );
  });

  test("several selected elements are listed, text only where there is some", () => {
    const items = [{ selector: "button:nth-of-type(1)", text: "Save" }, { selector: "img:nth-of-type(1)", text: "" }];
    expect(requestText(node, { selector: "2 elements", text: "Save", items }, "Align")).toBe(
      "Please update design draft home/bold (v2).\nSelected elements:\n- button:nth-of-type(1) (Save)\n- img:nth-of-type(1)\nRequested change: Align",
    );
  });

  test("a single item is treated as a single element", () => {
    const one = { selector: "p:nth-of-type(1)", text: "Hi" };
    expect(requestText(node, { ...one, items: [one] }, "x")).toContain("Selected element: p:nth-of-type(1)");
  });

  test("the inspector line shows the selector and the text, or a hint", () => {
    expect(describeSelection(null)).toBe(NO_SELECTION);
    expect(describeSelection({ selector: "p", text: "", items: [] })).toBe("p");
    expect(describeSelection({ selector: "p", text: "Hi", items: [] })).toBe("p · Hi");
  });
});
