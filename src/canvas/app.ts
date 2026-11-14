// Ties the canvas together: which version the request is about, which preview is in
// select mode, and what a live update does to both.
import type { CanvasBootstrap } from "../shared/bootstrap";
import { titleOf } from "./card";
import { byId, onClick } from "./dom";
import { FullPreview } from "./full-preview";
import { GraphView } from "./graph-view";
import { buildGraph } from "./graph/build";
import { compareGraphs, type GraphChanges } from "./graph/changes";
import type { VersionNode } from "./graph/types";
import { Inspector } from "./inspector";
import { followDrafts } from "./live-updates";
import { Previews, selectAtPagePoint, setSelectMode } from "./previews";
import { readDraftMessage, type Selection } from "./request";
import { Viewport } from "./viewport";

/** Origin of a document in a sandboxed frame without `allow-same-origin`. */
const SANDBOXED_ORIGIN = "null";

export class CanvasApp {
  private nodes: VersionNode[] = [];
  /** Key of the version the request is about. */
  private editedKey: string | null = null;
  private selection: Selection | null = null;
  /** The preview in which clicks select elements instead of reaching the draft. */
  private selectingIn: HTMLIFrameElement | null = null;

  private readonly previews: Previews;
  private readonly viewport = new Viewport();
  private readonly graph: GraphView;
  private readonly fullPreview: FullPreview;
  private readonly inspector = new Inspector({
    onDescribe: () => this.showRequest(),
    onClose: () => this.closeInspector(),
  });

  constructor(private readonly bootstrap: CanvasBootstrap) {
    const preview = { width: bootstrap.width, height: bootstrap.height };
    this.previews = new Previews(bootstrap.theme);
    this.graph = new GraphView({
      preview,
      openPreview: (node) => {
        const frame = this.previews.create();
        this.keepSelectingAcrossLoads(frame);
        this.previews.load(frame, node);
        return frame;
      },
      actionsFor: (key, frame) => ({
        selectElement: () => this.withNode(key, (node) => this.startSelecting(node, frame)),
        openFullPreview: () => this.withNode(key, (node) => this.openFullPreview(node)),
      }),
    });
    this.fullPreview = new FullPreview(preview, {
      onToggleSelecting: () => this.toggleSelectingInFullPreview(),
      onClosed: () => this.leaveFullPreview(),
    });
    this.keepSelectingAcrossLoads(this.fullPreview.frame);
  }

  start(): void {
    this.show(buildGraph(this.bootstrap.targets));
    onClick("fit", () => this.fit());
    onClick("fitTop", () => this.fit());
    window.addEventListener("message", (event) => this.receive(event));
    document.addEventListener("pointerdown", (event) => this.forwardPress(event), true);
    // `?static` gives tests a page that never changes under them.
    if (!new URLSearchParams(location.search).has("static")) followDrafts((targets) => this.update(targets));
  }

  // ---- the graph

  private show(nodes: VersionNode[], changes?: GraphChanges): void {
    const remaining = new Set(nodes.map((node) => node.key));
    for (const key of this.graph.keys()) {
      if (!remaining.has(key)) this.forget(key);
    }
    this.nodes = nodes;
    this.graph.show(nodes, changes?.addedNodes, changes?.addedEdges);
    this.withNode(this.fullPreview.key, (node) => this.fullPreview.setTitle(fullTitle(node)));
    this.graph.markSelected(this.editedKey);
    this.showRequest();
  }

  /** Drops whatever still points at a version that is about to leave the canvas. */
  private forget(key: string): void {
    if (this.selectingIn === this.graph.frameOf(key)) this.stopSelecting();
    if (this.editedKey === key) {
      this.editedKey = null;
      this.selection = null;
    }
    if (this.fullPreview.isOpen && this.fullPreview.key === key) this.fullPreview.close();
  }

  private update(targets: unknown[]): void {
    const nodes = buildGraph(targets);
    const changes = compareGraphs(this.nodes, nodes);
    // A selector picked in the old content may not match the new one.
    if (this.editedKey !== null && changes.stalePreviews.has(this.editedKey)) this.selection = null;
    this.previews.expire();
    this.show(nodes, changes);
    for (const node of nodes) {
      if (!changes.stalePreviews.has(node.key)) continue;
      const rewritten = changes.rewritten.has(node.key);
      const frame = this.graph.frameOf(node.key);
      if (frame) this.previews.reload(frame, node, rewritten);
      if (this.fullPreview.isOpen && this.fullPreview.key === node.key) this.previews.reload(this.fullPreview.frame, node, rewritten);
    }
  }

  private fit(): void {
    const bounds = this.graph.bounds();
    if (bounds) this.viewport.fit(bounds);
  }

  // ---- the request

