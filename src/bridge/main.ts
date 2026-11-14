// Runs inside every draft the canvas shows. While select mode is on, it turns clicks,
// dragged boxes and key presses into selection messages for the canvas page, and
// keeps them from reaching the draft's own handlers.
//
// The server bundles this file and inserts it at the top of the draft.
import { isRecord } from "../shared/guards";
import { MESSAGE, NONCE_PARAM, type ReadyMessage, type SelectedItem, type SelectionMessage } from "../shared/protocol";
import { BoxDrag, elementsInside } from "./box-drag";
import { Highlighter } from "./highlighter";
import { selectorFor } from "./selector";

const MAX_TEXT = 200;
const MAX_ITEM_TEXT = 120;
const MAX_ITEMS = 20;

const nonce = new URLSearchParams(location.search).get(NONCE_PARAM);
const highlighter = new Highlighter();
const boxDrag = new BoxDrag();
let selecting = false;
/** False after a pointer press, so the focus it causes is not reported a second time. */
let focusCameFromKeyboard = true;

// A sandboxed draft cannot name its parent's origin, and the canvas checks the nonce.
function post(message: ReadyMessage | SelectionMessage): void {
  window.parent.postMessage(message, "*");
}

function textOf(element: Element): string {
  return (element.textContent ?? "").trim();
}

function describe(element: Element, maxText: number): SelectedItem {
  return { selector: selectorFor(element), text: textOf(element).slice(0, maxText) };
}

function elementOf(target: EventTarget | null | undefined): Element | null {
  if (target instanceof Element) return target;
  return target instanceof Node ? target.parentElement : null;
}

/** The innermost element an event hit, looking into open shadow roots. */
function elementUnder(event: Event): Element | undefined {
  return event.composedPath().find((node): node is Element => node instanceof Element);
}

function report(target: EventTarget | null | undefined, fromContextMenu = false): void {
  const element = elementOf(target);
  if (element) post({ type: MESSAGE.selection, context: fromContextMenu, nonce, ...describe(element, MAX_TEXT) });
}

function reportBox(elements: Element[]): void {
  const [only] = elements;
  if (!only) return;
  if (elements.length === 1) {
    highlighter.show(only, false);
    report(only);
    return;
  }
  post({
    type: MESSAGE.selection,
    context: false,
    nonce,
    selector: `${elements.length} elements`,
    text: elements.map(textOf).filter(Boolean).join(" · ").slice(0, MAX_TEXT),
    items: elements.map((element) => describe(element, MAX_ITEM_TEXT)),
  });
}

// ---- instructions from the canvas

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !isRecord(event.data)) return;
  const { type, enabled, x, y } = event.data;
  if (type === MESSAGE.selectMode && typeof enabled === "boolean") {
    selecting = enabled;
    if (!selecting) highlighter.clear();
  } else if (type === MESSAGE.selectAt && selecting && typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
    // The canvas caught a press that the browser did not route into this frame.
    const element = document.elementFromPoint(x, y);
    if (element) {
      highlighter.show(element, false);
      report(element);
    }
  }
});

// Ready means parsed and painted, not loaded: slow images or fonts must not leave
// the draft clickable while the canvas believes selection is on.
function announceReady(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => post({ type: MESSAGE.ready, nonce })));
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", announceReady, { once: true });
else announceReady();

// ---- pointer

// Everything listens in the capture phase, ahead of the draft's own handlers.
const CAPTURE = true;

document.addEventListener(
  "pointerdown",
  (event) => {
    focusCameFromKeyboard = false;
    boxDrag.reset();
    if (selecting && event.button === 0 && event.isPrimary) boxDrag.press(event);
  },
  CAPTURE,
);

document.addEventListener(
  "pointermove",
  (event) => {
    if (!boxDrag.move(event)) return;
    event.preventDefault();
    highlighter.clear();
  },
  CAPTURE,
);

function finishBox(): void {
  const rect = boxDrag.release();
  if (rect && selecting) reportBox(elementsInside(rect, MAX_ITEMS));
}

document.addEventListener("pointerup", finishBox, CAPTURE);
document.addEventListener(
  "pointercancel",
  () => {
    boxDrag.reset();
    finishBox();
  },
  CAPTURE,
);

// Native text selection would paint over the box while dragging.
document.addEventListener(
  "selectstart",
  (event) => {
    if (selecting) event.preventDefault();
  },
  CAPTURE,
);

document.addEventListener(
  "pointerover",
  (event) => {
    if (selecting && !boxDrag.isPressed) highlighter.show(elementUnder(event), false);
  },
  CAPTURE,
);

document.addEventListener(
  "pointerout",
  (event) => {
    // No related target means the pointer left the draft altogether.
    if (selecting && !event.relatedTarget) highlighter.clear();
  },
  CAPTURE,
);

document.addEventListener(
  "click",
  (event) => {
    if (!selecting) return;
    silence(event);
    if (!boxDrag.swallowClick()) report(elementUnder(event));
  },
  CAPTURE,
);

// A right-click selects even when select mode is off: it is how a draft is picked for editing.
document.addEventListener(
  "contextmenu",
  (event) => {
    silence(event);
    report(elementUnder(event), true);
  },
  CAPTURE,
);

// ---- keyboard

document.addEventListener(
  "focusin",
  (event) => {
    if (selecting && focusCameFromKeyboard) report(event.target);
  },
  CAPTURE,
);

document.addEventListener(
  "keydown",
  (event) => {
    focusCameFromKeyboard = true;
    if (!selecting) return;
    if (event.key === "Escape") {
      highlighter.clear();
    } else if (event.key.startsWith("Arrow")) {
      silence(event);
      const next = neighbour(highlighter.current ?? startingPoint(event), event.key);
      if (next && next !== document.documentElement) {
        highlighter.show(next);
        report(next);
      }
    } else if (event.key === "Enter" || event.key === " ") {
      silence(event);
      const target = highlighter.current ?? event.target;
      if (target instanceof Element) highlighter.show(target);
      report(target);
    }
  },
  CAPTURE,
);

/** Arrow keys walk the document tree: up to the parent, down to the first child, sideways to siblings. */
function neighbour(element: Element, key: string): Element | null {
  if (key === "ArrowUp") return element.parentElement;
  if (key === "ArrowDown") return element.firstElementChild;
  return key === "ArrowLeft" ? element.previousElementSibling : element.nextElementSibling;
}

function startingPoint(event: KeyboardEvent): Element {
  return event.target instanceof Element ? event.target : document.body;
}

/** Keeps an event from the draft's handlers and from its default action. */
function silence(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}
