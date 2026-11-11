# design-studio

UI design drafts for Claude Code, drawn by the model you already use and compared side by side on a local canvas. No design service, no credits, nothing leaves your machine.

![The canvas: every draft of every screen side by side](docs/images/canvas.png)

Ask Claude Code something like *"the settings page looks dated, show me two directions before we change any code"* and you get:

- **a baseline:** today's screen rebuilt with sample data, so every proposal is compared with what exists now
- **two or three directions** that differ in structure (layout, navigation, density), with real labels from your code and every state your data has
- **drafts the model has looked at:** each one is rendered in light and dark and fixed before you see it
- **a canvas** with all drafts side by side, switchable between light and dark, desktop, tablet and phone

Pick a direction, ask for changes, and say "implement it" when you like what you see. Your product code is not touched before that.

## Why

Hosted tools such as Superdesign run a good process: reproduce the current UI, explore variants, iterate, keep one design system. In our tests a current Claude model drew drafts as good as the hosted ones without any help. What went wrong without guidance was everything around the drawing: features the product does not have, a different palette on every screen, phone screenshots silently cropped, and fixes reported for renders nobody had looked at. design-studio is that process plus the tools to check the result. [docs/testing.md](docs/testing.md) records the runs.

## Install

You need Claude Code, [Bun](https://bun.sh), and Chrome, Chromium, Edge or Brave (or a browser path in `CHROME_PATH`). Drafts load Tailwind from jsDelivr, so rendering needs network access.

```bash
claude plugin marketplace add kolezka/design-studio
claude plugin install design-studio@design-studio-local
```

Start a new Claude Code session afterwards. `claude plugin list` should show `design-studio@design-studio-local` as enabled.

Update or remove it with:

```bash
claude plugin marketplace update design-studio-local
claude plugin update design-studio@design-studio-local
claude plugin uninstall design-studio@design-studio-local
```

### DeepSeek Harness

From a clone of this repository, install the adapter's published runtime before adding the plugin:

```bash
bun install --cwd dsh --frozen-lockfile
dsh plugin --profile <name> add file:/abs/path/dsh
```

After updating the clone, run the frozen install again before using the adapter. To inspect the adapter without installing it in a DSH profile:

```bash
bun x claude-plugin-dsh@0.1.0 inspect .
```

The adapter imports `claude-plugin-dsh` directly. When changing its dependency, update `dsh/package.json` and run `bun install --cwd dsh` to refresh `dsh/bun.lock`. Do not use the runtime's `sync` or `scaffold` commands here: version 0.1.0 generates a vendored runtime.

## Use

In any project, ask for a design. The skill starts on its own for requests like these:

- "The settings page looks dated. Show me two directions before we change any code."
- "Design an onboarding screen in the same style as the dashboard."
- "The pricing table is cluttered. Three variants, please."

You can also name it: "use design-studio".

What happens next:

1. Claude reads the screen's code and writes what it found to `.design/context.md`.
2. It rebuilds today's screen with sample data as the baseline.
3. It draws the directions as single-file HTML drafts.
4. It renders every draft, looks at the images and fixes what is wrong.
5. It starts the canvas and gives you its address, usually `http://127.0.0.1:4870/`.

Then talk to it: "go with the second one, but make the list denser" adds a `v2` to that draft and keeps `v1`. When you pick a direction, its style is written to `.design/design-system.md` and every later screen follows it. "Implement it" is when product code changes.

## The canvas

Drafts appear as preview nodes, connected to their parent proposals. Pan and zoom the canvas, open a full preview, or choose an earlier version. Light and dark themes and desktop, tablet and phone preview sizes are available at the top. Draft changes refresh the previews without reloading the canvas.

Open Full preview and click an element to prepare a change request. Selection starts enabled; choose Interact with preview to use the draft's controls instead. You can also right-click an element or use Select element on a node. Copy the request into the existing chat: the canvas does not send it to an agent or generate a proposal. Selection is best effort and may not work in every draft, especially with nested frames or restrictive content policies. In selection mode, use arrow keys to navigate the preview DOM and Enter or Space to select. The canvas is read only and listens on `127.0.0.1` only.

To open it yourself, from a clone of this repository:

```bash
bun skills/design-studio/scripts/canvas.ts --dir path/to/your/project/.design --open
```

For review, `shot.ts --all` renders every draft and lays them out on one contact sheet per theme:

![A contact sheet of seven drafts in the dark theme](docs/images/sheet-dark.png)

## What ends up in your project

```
.design/
  context.md             what the code says: stack, tokens, screens, data, labels, states
  design-system.md       written once you pick a direction
  drafts/<screen>/<draft>/
    meta.json            direction, status, parent, style, what it proposes
    v1.html, v2.html     every version kept
  shots/                 renders and contact sheets
```

Commit it if you want the design history in the repository, or add `.design/` to `.gitignore`.

## Scripts

Both run with Bun and need no install step.

| Command | What it does |
| --- | --- |
| `shot.ts <draft.html> [--theme dark] [--width 390] [--height 1800]` | Renders one draft to a PNG |
| `shot.ts --all .design [--theme light,dark] [--width 1440] [--height 900]` | Renders the latest version of every draft and writes `shots/sheet-<theme>-<width>x<height>.png` |
| `canvas.ts [--dir .design] [--port 4870] [--open]` | Serves the canvas; prints its URL and the command that stops it |

`shot.ts` exits 1 when no screenshot was made and 4 when the screenshots exist but a page threw an error, such as a Tailwind error that leaves the page unstyled. Headless Chrome cannot lay out narrower than 500 px, so phone widths are rendered in a frame of the exact width instead of being cropped.

## Limits

- Drafts are HTML with Tailwind. Turning the chosen one into your framework's components is the implementation step, done by Claude in your stack.
- Rendering needs Chrome or a Chromium browser, and network access for Tailwind.
- There are no comments on the canvas and no multi-user editing. Feedback goes into the chat.
- Drafts can run scripts and load external resources. Only open drafts from sources you trust; the preview sandbox is not a complete network isolation boundary.
- Draft quality depends on the model. It was tested with Claude Opus 5.5.
- Not affiliated with Superdesign.

## Development

```bash
bun test
```

The tests cover the canvas: ordering, the latest version, the style line, a malformed `meta.json` shown as an error, only draft files served, a foreign `Host` refused, and, when Chrome is installed, that preview frames really have a height in a browser.

## License

[MIT](LICENSE)
