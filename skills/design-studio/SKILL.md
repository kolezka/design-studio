---
name: design-studio
description: Use when the user asks to design, redesign, restyle or mock up a page, screen, flow or app UI, says a UI looks ugly or dated, wants to compare visual directions or variants before code changes, or wants Superdesign-style drafts without an external design service.
---

# Design studio

## Overview

You write designs as single-file HTML drafts, look at every render, and show them side by side on a local canvas. Quality comes from real content from the code, one design system once a direction is chosen, and fixing what the renders show. Everything lives in `.design/` in the project, so later sessions continue from there.

Scripts sit next to this file: `bun <skill-dir>/scripts/shot.ts` and `bun <skill-dir>/scripts/canvas.ts`. Formats are in `references/draft-contract.md`, the review checklist in `references/review.md`.

## The recipe

1. **Context.** Read the target's UI source (the branch that renders), styles and data. Write or refresh `.design/context.md`.
2. **Baseline.** A screen that exists gets `drafts/<target>/current/v1.html`: today's UI with realistic sample data, since a static file has no backend, covering the same part of the screen as the variants. A screen that does not exist yet has no baseline; start from the shell of the closest existing one.
3. **Style.** With `.design/design-system.md`, drafts use only its tokens. Without it, each first-round draft may propose a style and records it in `meta.json` `tokens`.
4. **Variants.** Usually 2 or 3. Each has a one-sentence direction that differs in structure (layout, navigation, density, audience), keeps the baseline's content, and shows every state the data has. What the code does not support goes in `proposed`.
5. **Render and review.** Run `shot.ts --all .design`. Exit 4 means a page threw: fix that first. Open each `shots/sheet-*.png`, then the single PNG of anything that looks off, and work through the checklist. After fixes, run `--all` again and look again. Your report describes the images from the last run, never a fix you have not seen rendered.
6. **Canvas.** Start `canvas.ts --dir .design` in the background (add `--open` when the user is at this machine). It prints its URL (port 4870, or a free one) once it answers; give that URL and ask which direction to continue. Stop it with the `kill` command it prints.
7. **Iterate.** Feedback on a draft adds `v2.html` in its folder. A new alternative is a new folder with `parent`. Keep `status` current.
8. **Lock the style.** When the user picks a direction and no design system exists, write `.design/design-system.md` from that draft.
9. **More screens.** A sibling screen copies the chosen draft's shell and uses the design system. If the user cannot pick yet, draw the sibling once per direction, reusing each direction's draft id.
10. **Code.** Change product code only after the user approves a draft or asks to skip design.

## Common mistakes

| Mistake | Instead |
| --- | --- |
| Features the product lacks (global search, history views, version labels) | Leave them out, or list each in `proposed` |
| The raw page as the baseline: its script never runs, so it has no data | Reproduce it as a draft with sample data |
| Reporting a fix from the source | Report what the last `--all` run shows |
| A new palette on every later screen | After a pick, the design system is a hard constraint |
| `<`, `>` or `&` in sample text vanishing as tags | Escape them |
| Phone layouts judged from a cropped desktop render | `--width 390` renders at the real width |
