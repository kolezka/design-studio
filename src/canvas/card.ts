// The card of one draft version: heading, live preview, notes and two actions.
import { button, create, part } from "./dom";
import type { VersionNode } from "./graph/types";

export interface Card {
  element: HTMLElement;
  frame: HTMLIFrameElement;
}

export interface CardActions {
  selectElement(): void;
  openFullPreview(): void;
}

/** Width a preview is scaled to: the inside of a card as styled in page.css. */
const PREVIEW_WIDTH = 394;

export function titleOf(node: VersionNode): string {
  return textOr(node.meta.title, node.id);
}

export function createCard(key: string, frame: HTMLIFrameElement, preview: { width: number; height: number }, actions: CardActions): Card {
  const element = create("article", "node");
  element.dataset.node = key;

  const head = create("div", "node-head");
  const heading = create("div");
  heading.append(create("div", "node-title"), create("div", "node-sub"));
  head.append(create("div", "index"), heading, create("span", "badge"));

  const viewport = create("div", "frame");
  viewport.style.aspectRatio = `${preview.width} / ${preview.height}`;
  frame.style.width = `${preview.width}px`;
  frame.style.height = `${preview.height}px`;
  frame.style.transform = `scale(${PREVIEW_WIDTH / preview.width})`;
  viewport.append(frame);

  const footer = create("div", "node-footer");
  footer.append(button("Select element", actions.selectElement), create("span", "spacer"), button("Full preview", actions.openFullPreview));

  element.append(head, viewport, create("div", "node-info"), footer);
  return { element, frame };
}

/** Writes everything on a card that comes from the draft's metadata. */
export function describeCard(card: Card, node: VersionNode, position: number): void {
  const title = titleOf(node);
  setText(card, ".index", String(position).padStart(2, "0"));
  setText(card, ".node-title", title);
  setText(card, ".node-sub", `View: ${node.target} / ${node.id} / v${node.version}`);
  setText(card, ".badge", textOr(node.meta.status, "candidate"));
  card.frame.title = `Preview: ${title} v${node.version}`;

  const parent = node.parentKey === null ? "" : node.parentKey + (node.inferred ? " (inferred)" : "");
  const notes: [label: string, value: unknown][] = [
    ...node.variantWarnings.map((warning): [string, unknown] => ["Warning: ", warning]),
    ["", node.meta.direction],
    ["Style: ", node.meta.tokens],
    ["", node.meta.notes],
    ["Metadata error: ", node.metaError],
    ["Warning: ", node.warning],
    ["Parent: ", parent],
  ];
  part(card.element, ".node-info").replaceChildren(
    ...notes.filter(([, value]) => typeof value === "string" && value).map(([label, value]) => create("p", "", label + value)),
  );
}

function setText(card: Card, selector: string, text: string): void {
  part(card.element, selector).textContent = text;
}

function textOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}
