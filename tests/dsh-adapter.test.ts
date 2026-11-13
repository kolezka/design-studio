import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dir, "..");

test("the standalone DSH adapter resolves the published runtime and registers the real skill", () => {
  expect(existsSync(join(root, "dsh", "index.js"))).toBe(true);
  const fixture = mkdtempSync(join(realpathSync(tmpdir()), "design-studio-dsh-"));
  try {
    cpSync(join(root, "dsh"), join(fixture, "dsh"), { recursive: true, filter: (path) => !path.includes("node_modules") });
    cpSync(join(root, "skills"), join(fixture, "skills"), { recursive: true });
    cpSync(join(root, ".claude-plugin"), join(fixture, ".claude-plugin"), { recursive: true });
    const dsh = join(fixture, "dsh");
    const pkg = JSON.parse(readFileSync(join(dsh, "package.json"), "utf8"));
    expect(pkg.dependencies["claude-plugin-dsh"]).toBe("0.2.0");
    expect(readFileSync(join(dsh, "index.js"), "utf8")).toContain("from 'claude-plugin-dsh'");
    expect(existsSync(join(dsh, "claude-compat.js"))).toBe(false);
    expect(pkg.files).not.toContain("claude-compat.js");
    const install = spawnSync("bun", ["install", "--frozen-lockfile"], { cwd: dsh, encoding: "utf8" });
    expect({ status: install.status, stderr: install.stderr }).toEqual({ status: 0, stderr: install.stderr });
    const probe = `
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      let resolved;
      try { resolved = require.resolve('claude-plugin-dsh'); }
      catch (error) { console.error('RUNTIME_RESOLUTION_FAILED', error.code); process.exit(2); }
      const { default: plugin } = await import('./index.js');
      const seen = { providers: [], commands: [], sections: [], events: [], warnings: [] };
      const ctx = {
        logger: { warn: message => seen.warnings.push(message) },
        skills: { registerProvider: create => seen.providers.push(create({ signal: new AbortController().signal, invalidate() {} })) },
        commands: { register: definition => seen.commands.push(definition.name) },
        systemPrompt: { section: section => seen.sections.push(section) },
        workingDirectory: { get: () => ${JSON.stringify(fixture)} },
        inject: (_services, callback) => callback(ctx), effect() {}, on: event => seen.events.push(event),
      };
      await plugin.apply(ctx, {});
      const skills = await seen.providers[0].list({});
      const body = await seen.providers[0].get(skills[0], {});
      console.log(JSON.stringify({ resolved, name: plugin.name, skills, body, warnings: seen.warnings, commands: seen.commands, sections: seen.sections, events: seen.events }));
    `;
    writeFileSync(join(dsh, "probe.mjs"), probe);
    const run = () => spawnSync("node", ["probe.mjs"], { cwd: dsh, encoding: "utf8" });
    const result = run();
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" });
    const output = JSON.parse(result.stdout);
    expect(output.resolved).toContain("/dsh/node_modules/claude-plugin-dsh/");
    expect(output.name).toBe("claude-compat-design-studio");
    expect(output.skills.map((skill: { name: string }) => skill.name)).toEqual(["design-studio"]);
    expect(output.skills[0].description).toStartWith("Use when the user asks to design, redesign, restyle or mock up");
    expect(output.skills[0].resourceBase).toEqual({ kind: "directory", path: join(fixture, "skills", "design-studio") });
    expect(output.body.content).toContain("# Design studio");
    expect(output.body.content).toContain("bun <skill-dir>/scripts/shot.ts");
    expect(output.warnings).toEqual([]);
    expect(output.commands).toEqual([]);
    expect(output.sections).toEqual([]);
    expect(output.events).toEqual([]);
    renameSync(join(dsh, "node_modules", "claude-plugin-dsh"), join(dsh, "node_modules", "runtime-disabled"));
    const missing = run();
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("RUNTIME_RESOLUTION_FAILED MODULE_NOT_FOUND");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}, 120_000);
