# How the skill was tested

This is a dated report. The scripts it names, `shot.ts` and `canvas.ts`, are now `design-studio shot` and `design-studio canvas`.

2026-11-09, Claude Opus 5.5 workers, Bun 1.4.4, Chrome. Fixture: the old Docify admin page (`src/web` at docify `fc71771`), one plain HTML page with a sources table and a search form, plus `config.ts` for a Settings screen that did not exist yet. Each run: same task ("the UI is ugly, show me proposals I can compare in the browser, add Settings"), user unavailable, 40 tool calls.

## Without the skill (baseline)

The worker produced three distinct directions with realistic data and all source states, rendered them in headless Chrome, and fixed four problems it saw. Draft quality was on par with the Superdesign drafts made for the same app. The quality comes from the model, not from the service. What was missing:

- Each direction had its own palette and fonts, and nothing would keep a later screen consistent.
- Features the product does not have were drawn as if they existed (a global quick search, a schema version label, a generation history needing a new API).
- No baseline: the current page was screenshotted as a raw file, so its script never ran and the table was empty.
- No place for versions or iterations; a one-off comparison page.
- Phone screenshots were silently cropped: headless Chrome lays out at 500 px minimum.

## With the skill, first version

Every gap above was closed: `context.md`, a baseline with sample data, `proposed` lists in every `meta.json`, drafts in `.design/`, the canvas. One new failure: the worker edited two drafts after their last render and reported the fixes as done. Rendering those files again showed the fixes did work, but the worker had not seen them. It also used low-resolution contact sheets it built by hand to stay within budget, and lost a render to a Tailwind `@apply` error that produced an unstyled page with no warning.

Changes: `shot.ts --all` (latest version of every draft, both themes, one contact sheet per theme), page errors printed with exit 4, "your report describes the images from the last run", escaping and `@utility` in the draft contract, and rules for a screen that does not exist yet and for an unattended run.

## With the skill, second version

A smaller task (two directions for the search section, 25 calls, frame lines with `<` and `>` must stay visible). The worker ran four render rounds and named the render it checked after each fix. Every PNG was newer than its HTML (checked by file times), the frame lines were visible in all three drafts including the baseline, and the canvas was stopped. Its remaining remarks led to width and height in file names, the canvas port and the network requirement in the docs, and the baseline covering the same part of the screen as the variants.

## Tools

- `tests/canvas.test.ts`: ordering, latest version, `tokens` shown, malformed `meta.json` shown as an error, only draft files served, foreign `Host` refused. Removing the host check or the meta error display makes its test fail.
- `shot.ts`, checked by hand: light and dark with Tailwind from the CDN; a width probe reports `innerWidth=390` at `--width 390` (500 before the fix); a draft with a Tailwind error and an uncaught exception exits 4 and prints both, the clean set exits 0.
