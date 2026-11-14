// This is a best-effort string insertion, not an HTML parser. It preserves a
// leading doctype (including preceding whitespace and comments), but malformed
// doctypes, XHTML, restrictive CSP headers, and draft scripts that interfere
// with the bridge are not supported. The sandboxed draft can forge messages;
// the host must treat both selector and text as untrusted display-only data.
const bridge = `<script>
(() => {
  let enabled = false;
  const nonce = new URLSearchParams(location.search).get('ds_nonce');
  let keyboardTarget = null;
  let keyboardFocus = true;
  let previousOutline = '';
  const clearHighlight = () => {
    if (keyboardTarget) keyboardTarget.style.outline = previousOutline;
    keyboardTarget = null;
  };
  const highlight = (element, scroll = true) => {
    clearHighlight();
    if (!element) return;
    keyboardTarget = element;
    previousOutline = element.style.outline;
    element.style.outline = '3px solid #e08624';
    if (scroll) element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const selectorFor = (element) => {
    const parts = [];
    while (element && element.nodeType === 1 && parts.length < 12) {
      const name = element.localName;
      let index = 1;
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.localName === name) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(name + ':nth-of-type(' + index + ')');
      const root = element.getRootNode();
      if (!element.parentElement && root instanceof ShadowRoot) { parts.unshift('::shadow'); element = root.host; }
      else element = element.parentElement;
    }
    return parts.join(' > ').slice(0, 512);
  };
  const select = (target, context = false) => {
    const element = target instanceof Element ? target : target && target.parentElement;
    if (!element) return;
    window.parent.postMessage({
      type: 'design-studio:selection',
      context,
      nonce,
      selector: selectorFor(element),
      text: (element.textContent || '').trim().slice(0, 200)
    }, '*');
  };
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || !event.data) return;
    const { type, enabled: next, x, y } = event.data;
    if (type === 'design-studio:select' && typeof next === 'boolean') {
      enabled = next;
      if (!enabled) clearHighlight();
    } else if (type === 'design-studio:select-at' && enabled &&
        Number.isFinite(x) && Number.isFinite(y)) {
      // The parent caught a click that Chrome did not route into this frame yet.
      const target = document.elementFromPoint(x, y);
      if (target) { highlight(target, false); select(target); }
    }
  });
  // Report readiness once the DOM is parsed and painted, not on load, so slow
  // images or fonts do not leave the draft clickable while selection is on.
  const ready = () => requestAnimationFrame(() => requestAnimationFrame(() =>
    window.parent.postMessage({ type: 'design-studio:ready', nonce }, '*')));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
  const eventElement = (event) => event.composedPath().find(node => node instanceof Element);
  document.addEventListener('pointerover', (event) => { if (enabled) highlight(eventElement(event), false); }, true);
  document.addEventListener('pointerout', (event) => { if (enabled && !event.relatedTarget) clearHighlight(); }, true);
  for (const type of ['contextmenu', 'click']) {
    document.addEventListener(type, (event) => {
      if (!enabled && type !== 'contextmenu') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      select(eventElement(event), type === 'contextmenu');
    }, true);
  }
  document.addEventListener('pointerdown', () => { keyboardFocus = false; }, true);
  document.addEventListener('focusin', (event) => {
    if (enabled && keyboardFocus) select(event.target);
  }, true);
  document.addEventListener('keydown', (event) => {
    keyboardFocus = true;
    if (!enabled) return;
    if (event.key === 'Escape') { clearHighlight(); return; }
    if (event.key.startsWith('Arrow')) {
      const current = keyboardTarget || (event.target instanceof Element && event.target !== document.body ? event.target : document.body);
      const next = event.key === 'ArrowUp' ? current.parentElement : event.key === 'ArrowDown' ? current.firstElementChild : event.key === 'ArrowLeft' ? current.previousElementSibling : current.nextElementSibling;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (next && next !== document.documentElement) { highlight(next); select(next); }
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = keyboardTarget || event.target;
    if (target instanceof Element) highlight(target);
    select(target);
  }, true);
})();
</script>`;

export function instrumentDraft(html: string): string {
  const doctype = /^(?:\uFEFF|\s|<!--[\s\S]*?-->)*<!doctype\s+[^>]*>/i.exec(html);
  let offset = doctype ? doctype[0].length : html.charCodeAt(0) === 0xfeff ? 1 : 0;
  // Only inspect the document prefix, so tags inside scripts are never matched.
  // Quoted attributes containing > are outside this lightweight approach.
  const prefix = /^(?:\s|<!--[\s\S]*?-->)*(?:<html(?:\s[^>]*)?>)?(?:\s|<!--[\s\S]*?-->)*(?:<head(?:\s[^>]*)?>)?/i.exec(html.slice(offset));
  if (prefix) offset += prefix[0].length;
  return html.slice(0, offset) + bridge + html.slice(offset);
}
