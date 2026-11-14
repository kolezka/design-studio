// The `design-studio` command. Each subcommand is loaded only when it is asked for:
// the canvas bundles its browser code at start-up, which a screenshot run does not need.
import { EXIT, CliError } from "./exit";

const USAGE = `usage: design-studio <command> [options]

  canvas [--dir .design] [--port 4870] [--open]
      Serve the proposal canvas for a design directory.

  shot <draft.html> [--out file.png] [--width 1440] [--height 900] [--theme light|dark]
      Screenshot one draft.

  shot --all <design dir> [--theme light,dark] [--width 1440] [--height 900]
      Screenshot the latest version of every draft, plus a contact sheet per theme.`;

type Command = (args: string[]) => Promise<void> | void;

const COMMANDS: Record<string, () => Promise<Command>> = {
  canvas: async () => (await import("./canvas")).runCanvas,
  shot: async () => (await import("./shot")).runShot,
};

const [name, ...args] = process.argv.slice(2);

if (name === undefined || name === "help" || name === "--help" || name === "-h") {
  // Asking for help succeeds; calling with nothing is a mistake.
  if (name === undefined) console.error(USAGE);
  else console.log(USAGE);
  process.exit(name === undefined ? EXIT.usage : EXIT.ok);
}
if (!Object.hasOwn(COMMANDS, name)) {
  console.error(`Unknown command: ${name}\n\n${USAGE}`);
  process.exit(EXIT.usage);
}

try {
  const run = await COMMANDS[name]!();
  await run(args);
} catch (error) {
  if (!(error instanceof CliError)) throw error;
  console.error(error.message);
  process.exit(error.exitCode);
}
