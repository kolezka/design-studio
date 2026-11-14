import { fileURLToPath } from "node:url";

/**
 * Bundles a browser entry point into one classic script that is safe to inline in HTML.
 * The plugin ships TypeScript sources and has no build step, so this runs at start-up.
 */
export async function bundleInlineScript(entry: URL): Promise<string> {
  const path = fileURLToPath(entry);
  const result = await Bun.build({ entrypoints: [path], target: "browser", format: "iife" });
  const [output] = result.outputs;
  if (!result.success || !output) throw new AggregateError(result.logs, `Cannot bundle ${path}`);
  return asciiOnly(await output.text()).replace(/<\/script/gi, "<\\/script");
}

/**
 * A draft without a charset declaration is not read as UTF-8, which would garble
 * any other character in the script. `\uXXXX` means the same in strings, templates,
 * regular expressions and identifiers.
 */
function asciiOnly(script: string): string {
  return script.replace(/[^\x00-\x7F]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
