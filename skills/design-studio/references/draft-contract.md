# Draft contract

## Folder layout

```
.design/
  context.md                 what the code says: stack, tokens, shell, screens, data, labels, states
  design-system.md           written once a direction is chosen; a hard constraint afterwards
  drafts/<target>/<draft>/
    meta.json
    v1.html, v2.html, ...    every version kept; the highest number is current
  shots/<target>/<draft>/    PNGs from shot.ts
```

`<target>` is a screen or feature (`workspace`, `settings`, `checkout`). `<draft>` is a short slug (`current`, `sidebar-console`, `two-column`). Letters, digits, `.`, `_`, `-` only.

## meta.json

```json
{
  "title": "Two-column workspace",
  "direction": "One screen: sources left, search right, settings behind a tab.",
  "status": "candidate",
  "parent": "current",
  "tokens": "zinc neutrals, indigo accent, system fonts, 8px radius",
  "proposed": ["Token meter in the search header (the API returns tokens and maxTokens)"],
  "notes": "v2: denser rows after feedback"
}
```

- `status`: `baseline`, `candidate`, `selected` or `rejected`.
- `proposed`: everything shown that the code does not have yet, one line each with what it would need. Empty list when there is nothing.
- `tokens`: only while no design system exists.

## The HTML file

One self-contained file per version, openable from disk:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workspace: two-column</title>
<script>document.documentElement.classList.toggle("dark", new URLSearchParams(location.search).get("theme") === "dark");</script>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.3.3"></script>
<style type="text/tailwindcss">
  @custom-variant dark (&:where(.dark, .dark *));
  @theme { --font-sans: ui-sans-serif, system-ui, sans-serif; }
</style>
</head>
<body class="bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">...</body>
</html>
```

- Tailwind loads from jsDelivr, so rendering needs network access. Offline, write plain CSS in a `<style>` block instead.
- `?theme=dark` and `?theme=light` must both work; `shot.ts` and the canvas use them. Every colour class has its `dark:` pair.
- Content comes from `context.md`: real labels, real field names, realistic values. No lorem ipsum, no invented brand.
- Escape `<`, `>` and `&` in sample text and code (`&lt;`), or the browser swallows them as tags.
- Reusable classes are defined with `@utility name { ... }` inside the `text/tailwindcss` block. `@apply` accepts only Tailwind utilities, not a class defined next to it.
- Show the states the data has (empty, loading or in progress, error, long text) on the page, not only the happy path.
- No local paths. Images are inline SVG, `data:` URIs or public `https://` URLs. Web fonts only when the design system names them.
- Interactions are optional. When a draft has tabs or views, make the default view the important one; a `#hash` that switches views must not scroll the page.
- When the project uses a framework, keep the markup close to how it would be built there (Tailwind classes, component-shaped blocks), so the draft can be ported.
