import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { bumpManifests, BUMPS, MANIFESTS, nextVersion } from "../scripts/bump-version";

const root = join(import.meta.dir, "..");
const script = join(root, "scripts", "bump-version.ts");
const fixtures: string[] = [];

// A copy of the real manifests, so the tests see their real formatting.
function fixture(edit: (file: string, text: string) => string = (_file, text) => text) {
  const dir = mkdtempSync(join(tmpdir(), "design-studio-bump-"));
  fixtures.push(dir);
  for (const file of MANIFESTS) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    cpSync(join(root, file), join(dir, file));
    writeFileSync(join(dir, file), edit(file, readFileSync(join(dir, file), "utf8")));
  }
  return dir;
}

const read = (dir: string) => MANIFESTS.map((file) => readFileSync(join(dir, file), "utf8"));
const versions = (dir: string) => read(dir).map((text) => JSON.parse(text).version);
const setVersion = (version: string) => (_file: string, text: string) => text.replace(/"version": "[^"]*"/, `"version": "${version}"`);

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("each bump raises its part and resets the lower ones", () => {
  expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
  expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
  expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
  expect(nextVersion("0.9.9", "patch")).toBe("0.9.10");
});

test("an unknown bump or a version that is not X.Y.Z is refused", () => {
  for (const bump of ["", "bogus", "Patch", "1.0.0"]) expect(() => nextVersion("1.2.3", bump)).toThrow("bump must be one of");
  for (const version of ["1.2", "1.2.3-beta.1", "v1.2.3", "01.2.3", ""]) expect(() => nextVersion(version, "patch")).toThrow("not X.Y.Z");
});

test("the Claude plugin manifest and the DSH adapter ship at the same version", () => {
  const [plugin, adapter] = versions(root);
  expect(plugin).toMatch(/^\d+\.\d+\.\d+$/);
  expect(adapter).toBe(plugin);
});

test("a bump moves every manifest to the new version and changes nothing else", () => {
  const dir = fixture(setVersion("1.2.3"));
  const before = read(dir);
  expect(bumpManifests(dir, "minor")).toBe("1.3.0");
  expect(versions(dir)).toEqual(["1.3.0", "1.3.0"]);
  expect(read(dir)).toEqual(before.map((text) => text.replace('"version": "1.2.3"', '"version": "1.3.0"')));
});

test("a dependency pinned to the same number is not bumped", () => {
  const dir = fixture((_file, text) => text.replace(/"version": "[^"]*"/, '"version": "0.2.0"'));
  expect(JSON.parse(read(dir)[1]).dependencies["claude-plugin-dsh"]).toBe("0.2.0");
  expect(bumpManifests(dir, "patch")).toBe("0.2.1");
  expect(versions(dir)).toEqual(["0.2.1", "0.2.1"]);
  expect(JSON.parse(read(dir)[1]).dependencies["claude-plugin-dsh"]).toBe("0.2.0");
});

test("a refused bump leaves every manifest untouched", () => {
  const drifted = fixture((file, text) => (file === MANIFESTS[1] ? setVersion("9.9.9")(file, text) : text));
  const invalid = fixture(setVersion("1.2"));
  // The second manifest cannot be bumped safely, so the first must not be written either.
  const ambiguous = fixture((file, text) => (file === MANIFESTS[1] ? text.replace('"dsh": {', `"dsh": {\n    "version": "${versions(root)[0]}",`) : text));
  for (const [dir, bump, message] of [
    [drifted, "patch", "manifest versions differ"],
    [invalid, "patch", "not X.Y.Z"],
    [ambiguous, "patch", "expected one"],
    [fixture(), "bogus", "bump must be one of"],
  ] as const) {
    const before = read(dir);
    expect(() => bumpManifests(dir, bump)).toThrow(message);
    expect(read(dir)).toEqual(before);
  }
  expect(read(ambiguous)[1]).toContain('"dsh": {\n    "version"');
});

test("the command prints only the new version, and fails loudly on bad input", () => {
  const dir = fixture(setVersion("1.2.3"));
  const run = (...args: string[]) => spawnSync("bun", [script, ...args], { encoding: "utf8" });
  const bumped = run("major", dir);
  expect({ status: bumped.status, stdout: bumped.stdout, stderr: bumped.stderr }).toEqual({ status: 0, stdout: "2.0.0\n", stderr: "" });
  expect(versions(dir)).toEqual(["2.0.0", "2.0.0"]);
  for (const args of [["bogus", dir], []]) {
    const refused = run(...args);
    expect(refused.status).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toStartWith("bump-version: ");
  }
  expect(versions(dir)).toEqual(["2.0.0", "2.0.0"]);
});

test("the workflow offers the same bumps and commits the files the script changes", () => {
  const workflow = Bun.YAML.parse(readFileSync(join(root, ".github", "workflows", "bump-version.yml"), "utf8")) as any;
  const input = workflow.on.workflow_dispatch.inputs.bump;
  expect(input.type).toBe("choice");
  expect([...input.options].sort()).toEqual([...BUMPS].sort());
  expect(workflow.permissions).toEqual({ contents: "write" });
  const commands = workflow.jobs.bump.steps.map((step: { run?: string }) => step.run ?? "").join("\n");
  expect(commands).toContain('bun scripts/bump-version.ts "$BUMP"');
  expect(commands).toContain(`git add ${MANIFESTS.join(" ")}\n`);
});
