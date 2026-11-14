// The change request the user copies into the chat, and the draft messages it is built from.
import { isRecord } from "../shared/guards";
import { MESSAGE, type SelectedItem } from "../shared/protocol";
import type { VersionNode } from "./graph/types";

/** What the user picked in a preview. `items` lists the elements of a multi-selection. */
export interface Selection extends SelectedItem {
  items: SelectedItem[];
}

export type DraftMessage = { kind: "ready" } | { kind: "selection"; fromContextMenu: boolean; selection: Selection };

// A draft can post anything. These bounds keep a hostile one from flooding the request.
const MAX_SELECTOR = 1000;
const MAX_TEXT = 2000;
const MAX_ITEMS = 20;
const MAX_ITEM_TEXT = 500;

export const NO_SELECTION = "No element selected yet. Click an element, drag a box around several, or focus the preview and use arrow keys.";

/** Checks a message from a draft frame. `nonce` is the one the frame was loaded with. */
export function readDraftMessage(data: unknown, nonce: string | undefined): DraftMessage | null {
  if (!nonce || !isRecord(data) || data.nonce !== nonce) return null;
  if (data.type === MESSAGE.ready) return { kind: "ready" };
  if (data.type !== MESSAGE.selection || !isItem(data, MAX_TEXT)) return null;
  const items = Array.isArray(data.items) && data.items.length <= MAX_ITEMS ? data.items : [];
  return {
    kind: "selection",
    fromContextMenu: data.context === true,
    selection: {
      selector: data.selector,
      text: data.text,
      items: items.filter((item) => isItem(item, MAX_ITEM_TEXT)).map(({ selector, text }) => ({ selector, text })),
    },
  };
}

function isItem(value: unknown, maxText: number): value is SelectedItem {
  if (!isRecord(value) || typeof value.selector !== "string" || typeof value.text !== "string") return false;
  return value.selector !== "" && value.selector.length <= MAX_SELECTOR && value.text.length <= maxText;
}

export function describeSelection(selection: Selection | null): string {
  if (!selection) return NO_SELECTION;
  return selection.selector + (selection.text ? ` · ${selection.text}` : "");
}

export function requestText(node: VersionNode | undefined, selection: Selection | null, change: string): string {
  if (!node) return "";
  const lines = [`Please update design draft ${node.target}/${node.id} (v${node.version}).`];
  if (selection && selection.items.length > 1) {
    lines.push("Selected elements:");
    for (const item of selection.items) lines.push(`- ${item.selector}${item.text ? ` (${item.text})` : ""}`);
  } else if (selection) {
    lines.push(`Selected element: ${selection.selector}`, `Selected text: ${selection.text}`);
  }
  lines.push(`Requested change: ${change}`);
  return lines.join("\n");
}
