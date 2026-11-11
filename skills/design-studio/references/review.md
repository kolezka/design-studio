# Render and review

## Rendering

```bash
bun <skill-dir>/scripts/shot.ts --all .design                       # latest version of every draft, light and dark, plus shots/sheet-<theme>-1440x900.png
bun <skill-dir>/scripts/shot.ts --all .design --width 390 --height 844 --theme light   # phone pass
bun <skill-dir>/scripts/shot.ts .design/drafts/<target>/<draft>/v2.html --theme dark --height 1800   # one draft, long page
```

Open the PNGs with the file-reading tool and look at them. The sheets give the overview; open the single PNG wherever the sheet shows something odd or too small to judge.

- Exit 1: no screenshot. Fix the cause; do not review from the source instead.
- Exit 4: the PNGs exist but a page threw, and the error is printed. A Tailwind error leaves the page unstyled: `@apply` works only with Tailwind utilities, so define reusable classes with `@utility`.
- `--height` sets the visible area; file names carry width and height (`v2-dark-1440x1800.png`). Below 500 px the draft is drawn in a frame of the exact width, and the grey strip on the right is not part of the design.
- Every render you describe must be newer than the HTML it shows. Ending each round with `--all` guarantees that.

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
