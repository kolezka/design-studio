const MAX_STEPS = 12;
const MAX_LENGTH = 512;

/**
 * A CSS-like path to an element, such as `body:nth-of-type(1) > main:nth-of-type(1)`.
 * It is a description for the person reading the request, not a selector to run:
 * `::shadow` marks a step out of a shadow root, and long paths are cut at the top.
 */
export function selectorFor(element: Element): string {
  const steps: string[] = [];
  let current: Element | null = element;
  while (current && steps.length < MAX_STEPS) {
    steps.unshift(`${current.localName}:nth-of-type(${positionAmongSameTag(current)})`);
    const root = current.getRootNode();
    if (!current.parentElement && root instanceof ShadowRoot) {
      steps.unshift("::shadow");
      current = root.host;
    } else {
      current = current.parentElement;
    }
  }
  return steps.join(" > ").slice(0, MAX_LENGTH);
}

function positionAmongSameTag(element: Element): number {
  let position = 1;
  for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (sibling.localName === element.localName) position++;
  }
  return position;
}
