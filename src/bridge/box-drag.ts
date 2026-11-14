// Dragging a box over the draft to pick every element inside it.

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Point {
  x: number;
  y: number;
}

/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD = 6;
const BOX_STYLE =
  "position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #e08624;background:rgba(224,134,36,.12);border-radius:3px";

export class BoxDrag {
  private origin: Point | null = null;
  private corner: Point = { x: 0, y: 0 };
  private outline: HTMLElement | null = null;
  /** Stays true after the release, until the click that follows it was swallowed. */
  private dragging = false;

  get isPressed(): boolean {
    return this.origin !== null;
  }

  /** Forgets the previous drag. Called on every press, whether it starts a box or not. */
  reset(): void {
    this.dragging = false;
  }

  press(event: PointerEvent): void {
    this.origin = { x: event.clientX, y: event.clientY };
    this.corner = this.origin;
  }

  /** Follows the pointer. True once the press has turned into a drag. */
  move(event: PointerEvent): boolean {
    if (!this.origin) return false;
    this.corner = { x: event.clientX, y: event.clientY };
    if (!this.dragging) {
      if (Math.hypot(this.corner.x - this.origin.x, this.corner.y - this.origin.y) < DRAG_THRESHOLD) return false;
      this.dragging = true;
      // Text selected by the first few pixels would stay painted under the box.
      getSelection()?.removeAllRanges();
    }
    this.draw(rectBetween(this.origin, this.corner));
    return true;
  }

  /** Ends the press. Returns the box that was dragged, or null after a plain click. */
  release(): Rect | null {
    this.outline?.remove();
    this.outline = null;
    const rect = this.origin && this.dragging ? rectBetween(this.origin, this.corner) : null;
    this.origin = null;
    return rect;
  }

  /** The browser sends a click after a drag. True when this click is that one. */
  swallowClick(): boolean {
    const wasDragging = this.dragging;
    this.dragging = false;
    return wasDragging;
  }

  private draw(rect: Rect): void {
    if (!this.outline) {
      this.outline = document.createElement("div");
      this.outline.setAttribute("data-design-studio-box", "");
      this.outline.style.cssText = BOX_STYLE;
      document.documentElement.append(this.outline);
    }
    Object.assign(this.outline.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.right - rect.left}px`,
      height: `${rect.bottom - rect.top}px`,
    });
  }
}

/**
 * Visible elements that lie completely inside `rect`, outermost first. An element
 * inside one already picked is left out: its container speaks for it.
 */
export function elementsInside(rect: Rect, limit: number): Element[] {
  const picked: Element[] = [];
  for (const element of document.body?.querySelectorAll("*") ?? []) {
    if (picked.some((container) => container.contains(element))) continue;
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    if (box.left < rect.left || box.right > rect.right || box.top < rect.top || box.bottom > rect.bottom) continue;
    picked.push(element);
    if (picked.length === limit) break;
  }
  return picked;
}

function rectBetween(a: Point, b: Point): Rect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}