  private edit(node: VersionNode): void {
    if (this.editedKey !== node.key) this.inspector.forgetDescription();
    this.editedKey = node.key;
  }

  private showRequest(): void {
    this.inspector.show(this.nodeAt(this.editedKey), this.selection);
  }

  private closeInspector(): void {
    this.stopSelecting();
    this.inspector.close();
    if (this.fullPreview.isOpen) this.fullPreview.showSelecting(false);
  }

  // ---- select mode

  private startSelecting(node: VersionNode, frame: HTMLIFrameElement): void {
    this.stopSelecting();
    if (frame !== this.fullPreview.frame) {
      const box = this.graph.boxOf(node.key);
      if (box) this.viewport.bringIntoView(box);
    }
    this.edit(node);
    this.selection = null;
    this.selectingIn = frame;
    this.inspector.open();
    setSelectMode(frame, true);
    this.showRequest();
    this.graph.markSelected(this.editedKey);
    this.inspector.focusDescription();
  }

  private stopSelecting(): void {
    setSelectMode(this.selectingIn, false);
    this.selectingIn = null;
  }

  /** A document that has just loaded starts with selection off, so it is told again. */
  private keepSelectingAcrossLoads(frame: HTMLIFrameElement): void {
    frame.addEventListener("load", () => {
      if (this.selectingIn === frame) setSelectMode(frame, true);
    });
  }

  /**
   * A press on a freshly loaded sandboxed frame can land on the iframe element in
   * this page instead of inside the draft, and no click follows. Pass it on.
   */
  private forwardPress(event: PointerEvent): void {
    const frame = this.selectingIn;
    if (frame && event.target === frame) selectAtPagePoint(frame, event.clientX, event.clientY);
  }

  // ---- the full preview

  private openFullPreview(node: VersionNode): void {
    this.stopSelecting();
    this.edit(node);
    this.selection = null;
    this.graph.markSelected(this.editedKey);
    this.showRequest();
    this.previews.load(this.fullPreview.frame, node);
    // The editor stays out of the way until the user picks something.
    this.inspector.moveInto(this.fullPreview.body);
    this.inspector.close();
    this.selectingIn = this.fullPreview.frame;
    this.fullPreview.open(node.key, fullTitle(node));
  }

  private toggleSelectingInFullPreview(): void {
    if (this.selectingIn === this.fullPreview.frame) {
      this.stopSelecting();
      this.fullPreview.showSelecting(false);
      return;
    }
    this.withNode(this.fullPreview.key, (node) => {
      this.startSelecting(node, this.fullPreview.frame);
      this.fullPreview.showSelecting(true);
    });
  }

  private leaveFullPreview(): void {
    if (this.selectingIn === this.fullPreview.frame) this.stopSelecting();
    this.inspector.moveInto(byId("canvas"));
  }

  // ---- messages from drafts

  private receive(event: MessageEvent): void {
    if (event.origin !== SANDBOXED_ORIGIN) return;
    const sender = this.previewBehind(event.source);
    if (!sender) return;
    const { frame, node } = sender;
    const message = readDraftMessage(event.data, frame.dataset.nonce);
    if (!message) return;

    if (message.kind === "ready") {
      frame.dataset.ready = frame.dataset.nonce;
      if (frame === this.selectingIn) setSelectMode(frame, true);
      return;
    }
    if (message.fromContextMenu) {
      // A right-click picks the draft and the element in one go.
      this.edit(node);
      this.graph.markSelected(this.editedKey);
    } else if (frame !== this.selectingIn || this.editedKey !== node.key) {
      return;
    }
    this.inspector.open();
    this.selection = message.selection;
    this.showRequest();
  }

  private previewBehind(source: MessageEventSource | null): { frame: HTMLIFrameElement; node: VersionNode } | null {
    if (!source) return null;
    if (this.fullPreview.isOpen) {
      // The modal covers the cards, so only its draft can be the one the user is using.
      const frame = this.fullPreview.frame;
      const node = this.nodeAt(this.fullPreview.key);
      return node && source === frame.contentWindow ? { frame, node } : null;
    }
    for (const node of this.nodes) {
      const frame = this.graph.frameOf(node.key);
      if (frame && source === frame.contentWindow) return { frame, node };
    }
    return null;
  }

  // ---- lookups

  private nodeAt(key: string | null): VersionNode | undefined {
    return key === null ? undefined : this.nodes.find((node) => node.key === key);
  }

  /** Runs `action` with the version at `key`, unless a live update removed it meanwhile. */
  private withNode(key: string | null, action: (node: VersionNode) => void): void {
    const node = this.nodeAt(key);
    if (node) action(node);
  }
}

function fullTitle(node: VersionNode): string {
  return `${titleOf(node)} · v${node.version}`;
}
