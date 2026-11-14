import { bundleInlineScript } from "./browser-bundle";

const bridge = `<script>\n${await bundleInlineScript(new URL("../bridge/main.ts", import.meta.url))}</script>`;

const LEADING_DOCTYPE = /^(?:\uFEFF|\s|<!--[\s\S]*?-->)*<!doctype\s+[^>]*>/i;
const HTML_AND_HEAD_TAGS = /^(?:\s|<!--[\s\S]*?-->)*(?:<html(?:\s[^>]*)?>)?(?:\s|<!--[\s\S]*?-->)*(?:<head(?:\s[^>]*)?>)?/i;
const BYTE_ORDER_MARK = 0xfeff;

/**
 * Adds the selection bridge to a draft, as early in the document as it can go.
 *
 * This is a string insertion, not an HTML parser. It keeps a leading doctype
 * (with any whitespace and comments before it) in front of the script. Malformed
 * doctypes, XHTML, attribute values containing `>`, a restrictive CSP and draft
 * scripts that interfere with the bridge are not supported.
 */
export function instrumentDraft(html: string): string {
  const doctype = LEADING_DOCTYPE.exec(html);
  let offset = doctype ? doctype[0].length : html.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;
  // Only the document prefix is inspected, so a tag inside a script never matches.
  offset += HTML_AND_HEAD_TAGS.exec(html.slice(offset))?.[0].length ?? 0;
  return html.slice(0, offset) + bridge + html.slice(offset);
}
