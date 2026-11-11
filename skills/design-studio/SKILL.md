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
4. **Variants.** Usually 2 or 3. Each has a one-sentence direction that differs in structure (layout, navigation, density, audience), keeps the baseline's content, and shows every state the data has. What the code does not support goes in `proposed`. When creating drafts for a known common variant, assign its `meta.variant` slug explicitly; for a known alternate source, also declare `meta.variantParent` consistently as described in the contract. Neither field is inferred from a draft name or a version parent.
5. **Render and review.** Run `shot.ts --all .design`. Exit 4 means a page threw: fix that first. Open each `shots/sheet-*.png`, then the single PNG of anything that looks off, and work through the checklist. After fixes, run `--all` again and look again. Your report describes the images from the last run, never a fix you have not seen rendered.
6. **Canvas.** Start `canvas.ts --dir .design` in the background (add `--open` when the user is at this machine). It prints its URL (port 4870, or a free one) once it answers; give that URL and ask which direction to continue. Stop it with the `kill` command it prints.
7. **Iterate and branch.** An iteration stays in the same draft folder and gets a new numbered HTML file. An alternate direction gets a new draft folder. Record the exact source draft and version in `meta.versions` for every new version that has a source, including the first version of an alternative. Mark a genuinely source-free root with an empty version entry. Initial variants branch from the baseline when one exists. Branch from the exact version selected, not automatically from the latest; if the source is unclear, ask. Keep existing files and metadata intact and update `status` as appropriate. See `references/draft-contract.md` for legacy inference and warnings.
8. **Verify the graph.** Open the canvas in a browser after writing drafts and inspect the actual version nodes and parent edges. Check that each new edge points to the selected source version, and investigate warnings; do not claim the graph is verified from metadata alone.
9. **Lock the style.** When the user explicitly picks a direction and no design system exists, write `.design/design-system.md` from that draft. A choice applies only to the specific draft, version and scope the user identified; ask if ambiguous. It does not approve other variants, screens, later iterations or implementation.
10. **More screens.** A sibling screen copies the chosen draft's shell and uses the design system. If the user cannot pick yet, draw the sibling once per direction, reusing each direction's draft id. For drafts known to share a direction across targets, explicitly set the same `meta.variant` string slug. For a new alternate variant with a known source variant, set `meta.variantParent` to that source slug consistently on every draft declaring the alternate. The source variant must exist and variant origins must not cycle. These declarations do not replace the exact same-target version parent in `meta.versions`. Do not infer variant membership or origin from draft names or version edges. Leave legacy drafts unassigned and accessible unless manually opted in with known relationships; do not move or delete files, and ask when a relationship is uncertain. Ask before assuming a selection applies to another screen. See `references/draft-contract.md` for the full variant contract and migration rules.
11. **Code.** Change product code only after explicit approval for implementation in the relevant scope, or an explicit request to skip design. Selecting a direction alone is not implementation approval.

## Common mistakes

| Mistake | Instead |
| --- | --- |
| Features the product lacks (global search, history views, version labels) | Leave them out, or list each in `proposed` |
| The raw page as the baseline: its script never runs, so it has no data | Reproduce it as a draft with sample data |
| Reporting a fix from the source | Report what the last `--all` run shows |
| A new palette on every later screen | After a pick, the design system is a hard constraint |
| `<`, `>` or `&` in sample text vanishing as tags | Escape them |
| Phone layouts judged from a cropped desktop render | `--width 390` renders at the real width |
