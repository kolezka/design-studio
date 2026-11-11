# Development

## Tests

```bash
bun test
```

The tests cover the canvas: ordering, the latest version, the style line, a malformed `meta.json` shown as an error, only draft files served, a foreign `Host` refused, and the theme and size switches. When Chrome and `agent-browser` are installed, browser tests also check that previews really render.

## Canvas sources

The Bun entry point is `skills/design-studio/scripts/canvas.ts`. The page shell, styles and browser behavior live beside it in `canvas-ui.html`, `canvas-ui.css` and `canvas-ui.browser.js`. `canvas-ui.ts` combines them with the escaped initial data when serving the page. These files ship with the skill, so users do not need a build step. The preview selection bridge is in `canvas-bridge.ts`.

## Refreshing the README screenshots

The screenshots come from [`docs/demo/quayside`](demo/quayside), a fictional project with drafts only: one deployments screen with a baseline, two directions and a follow-up. Render it from a copy, so `shots/` stays out of the repository:

```bash
cp -R docs/demo/quayside /tmp/quayside
bun skills/design-studio/scripts/shot.ts --all /tmp/quayside
cp /tmp/quayside/shots/sheet-dark-1440x900.png docs/images/sheet-dark.png
bun skills/design-studio/scripts/canvas.ts --dir /tmp/quayside
```

Then screenshot the canvas URL it prints at 1920x1360 into `docs/images/canvas.png`, and stop the canvas with the `kill` command it prints.
