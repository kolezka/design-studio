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
  "versions": {
    "v1": { "parent": { "draft": "current", "version": 1 } },
    "v2": { "parent": { "draft": "two-column", "version": 1 } }
  },
  "tokens": "zinc neutrals, indigo accent, system fonts, 8px radius",
  "proposed": ["Token meter in the search header (the API returns tokens and maxTokens)"],
  "notes": "v2: denser rows after feedback"
}
```

- `status`: `baseline`, `candidate`, `selected` or `rejected`.
- `proposed`: everything shown that the code does not have yet, one line each with what it would need. Empty list when there is nothing.
- `tokens`: only while no design system exists.

## Cross-target variants

`meta.variant` is an optional string slug identifying the same common variant across targets. Use the same slug on each draft that explicitly belongs to that variant; draft folder names do not establish membership. `meta.variantParent` is an optional string slug naming the source variant from which this alternate variant originated. Each slug starts with a letter or digit, followed by up to 80 letters, digits, `.`, `_` or `-` characters.

A `variantParent` requires `variant`. All drafts declaring the same variant must agree on its origin: either omit `variantParent` on all of them or use the same value on all of them. The source variant must exist in at least one draft's `meta.variant`, and variant origins must not form cycles, including self-links. Missing sources, conflicting declarations, invalid slugs and cycles require warnings; do not silently resolve them.

Variant origin is separate from version lineage. `meta.variantParent` names a cross-target variant, not a draft or version, and never replaces the exact same-target version parent in `meta.versions`.

This metadata is additive and optional. Legacy drafts without `meta.variant` remain unassigned and accessible; never infer membership from folder names, titles, similar content or version edges. Migration is manual and opt-in: only add variant metadata when membership and origin are known, use consistent declarations across the drafts being assigned, and leave uncertain links unset rather than asserting them. Do not move or delete files. If the origin is uncertain, ask before declaring one.

## Version lineage

Each HTML file is a graph node identified by its target, draft slug and version number. `meta.versions` is keyed by the HTML version name, such as `v1` or `v2`. Its `parent` is an object with a draft slug and a numeric version, as in the example above. Parent references always resolve within the same target. The draft and version must exist. Use an entry without a `parent`, such as `"v1": {}`, to explicitly mark a source-free root; `parent: null` is invalid in a version entry.

For every newly created version that has a source, explicitly record its exact parent in `meta.versions`. A baseline is a root and has no parent. When a baseline exists, the first version of each initial variant branches from that baseline. Without a baseline, a genuinely source-free initial variant is a root; every other new nonbaseline version requires an explicit parent. An iteration stays in its draft folder and points to the version it builds on. An alternative direction uses a new draft folder and points to the exact selected source version, even when that version is not the latest. Never infer user approval from a graph edge or a direction choice: approval covers only the choices and scope explicitly stated by the user. Ask when the source or approval scope is unclear.

Preserve existing HTML files and metadata. Legacy draft-level `parent` is a fallback for a first version only when the referenced parent draft has exactly one existing version. If it has multiple versions, the first-version parent is ambiguous and remains unresolved; do not silently choose the latest. For a subsequent version with no version entry, infer the previous numbered existing version in the same draft, and display that edge as dashed and inferred. An explicit entry without a parent marks a root instead. Do not write inferred edges back as explicit facts.

Missing or invalid references and cycles must produce warnings rather than silently asserting a lineage. Ambiguous legacy parents also produce a warning. Inspect the actual nodes and edges in the browser canvas after creating or changing drafts, including the selected parent version and any inferred edges or warnings. A metadata edit alone is not graph verification.

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
