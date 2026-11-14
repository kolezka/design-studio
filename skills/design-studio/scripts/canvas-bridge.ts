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
  // Drag a box to pick every element inside it.
  let box = null, boxView = null, dragged = false;
  const boxRect = () => ({ left: Math.min(box.x, box.x2), top: Math.min(box.y, box.y2), right: Math.max(box.x, box.x2), bottom: Math.max(box.y, box.y2) });
  const elementsIn = (r) => {
    const picked = [];
    for (const element of document.body ? document.body.querySelectorAll('*') : []) {
      if (element === boxView || picked.some(p => p.contains(element))) continue;
      const e = element.getBoundingClientRect();
      if (!e.width || !e.height) continue;
      if (e.left >= r.left && e.right <= r.right && e.top >= r.top && e.bottom <= r.bottom) picked.push(element);
      if (picked.length === 20) break;
    }
    return picked;
  };
  document.addEventListener('pointerdown', (event) => {
    keyboardFocus = false;
    dragged = false;
    if (enabled && event.button === 0 && event.isPrimary) box = { x: event.clientX, y: event.clientY, x2: event.clientX, y2: event.clientY };
  }, true);
  document.addEventListener('pointermove', (event) => {
    if (!box) return;
    box.x2 = event.clientX; box.y2 = event.clientY;
    if (!dragged && Math.hypot(box.x2 - box.x, box.y2 - box.y) < 6) return;
    if (!dragged) { const s = getSelection(); if (s) s.removeAllRanges(); }
    dragged = true;
    event.preventDefault();
    clearHighlight();
    if (!boxView) {
      boxView = document.createElement('div');
      boxView.setAttribute('data-design-studio-box', '');
      boxView.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:2px solid #e08624;background:rgba(224,134,36,.12);border-radius:3px';
      document.documentElement.append(boxView);
    }
    const r = boxRect();
    Object.assign(boxView.style, { left: r.left + 'px', top: r.top + 'px', width: (r.right - r.left) + 'px', height: (r.bottom - r.top) + 'px' });
  }, true);
  const endBox = () => {
    if (boxView) { boxView.remove(); boxView = null; }
    const r = box && dragged ? boxRect() : null;
    box = null;
    if (!r || !enabled) return;
    const picked = elementsIn(r);
    if (!picked.length) return;
    if (picked.length === 1) { highlight(picked[0], false); select(picked[0]); return; }
    window.parent.postMessage({
      type: 'design-studio:selection',
      context: false,
      nonce,
      selector: picked.length + ' elements',
      text: picked.map(p => (p.textContent || '').trim()).filter(Boolean).join(' \\u00b7 ').slice(0, 200),
      items: picked.map(p => ({ selector: selectorFor(p), text: (p.textContent || '').trim().slice(0, 120) }))
    }, '*');
  };
  // Native text selection would paint over the box while dragging.
  document.addEventListener('selectstart', (event) => { if (enabled) event.preventDefault(); }, true);
  document.addEventListener('pointerup', endBox, true);
  document.addEventListener('pointercancel', () => { dragged = false; endBox(); }, true);
  document.addEventListener('pointerover', (event) => { if (enabled && !box) highlight(eventElement(event), false); }, true);
  document.addEventListener('pointerout', (event) => { if (enabled && !event.relatedTarget) clearHighlight(); }, true);
  for (const type of ['contextmenu', 'click']) {
    document.addEventListener(type, (event) => {
      if (!enabled && type !== 'contextmenu') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (type === 'click' && dragged) { dragged = false; return; }
      select(eventElement(event), type === 'contextmenu');
    }, true);
  }
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
