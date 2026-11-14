// Messages between the canvas page and the bridge script inside a draft preview.
// A draft is sandboxed and can forge any of them, so the canvas validates what it
// receives and treats selectors and text as display-only data.

export const MESSAGE = {
  /** Canvas to draft: turn element selection on or off. */
  selectMode: "design-studio:select",
  /** Canvas to draft: select whatever is at this point of the draft. */
  selectAt: "design-studio:select-at",
  /** Draft to canvas: the bridge is listening. */
  ready: "design-studio:ready",
  /** Draft to canvas: the user picked one or more elements. */
  selection: "design-studio:selection",
} as const;

/** Query parameter that ties a draft's messages to the frame load that produced them. */
export const NONCE_PARAM = "ds_nonce";

export interface SelectedItem {
  selector: string;
  text: string;
}

export interface SelectModeMessage {
  type: typeof MESSAGE.selectMode;
  enabled: boolean;
}

export interface SelectAtMessage {
  type: typeof MESSAGE.selectAt;
  x: number;
  y: number;
}

export interface ReadyMessage {
  type: typeof MESSAGE.ready;
  nonce: string | null;
}

export interface SelectionMessage {
  type: typeof MESSAGE.selection;
  /** True for a right-click, which may select in a draft that is not being edited. */
  context: boolean;
  nonce: string | null;
  selector: string;
  text: string;
  /** Present when a dragged box picked several elements. */
  items?: SelectedItem[];
}
