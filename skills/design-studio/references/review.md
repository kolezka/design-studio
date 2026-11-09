# Render and review

## Rendering

```bash
bun <skill-dir>/scripts/shot.ts .design/drafts/<target>/<draft>/v1.html --theme light --out .design/shots/<target>/<draft>/v1-light-1440.png
bun <skill-dir>/scripts/shot.ts .design/drafts/<target>/<draft>/v1.html --theme dark  --out .design/shots/<target>/<draft>/v1-dark-1440.png
bun <skill-dir>/scripts/shot.ts .design/drafts/<target>/<draft>/v1.html --width 390 --height 844 --out .design/shots/<target>/<draft>/v1-light-390.png
```

Then open each PNG with the file-reading tool and look at it. `--height` sets the visible area; raise it (for example 1800) to see a long page. Below 500 px the draft is drawn in a frame of the exact width, and the grey strip on the right is not part of the design. If `shot.ts` exits non-zero, there is no screenshot: fix the cause, do not review from the source instead.

## Checklist

Fix every failed item, render again, and look again.

1. **First glance.** The most important thing on the screen is the most prominent one. One primary action per area.
2. **Content.** Real labels and data from `context.md`. Every element the code lacks is in `proposed`.
3. **States.** Empty, in progress, error and long values are visible and none of them breaks the layout.
4. **Alignment and rhythm.** Edges line up, spacing follows one scale, related items sit closer than unrelated ones.
5. **Type.** At most three sizes in a block, clear hierarchy, numbers and ids in a monospace face where they are compared.
6. **Colour.** Accent only for actions and current state; status colours mean the same thing everywhere; body text is readable in both themes (no light text on a light button, no grey on grey).
7. **Dark theme.** Not an inversion: surfaces step up in lightness, borders stay visible, nothing stays white.
8. **Overflow.** Nothing scrolls sideways at 390; long paths and URLs truncate or wrap on purpose.
9. **Consistency.** With a design system: only its tokens. Across screens of one direction: the same shell markup.
10. **Taste.** No decoration without a job: no gradients, glows or emoji unless the design system asks for them.
