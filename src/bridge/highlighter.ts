type Outlined = Element & ElementCSSInlineStyle;

const OUTLINE = "3px solid #e08624";

/** Outlines the element a click or key press would select. One element at a time. */
export class Highlighter {
  private element: Outlined | null = null;
  private outlineBefore = "";

  get current(): Element | null {
    return this.element;
  }

  show(element: Element | null | undefined, scrollIntoView = true): void {
    this.clear();
    if (!element || !hasInlineStyle(element)) return;
    this.element = element;
    this.outlineBefore = element.style.outline;
    element.style.outline = OUTLINE;
    if (scrollIntoView) element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  clear(): void {
    if (this.element) this.element.style.outline = this.outlineBefore;
    this.element = null;
  }
}

function hasInlineStyle(element: Element): element is Outlined {
  return "style" in element;
}
