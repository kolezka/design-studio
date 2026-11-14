import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDrafts } from "../../src/drafts/scan";

const root = mkdtempSync(join(tmpdir(), "design-scan-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function draft(dir: string, versions: number[], meta?: string): void {
  mkdirSync(dir, { recursive: true });
  for (const version of versions) writeFileSync(join(dir, `v${version}.html`), "<!doctype html><p>draft</p>");
  if (meta !== undefined) writeFileSync(join(dir, "meta.json"), meta);
}

function found(drafts: string, symlinks?: "refuse" | "follow"): string[] {
  return scanDrafts(drafts, symlinks).flatMap((target) => target.drafts.map((entry) => `${target.target}/${entry.id}@${entry.versions.join(",")}`));
}

describe("scanning the drafts folder", () => {
  test("lists targets and drafts in name order with their versions in number order", () => {
    const drafts = join(root, "plain");
    draft(join(drafts, "settings", "calm"), [1]);
    draft(join(drafts, "home", "bold"), [10, 2]);
    draft(join(drafts, "home", "airy"), [1]);
    expect(found(drafts)).toEqual(["home/airy@1", "home/bold@2,10", "settings/calm@1"]);
  });

  test("leaves out unsafe names, stray files and drafts without a version", () => {
    const drafts = join(root, "names");
    draft(join(drafts, "home", "good"), [1]);
    draft(join(drafts, "home", "bad..name!"), [1]);
    draft(join(drafts, ".hidden", "draft"), [1]);
    draft(join(drafts, "home", "empty"), []);
    writeFileSync(join(drafts, "home", "notes.txt"), "not a draft");
    writeFileSync(join(drafts, "home", "good", "v2.htm"), "wrong extension");
    expect(found(drafts)).toEqual(["home/good@1"]);
  });

  test("reports why meta.json cannot be used, and treats a missing one as fine", () => {
    const drafts = join(root, "meta");
    draft(join(drafts, "home", "broken"), [1], "{ not json");
    draft(join(drafts, "home", "list"), [1], "[]");
    draft(join(drafts, "home", "none"), [1]);
    draft(join(drafts, "home", "ok"), [1], '{"status":"selected"}');
    const [home] = scanDrafts(drafts);
    const byId = Object.fromEntries((home?.drafts ?? []).map((entry) => [entry.id, entry]));
    expect(byId.broken?.metaError).toStartWith("meta.json is not valid JSON or could not be read:");
    expect(byId.list?.metaError).toBe("meta.json must contain an object");
    expect(byId.none).toMatchObject({ meta: {}, metaError: null });
    expect(byId.ok).toMatchObject({ meta: { status: "selected" }, metaError: null });
  });

  describe("with symlinks", () => {
    const drafts = join(root, "links", "drafts");
    const outside = join(root, "links", "outside");
    draft(join(drafts, "home", "real"), [1]);
    draft(join(outside, "target", "draft"), [1], '{"status":"baseline"}');
    symlinkSync(join(outside, "target"), join(drafts, "linked-target"));
    symlinkSync(join(outside, "target", "draft"), join(drafts, "home", "linked-draft"));
    symlinkSync(join(outside, "target", "draft", "v1.html"), join(drafts, "home", "real", "v2.html"));
    symlinkSync(join(outside, "target", "draft", "meta.json"), join(drafts, "home", "real", "meta.json"));

    // The canvas serves what a scan returns, so a link must not pull in files from elsewhere.
    test("refuses linked folders, versions and metadata unless told otherwise", () => {
      const error = console.error;
      console.error = () => {};
      try {
        expect(found(drafts)).toEqual(["home/real@1"]);
        expect(scanDrafts(drafts)[0]?.drafts[0]?.metaError).toContain("not a regular file");
      } finally {
        console.error = error;
      }
    });

    // `shot --all` has always rendered linked drafts.
    test("follows them when asked", () => {
      expect(found(drafts, "follow")).toEqual(["home/linked-draft@1", "home/real@1,2", "linked-target/draft@1"]);
      const real = scanDrafts(drafts, "follow")[0]?.drafts.find((entry) => entry.id === "real");
      expect(real).toMatchObject({ meta: { status: "baseline" }, metaError: null });
    });
  });
});
