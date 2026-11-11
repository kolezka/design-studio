# User guide

The details behind the [README](../README.md).

## How a design request runs

The skill starts on its own for requests like "the pricing table is cluttered, three variants please". You can also name it: "use design-studio".

1. Claude reads the screen's code and writes what it found to `.design/context.md`.
2. For a screen that exists, it rebuilds today's UI with sample data as the baseline. A new screen has no baseline and starts from the shell of the closest existing screen.
3. It draws the directions as single-file HTML drafts.
4. It renders every draft, looks at the images and fixes what is wrong.
5. It starts the canvas and gives you its address, usually `http://127.0.0.1:4870/`.

Feedback on a draft adds `v2.html` next to `v1.html`. A new alternative gets its own folder with a link to its parent. When you pick a direction, its style is written to `.design/design-system.md` and every later screen follows it.

## The canvas

The canvas is a proposal graph. Each draft is a card with a live preview, its status (baseline, candidate, selected or rejected) and a line to the draft it came from. Its direction and style notes appear when the draft has them. Baselines sit on the left, directions next to them, follow-ups further right.

- Drag the background to pan, zoom with the controls at the bottom, and use Fit canvas to see everything.
- Each card has a version picker.
- Light and dark themes and desktop, tablet and phone sizes are switched at the top.
- Draft changes refresh the previews without reloading the page.

To prepare a change request, open Full preview and click an element. Selection starts on; choose Interact with preview to use the draft's own controls instead. You can also right-click an element, or use Select element on a card. In selection mode, arrow keys move through the page and Enter or Space selects. Copy the request into the chat: the canvas does not send anything to an agent.

Selection is best effort. It may not work with nested frames or strict content policies.

The canvas is read only and listens on `127.0.0.1` only. Draft previews run in a sandbox, but it is not a full network isolation boundary, so only open drafts you trust.

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

The full format is in [the draft contract](../skills/design-studio/references/draft-contract.md).

## Scripts

Claude runs these for you. To run them yourself, use a clone of this repository. Both need only Bun.

| Command | What it does |
| --- | --- |
| `bun skills/design-studio/scripts/canvas.ts [--dir .design] [--port 4870] [--open]` | Serves the canvas, prints its URL and the command that stops it |
| `bun skills/design-studio/scripts/shot.ts <draft.html> [--theme dark] [--width 390] [--height 1800]` | Renders one draft to a PNG |
| `bun skills/design-studio/scripts/shot.ts --all .design [--theme light,dark] [--width 1440] [--height 900]` | Renders the latest version of every draft and writes `shots/sheet-<theme>-<width>x<height>.png` |

Set `CHROME_PATH` if your browser is not found.

`shot.ts` exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Every render succeeded |
| 1 | At least one render failed |
| 2 | Wrong arguments, or no `drafts/` folder |
| 3 | No Chrome or Chromium found |
| 4 | Renders exist, but a page threw an error (often a Tailwind error that leaves the page unstyled) |

Headless Chrome cannot lay out narrower than 500 px, so phone widths are rendered in a frame of the exact width instead of being cropped.

## Limits

- Rendering needs Chrome or a Chromium browser, and network access for Tailwind.
- There are no comments on the canvas and no multi-user editing. Feedback goes into the chat.

## Update or remove

```bash
claude plugin marketplace update design-studio-local
claude plugin update design-studio@design-studio-local
claude plugin uninstall design-studio@design-studio-local
```

`claude plugin list` shows whether `design-studio@design-studio-local` is enabled.
