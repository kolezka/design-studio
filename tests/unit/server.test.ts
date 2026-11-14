import { describe, expect, test } from "bun:test";
import { inReviewOrder } from "../../src/drafts/scan";
import { contactSheet } from "../../src/screenshot/contact-sheet";
import { bundleInlineScript } from "../../src/server/browser-bundle";
import { instrumentDraft } from "../../src/server/instrument-draft";
import { renderCanvasPage } from "../../src/server/page";
import { isDraftName, versionOfFile } from "../../src/shared/drafts";

describe("draft names", () => {
  test("a name is one safe path segment", () => {
    for (const name of ["home", "v2.dark", "a_b-c", "0", "x".repeat(81)]) expect(isDraftName(name)).toBe(true);
    for (const name of ["", ".hidden", "-flag", "a/b", "a b", "..", "x".repeat(82), 7, null, undefined]) expect(isDraftName(name)).toBe(false);
  });

  test("only v<N>.html is a version file", () => {
    expect(versionOfFile("v1.html")).toBe(1);
    expect(versionOfFile("v012.html")).toBe(12);
    for (const name of ["v1.htm", "v.html", "v-1.html", "V1.html", "v1.html.bak", "xv1.html", "meta.json"]) expect(versionOfFile(name)).toBeNull();
  });
});

describe("review order", () => {
  const summary = (id: string, status?: unknown) => ({ target: "home", id, meta: status === undefined ? {} : { status }, metaError: null, versions: [1], versionHashes: {} });

  test("baseline, selected, candidates, rejected, then anything else, by name within each", () => {
    const [{ drafts } = { drafts: [] }] = inReviewOrder([
      { target: "home", drafts: [summary("z", "rejected"), summary("odd", "archived"), summary("num", 3), summary("b"), summary("a", "candidate"), summary("pick", "selected"), summary("now", "baseline")] },
    ]);
    expect(drafts.map((draft) => draft.id)).toEqual(["now", "pick", "a", "b", "z", "num", "odd"]);
  });

  test("the input is left as it was", () => {
    const targets = [{ target: "home", drafts: [summary("b"), summary("a")] }];
    inReviewOrder(targets);
    expect(targets[0]?.drafts.map((draft) => draft.id)).toEqual(["b", "a"]);
  });
});

describe("inline scripts", () => {
  const bridge = /^<script>\n[\s\S]*?<\/script>/;

  test("the bundles are plain ASCII and cannot close their own script tag", async () => {
    for (const entry of ["../../src/canvas/main.ts", "../../src/bridge/main.ts"]) {
      const script = await bundleInlineScript(new URL(entry, import.meta.url));
      expect(script.length).toBeGreaterThan(1000);
      // A draft without a charset declaration would garble anything else.
      expect(/[^\x00-\x7F]/.test(script)).toBe(false);
      expect(/<\/script/i.test(script)).toBe(false);
    }
  });

  test("a missing entry point fails loudly", async () => {
    await expect(bundleInlineScript(new URL("./no-such-entry.ts", import.meta.url))).rejects.toThrow();
  });

  test("the bridge goes after the doctype and the opening html and head tags", () => {
    const after = (prefix: string, rest: string) => {
      const html = instrumentDraft(prefix + rest);
      expect(html.startsWith(prefix)).toBe(true);
      expect(html.endsWith(rest)).toBe(true);
      expect(bridge.test(html.slice(prefix.length))).toBe(true);
    };
    after("", "<h1>No doctype</h1>");
    after("<!doctype html>", "<h1>Doctype only</h1>");
    after('<!-- note -->\n<!DOCTYPE html>\n<html lang="en">\n<head>', '<meta charset="utf-8"><title>x</title></head><body></body></html>');
    after("\uFEFF", "<p>Byte order mark</p>");
    after("<!doctype html><html>", "<body><p>No head</p></body></html>");
  });

  test("tags inside the draft's own scripts are not mistaken for the document start", () => {
    const html = instrumentDraft("<script>const markup = '<head>';</script><p>x</p>");
    expect(html.indexOf("const markup")).toBeGreaterThan(html.indexOf("</script>"));
  });
});

describe("the canvas page", () => {
  const page = (overrides: Record<string, unknown> = {}) => renderCanvasPage({ projectName: "Shop", root: "/work/shop/.design", theme: "light", width: 1440, height: 900, targets: [], ...overrides });
  const bootstrap = (html: string) => JSON.parse(/const initial = (\{.*\});/.exec(html)![1]!);

  test("carries the bootstrap data and leaves no placeholder behind", () => {
    const html = page({ targets: [{ target: "home", drafts: [] }] });
    expect(bootstrap(html)).toEqual({ projectName: "Shop", root: "/work/shop/.design", theme: "light", width: 1440, height: 900, targets: [{ target: "home", drafts: [] }] });
    for (const placeholder of ["CANVAS_PAYLOAD", "CANVAS_SCRIPT", "CANVAS_STYLES"]) expect(html).not.toContain(placeholder);
  });

  test("an unknown theme is light, and sizes are clamped or defaulted", () => {
    expect(bootstrap(page({ theme: "dark" })).theme).toBe("dark");
    expect(bootstrap(page({ theme: "sepia" })).theme).toBe("light");
    expect(bootstrap(page({ width: "390", height: "844" }))).toMatchObject({ width: 390, height: 844 });
    expect(bootstrap(page({ width: 10, height: 99999 }))).toMatchObject({ width: 320, height: 2400 });
    expect(bootstrap(page({ width: 99999, height: 10 }))).toMatchObject({ width: 2560, height: 320 });
    expect(bootstrap(page({ width: "wide", height: null }))).toMatchObject({ width: 1440, height: 900 });
  });

  test("data that looks like a placeholder or a replacement pattern is kept as text", () => {
    const projectName = "/* CANVAS_SCRIPT */ $& $1 CANVAS_PAYLOAD";
    expect(bootstrap(page({ projectName })).projectName).toBe(projectName);
  });
});

describe("the contact sheet", () => {
  const cells = (count: number) => Array.from({ length: count }, (_, index) => ({ image: `/tmp/shots/${index}.png`, caption: `home / draft-${index} v1 (candidate)` }));

  test("is at most three columns wide and grows by rows", () => {
    const shot = { width: 1440, height: 900 };
    // 600 px thumbnails keep the shot's ratio (375 px) above a 44 px caption.
    expect(contactSheet(cells(1), shot)).toMatchObject({ width: 632, height: 451 });
    expect(contactSheet(cells(3), shot)).toMatchObject({ width: 1864, height: 451 });
    expect(contactSheet(cells(4), shot)).toMatchObject({ width: 1864, height: 886 });
    expect(contactSheet([], shot)).toMatchObject({ width: 632, height: 16 });
  });

  test("narrow shots are scaled by the width Chrome really renders", () => {
    // A 390 px shot is a 500 px image, so the thumbnail is 844 * 600 / 500 tall.
    expect(contactSheet(cells(1), { width: 390, height: 844 }).height).toBe(1013 + 44 + 32);
  });

  test("captions cannot add markup, and images are file URLs", () => {
    const { html } = contactSheet([{ image: "/tmp/my shots/a.png", caption: "home / <b>bold</b> & co v1" }], { width: 1440, height: 900 });
    expect(html).toContain("<figcaption>home / bbold/b  co v1</figcaption>");
    expect(html).toContain('<img src="file:///tmp/my%20shots/a.png">');
  });
});
