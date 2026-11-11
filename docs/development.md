# Development

## Tests

```bash
bun test
```

The tests cover the canvas: ordering, the latest version, the style line, a malformed `meta.json` shown as an error, only draft files served, a foreign `Host` refused, and the theme and size switches. When Chrome and `agent-browser` are installed, browser tests also check that previews really render.

## Refreshing the README screenshots

The screenshots come from [`docs/demo/quayside`](demo/quayside), a fictional project with drafts only: one deployments screen with a baseline, two directions and a follow-up. Render it from a copy, so `shots/` stays out of the repository:

```bash
cp -R docs/demo/quayside /tmp/quayside
bun skills/design-studio/scripts/shot.ts --all /tmp/quayside
cp /tmp/quayside/shots/sheet-dark-1440x900.png docs/images/sheet-dark.png
bun skills/design-studio/scripts/canvas.ts --dir /tmp/quayside
```

Then screenshot the canvas URL it prints at 1920x1360 into `docs/images/canvas.png`, and stop the canvas with the `kill` command it prints.
