/** An element the page template is known to contain. */
export function byId<T extends Element = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`The canvas page has no #${id}`);
  return found as unknown as T;
}

/** A part of `parent` that is known to be there. */
export function part<T extends Element = HTMLElement>(parent: Element, selector: string): T {
  const found = parent.querySelector<T>(selector);
  if (!found) throw new Error(`Nothing matches ${selector}`);
  return found;
}

export function create<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className = "", text?: string): HTMLElementTagNameMap[Tag] {
  const created = document.createElement(tag);
  if (className) created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

export function button(label: string, onClick: () => void): HTMLButtonElement {
  const created = create("button", "", label);
  created.type = "button";
  created.addEventListener("click", onClick);
  return created;
}

export function onClick(id: string, handler: () => void): void {
  byId(id).addEventListener("click", handler);
}

/** Motion is decoration: skipped when the user asked for less of it. */
export function animate(target: Element | null, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  if (!target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  target.animate(keyframes, options);
}

/** Shows a short message in the status line, which screen readers announce. */
export function announce(message: string): void {
  byId("status").textContent = message;
}
