import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const DSH = join(ROOT, "dsh");

// A minimal Cordis-like host that records what the adapter registers.
async function load() {
  const plugin = await import(join(DSH, "index.js"));
  const seen = { providers: [] as any[], commands: [] as string[], sections: [] as unknown[], events: [] as string[], warnings: [] as string[] };
  const ctx: any = {
    logger: { warn: (message: string) => seen.warnings.push(message) },
    skills: { registerProvider: (create: any) => seen.providers.push(create({ signal: new AbortController().signal, invalidate() {} })) },
    commands: { register: (definition: { name: string }) => seen.commands.push(definition.name) },
    systemPrompt: { section: (section: unknown) => seen.sections.push(section) },
    workingDirectory: { get: () => ROOT },
    inject: (_services: string[], callback: (sub: unknown) => void) => callback(ctx),
    effect() {},
    on: (event: string) => seen.events.push(event),
  };
  await plugin.apply(ctx, {});
  return { plugin, seen };
}

test("the DSH adapter registers the design-studio skill with its real body", async () => {
  const { plugin, seen } = await load();
  expect(plugin.name).toBe("claude-compat-design-studio");
  expect(seen.warnings).toEqual([]);
  expect(seen.providers).toHaveLength(1);

  const candidates = await seen.providers[0].list({});
  expect(candidates.map((c: { name: string }) => c.name)).toEqual(["design-studio"]);
  const [skill] = candidates;
  expect(skill.description).toStartWith("Use when the user asks to design, redesign, restyle or mock up");
  expect(skill.invocation).toEqual({ modelInvocable: true, userInvocable: true });
  expect(skill.resourceBase).toEqual({ kind: "directory", path: join(ROOT, "skills", "design-studio") });

  const body = await seen.providers[0].get(skill, {});
  expect(body.content).toContain("# Design studio");
  expect(body.content).toContain("bun <skill-dir>/scripts/shot.ts");
  // Script paths in the skill are relative, so DSH must be told where they resolve from.
  expect(body.content).toContain(`Relative paths in this skill resolve from \`${join(ROOT, "skills", "design-studio")}\``);
});

test("the plugin has no commands, instructions or hooks to map", async () => {
  const { seen } = await load();
  expect(seen.commands).toEqual([]);
  expect(seen.sections).toEqual([]);
  expect(seen.events).toEqual([]);
});

test("the bundle patch loads the package the adapter declares", () => {
  const pkg = JSON.parse(readFileSync(join(DSH, "package.json"), "utf8"));
  const patch = readFileSync(join(DSH, "cordis.patch.yml"), "utf8");
  expect(pkg.name).toBe("@kolezka/design-studio-dsh");
  expect(pkg.dsh.bundle.patch).toBe("./cordis.patch.yml");
  expect(pkg.exports["."]).toBe("./index.js");
  expect(patch).toContain("id: claude-compat-design-studio");
  expect(patch).toContain(`name: '${pkg.name}'`);
});
