---
name: design-studio
description: Use when the user asks to design, redesign, restyle or mock up a page, screen, flow or app UI, says a UI looks ugly or dated, wants to compare visual directions or variants before code changes, or wants Superdesign-style drafts without an external design service.
---

# Design studio

## Overview

You write the designs yourself as single-file HTML drafts, look at every render, and show them side by side on a local canvas. Quality comes from three things: real content from the code, one design system once a direction is chosen, and fixing what the screenshots show. Drafts live in `.design/` in the project, so later sessions continue where this one stopped.

Scripts are next to this file: `bun <this-skill-dir>/scripts/canvas.ts` and `bun <this-skill-dir>/scripts/shot.ts`.

## When not to use

- A one-line style fix in existing code: just edit the code.
- Charts or data visualisation inside a product: use a charting skill.

## The recipe

1. **Context.** Read the UI source of the target (the branch that actually renders), its styles and the data it shows. Write or refresh `.design/context.md`: stack, tokens, shared shell, screens, data shapes, real labels and states.
2. **Ground truth.** For a screen that exists, write `drafts/<target>/current/v1.html`: today's UI as it looks with data, filled with realistic sample data because a static file has no backend. Status `baseline`.
3. **Design system.** If `.design/design-system.md` exists, every draft uses only its tokens. If it does not and the user wants a new look, each first-round draft may propose its own style and lists its tokens in its `meta.json`.
4. **Variants.** Default 2 or 3 drafts. Each has a one-sentence direction that differs in structure (layout, navigation, density, who it serves), keeps the baseline's content and data, and shows every state the data has. Anything the code does not support goes in `meta.json` `proposed`.
5. **Render and review.** For each draft run `shot.ts` light and dark at 1440, plus 390 when the screen must work on phones; open every PNG and work through `references/review.md`. Fix and render again until it passes.
6. **Canvas.** Start `canvas.ts --open` in the background, give the user its URL and ask which direction to continue.
7. **Iterate.** Feedback on the chosen draft adds `v2.html`, `v3.html` in the same folder. A new alternative is a new draft folder with `parent` set. Update `status` in each `meta.json`.
8. **Lock the style.** When the user picks a direction and no design system exists, write `.design/design-system.md` from that draft.
9. **More screens.** A sibling screen is a new target that copies the chosen draft's shell markup and uses the design system.
10. **Code.** Change product code only after the user approves a draft or explicitly asks to skip design.

Draft format, folder layout and `meta.json`: `references/draft-contract.md`. Review checklist: `references/review.md`.

## Common mistakes

| Mistake | Instead |
| --- | --- |
| Adding features the product does not have (global search, history views, version labels) | Keep them out, or list each one in `proposed` and mark it in the draft |
| Screenshotting the raw page as the baseline: its script never runs, so it shows no data | Reproduce it as a draft with sample data |
| A new palette in every later screen | After a pick, the design system is a hard constraint |
| Judging phone layouts from a cropped desktop render | `shot.ts --width 390` renders at the real width |
| Describing a design you have not looked at | Open the PNG first |
