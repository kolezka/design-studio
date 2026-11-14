// Draws the graph: one card per version, a header per variant and view, an edge per parent link.
import { type Card, type CardActions, createCard, describeCard } from "./card";
import { animate, byId, create } from "./dom";
import type { VersionNode } from "./graph/types";
import { type Box, type Edge, type GraphLayout, groupNodes, type Header, layoutGraph, type VariantGroup } from "./layout";

export interface GraphViewOptions {
  /** Size the drafts are previewed at. */
  preview: { width: number; height: number };
  /** A frame for a version that has just appeared, already loading it. */
  openPreview(node: VersionNode): HTMLIFrameElement;
  actionsFor(key: string, frame: HTMLIFrameElement): CardActions;
}

const SVG = "http://www.w3.org/2000/svg";
const INFERRED_DASH = "8 5";
const NOTHING_NEW: ReadonlySet<string> = new Set();

export class GraphView {
  private readonly cards = new Map<string, Card>();
  private readonly headers = new Map<string, HTMLElement>();
  private readonly edges = new Map<string, SVGPathElement>();
  private readonly nodeLayer = byId("nodes");
  private readonly edgeLayer = byId<SVGSVGElement>("edges");
  // Cards grow when their notes change or a font loads; edges must follow.
  private readonly cardResized = new ResizeObserver(() => this.layoutSoon());
  private nodes: VersionNode[] = [];
  private groups: VariantGroup[] = [];
  private layout: GraphLayout = { cards: new Map(), headers: new Map(), edges: [] };
  private pendingLayout = 0;

  constructor(private readonly options: GraphViewOptions) {}

  /** Keys of the cards on screen, including ones the next `show` will remove. */
  keys(): string[] {
    return [...this.cards.keys()];
  }

  frameOf(key: string): HTMLIFrameElement | undefined {
    return this.cards.get(key)?.frame;
  }

  boxOf(key: string): Box | undefined {
    return this.layout.cards.get(key);
  }

  /** Brings the cards in line with `nodes`. Additions named in `added*` fade in. */
  show(nodes: VersionNode[], addedNodes = NOTHING_NEW, addedEdges = NOTHING_NEW): void {
    this.nodes = nodes;
    this.groups = groupNodes(nodes);
    const wanted = new Set(nodes.map((node) => node.key));
    for (const [key, card] of this.cards) {
      if (wanted.has(key)) continue;
      this.cardResized.unobserve(card.element);
      card.element.remove();
      this.cards.delete(key);
    }
    nodes.forEach((node, index) => {
      const card = this.cards.get(node.key) ?? this.addCard(node, addedNodes.has(node.key));
      describeCard(card, node, index + 1);
    });
    this.arrange(addedEdges);
    byId("count").textContent = String(nodes.length);
    byId("empty").hidden = nodes.length > 0;
  }

  markSelected(key: string | null): void {
    for (const [cardKey, card] of this.cards) card.element.classList.toggle("selected", cardKey === key);
  }

  /** The box around every card and header, or null for an empty graph. */
  bounds(): Box | null {
    this.arrange();
    const boxes = [...this.layout.cards.values()];
    for (const header of this.headers.values()) {
      boxes.push({ x: header.offsetLeft, y: header.offsetTop, width: header.offsetWidth, height: header.offsetHeight });
    }
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map((box) => box.x));
    const y = Math.min(...boxes.map((box) => box.y));
    return {
      x,
      y,
      width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
      height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
    };
  }

  private addCard(node: VersionNode, fadeIn: boolean): Card {
    const frame = this.options.openPreview(node);
    const card = createCard(node.key, frame, this.options.preview, this.options.actionsFor(node.key, frame));
    this.nodeLayer.append(card.element);
    this.cards.set(node.key, card);
    this.cardResized.observe(card.element);
    if (fadeIn) {
      const frames = [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }];
      animate(card.element, frames, { duration: 350, easing: "ease-out" });
    }
    return card;
  }

  private layoutSoon(): void {
    this.pendingLayout ||= requestAnimationFrame(() => {
      this.pendingLayout = 0;
      this.arrange();
    });
  }

  private arrange(addedEdges = NOTHING_NEW): void {
    this.syncHeaders();
    this.layout = layoutGraph(this.nodes, this.groups, {
      card: (key) => {
        const element = this.cards.get(key)?.element;
        return element && { width: element.offsetWidth, height: element.offsetHeight };
      },
      header: (id) => this.headers.get(id)?.offsetHeight ?? 0,
    });
    for (const [key, box] of this.layout.cards) place(this.cards.get(key)?.element, box.x, box.y);
    for (const [id, top] of this.layout.headers) place(this.headers.get(id), 0, top);
    this.syncEdges(addedEdges);
  }

  /** Headers must exist with their text before layout, which needs their height. */
  private syncHeaders(): void {
    const wanted = new Map<string, Header>();
    for (const variant of this.groups) {
      for (const header of [variant.header, ...variant.views.map((view) => view.header)]) wanted.set(header.id, header);
    }
    for (const [id, element] of this.headers) {
      if (wanted.has(id)) continue;
      element.remove();
      this.headers.delete(id);
    }
    for (const header of wanted.values()) {
      let element = this.headers.get(header.id);
      if (!element) {
        element = create("div", `${header.kind}-header`);
        this.nodeLayer.append(element);
        this.headers.set(header.id, element);
      }
      element.textContent = header.label;
    }
  }

  private syncEdges(added: ReadonlySet<string>): void {
    const wanted = new Set(this.layout.edges.map((edge) => edge.id));
    for (const [id, path] of this.edges) {
      if (wanted.has(id)) continue;
      path.remove();
      this.edges.delete(id);
    }
    for (const edge of this.layout.edges) drawEdge(this.edges.get(edge.id) ?? this.addEdge(edge.id, added.has(edge.id)), edge);
  }

  private addEdge(id: string, fadeIn: boolean): SVGPathElement {
    const path = document.createElementNS(SVG, "path");
    this.edges.set(id, path);
    this.edgeLayer.append(path);
    // 0.45 is the resting opacity of an edge in page.css.
    if (fadeIn) animate(path, [{ opacity: 0 }, { opacity: 0.45 }], { duration: 450, easing: "ease-out" });
    return path;
  }
}

function drawEdge(path: SVGPathElement, edge: Edge): void {
  path.setAttribute("d", edge.path);
  path.dataset.source = edge.source;
  path.dataset.target = edge.target;
  path.dataset.inferred = String(edge.inferred);
  if (edge.inferred) path.setAttribute("stroke-dasharray", INFERRED_DASH);
  else path.removeAttribute("stroke-dasharray");
}

function place(element: HTMLElement | undefined, left: number, top: number): void {
  if (!element) return;
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}
