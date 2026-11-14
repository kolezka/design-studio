# Development

## Tests

```bash
bun install          # dev tools only: TypeScript and Bun's types
bun run typecheck
bun run test:unit    # graph and layout logic, no browser, under a second
bun test             # everything, about a minute
```

The tests cover the canvas: ordering, the latest version, the style line, a malformed `meta.json` shown as an error, only draft files served, a foreign `Host` refused, and the theme and size switches. When Chrome and `agent-browser` are installed, browser tests also check that previews really render.

## Bumping the version

The version lives in `.claude-plugin/plugin.json` and `dsh/package.json`, and both must match. Claude Code only offers an update when it changes.

On GitHub, run the **Bump version** workflow from `main` (Actions, Bump version, Run workflow) and pick `patch`, `minor` or `major`. It bumps both files and pushes the commit to `main`.

The same bump from a clone, without the commit:

```bash
bun scripts/bump-version.ts patch
```

## Layout

`bin/design-studio` is the only entry point. It runs `src/cli/main.ts` with Bun.

| Folder | What lives there | Runs in |
| --- | --- | --- |
| `src/cli` | Argument parsing, messages and exit codes for `canvas` and `shot` | Bun |
| `src/drafts` | Reading `.design/drafts` safely: no symlinks, no pipes, no odd names | Bun |
| `src/server` | The canvas HTTP server, the change feed, page and draft assembly | Bun |
| `src/screenshot` | Headless Chrome captures and the contact sheet | Bun |
| `src/canvas` | The canvas page: `page.html`, `page.css` and its TypeScript | Browser |
| `src/canvas/graph` | Drafts to version nodes: variants, parents, cycles, changes. No DOM | Browser, tests |
| `src/bridge` | The selection script inserted into every draft | Browser, inside a draft |
| `src/shared` | Types and constants both sides agree on, such as the message protocol | Both |
| `skills/design-studio` | Instructions for the model. No code | |
| `scripts` | Repository upkeep, such as the version bump. Not part of the tool | Bun |

There is no build step. The server bundles `src/canvas/main.ts` and `src/bridge/main.ts` in memory with `Bun.build` when it starts, so an installed plugin needs only Bun and no `node_modules`. `src/` must stay free of runtime dependencies for that reason.

Code under `src/canvas/graph` and `src/canvas/layout.ts` takes plain data and returns plain data. Put new graph rules there and cover them in `tests/unit`, where a test takes milliseconds instead of a browser start.

## Refreshing the README screenshots

The screenshots come from [`docs/demo/quayside`](demo/quayside), a fictional project with drafts only: one deployments screen with a baseline, two directions and a follow-up. Render it from a copy, so `shots/` stays out of the repository:

```bash
cp -R docs/demo/quayside /tmp/quayside
bin/design-studio shot --all /tmp/quayside
cp /tmp/quayside/shots/sheet-dark-1440x900.png docs/images/sheet-dark.png
bin/design-studio canvas --dir /tmp/quayside
```

Then screenshot the canvas URL it prints at 1920x1360 into `docs/images/canvas.png`, and stop the canvas with the `kill` command it prints.
