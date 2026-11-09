# design-studio

A Claude Code plugin for designing and redesigning UI the way Superdesign does it, without the service. The model you are already talking to writes the drafts as single-file HTML, looks at every render, and puts them side by side on a local canvas. Nothing leaves the machine and nothing costs credits.

What it adds over asking for a mockup directly:

- **Content from the code.** The skill reads the real screen first and writes `.design/context.md`, so drafts use real labels and data. Anything a draft shows that the product does not have is listed in `proposed`.
- **A baseline.** The current screen is reproduced as a draft with sample data, so every variant is compared with what exists today.
- **One style once a direction is chosen.** `.design/design-system.md` is written from the chosen draft and every later screen uses it.
- **Versions.** `v1.html`, `v2.html` per draft, alternatives as new drafts with a parent, all kept in `.design/` for later sessions.
- **Looking before claiming.** `shot.ts --all .design` renders the latest version of every draft in light and dark and lays them out on one contact sheet per theme. It prints errors the page threw and exits 4, so a Tailwind compile error (which leaves the page unstyled) is not missed. Narrow widths render at the real width; headless Chrome cannot go below 500 px, so the script frames them instead of silently cropping.
- **A canvas.** `canvas.ts` shows every draft of every screen side by side, switches light, dark, desktop, tablet and phone, and reloads when a file changes. Read only, bound to 127.0.0.1.

## Install

```bash
claude plugin marketplace add ~/Development/design-studio
claude plugin install design-studio@design-studio-local
```

Needs [Bun](https://bun.sh) and Chrome, Chromium, Edge or Brave (or `CHROME_PATH`). Drafts load Tailwind from jsDelivr, so the first render needs network access.

## Use

Ask for a design or redesign in a project, for example "the settings page is ugly, show me two directions". The skill triggers on its own; you can also name it (`design-studio`). Open the canvas URL it gives you, pick a direction, give feedback, and ask for the code once you like a draft.

Run the canvas yourself:

```bash
bun skills/design-studio/scripts/canvas.ts --dir path/to/project/.design --open
```

## Develop

```bash
bun test
```

`tests/` cover the canvas: ordering, the latest version, malformed `meta.json` shown as an error, only draft files served, foreign `Host` refused.
