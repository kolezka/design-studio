// Draft previews: sandboxed iframes that load a draft version from this server.
import type { Theme } from "../shared/bootstrap";
import { MESSAGE, NONCE_PARAM, type SelectAtMessage, type SelectModeMessage } from "../shared/protocol";
import { animate } from "./dom";
import type { VersionNode } from "./graph/types";

export class Previews {
  /** Changes on every live update, so a rewritten draft is never served from cache. */
  private generation = 0;

  constructor(private readonly theme: Theme) {}

  create(): HTMLIFrameElement {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    return frame;
  }

  /**
   * Points a frame at a version. Each load gets a new nonce, which the draft echoes in
   * its messages, so anything still in flight from the previous document is ignored.
   */
  load(frame: HTMLIFrameElement, node: VersionNode): void {
    const nonce = crypto.randomUUID();
    frame.dataset.nonce = nonce;
    delete frame.dataset.ready;
    const query = new URLSearchParams({ theme: this.theme, refresh: String(this.generation), [NONCE_PARAM]: nonce });
    frame.src = `/d/${encodeURIComponent(node.target)}/${encodeURIComponent(node.id)}/v${node.version}.html?${query}`;
  }

  /** Loads the version again. `rewritten` fades the new content in once it arrives. */
  reload(frame: HTMLIFrameElement, node: VersionNode, rewritten: boolean): void {
    this.load(frame, node);
    if (!rewritten) return;
    const nonce = frame.dataset.nonce;
    frame.addEventListener(
      "load",
      () => {
        if (frame.dataset.nonce !== nonce) return;
        animate(frame.parentElement, [{ opacity: 0.6 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
      },
      { once: true },
    );
  }

  expire(): void {
    this.generation++;
  }
}

export function setSelectMode(frame: HTMLIFrameElement | null, enabled: boolean): void {
  send(frame, { type: MESSAGE.selectMode, enabled });
}

/** Asks a draft to select whatever is under a point given in the canvas page's coordinates. */
export function selectAtPagePoint(frame: HTMLIFrameElement, clientX: number, clientY: number): void {
  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  // Previews are scaled down, so page pixels are converted to the draft's own.
  send(frame, {
    type: MESSAGE.selectAt,
    x: ((clientX - rect.left) * frame.offsetWidth) / rect.width,
    y: ((clientY - rect.top) * frame.offsetHeight) / rect.height,
  });
}

// A sandboxed draft has an opaque origin, so there is no origin to address it by.
function send(frame: HTMLIFrameElement | null, message: SelectModeMessage | SelectAtMessage): void {
  frame?.contentWindow?.postMessage(message, "*");
}
