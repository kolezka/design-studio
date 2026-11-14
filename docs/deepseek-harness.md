# DeepSeek Harness

design-studio ships an adapter for DeepSeek Harness (DSH) in `dsh/`.

## Install

From a clone of this repository, install the adapter's published runtime before adding the plugin:

```bash
bun install --cwd dsh --frozen-lockfile
dsh plugin --profile <name> add file:/abs/path/dsh
```

After updating the clone, run the frozen install again before using the adapter.

To inspect the adapter without installing it in a DSH profile:

```bash
bun x claude-plugin-dsh@0.2.0 inspect .
```

## The canvas in the right sidebar

In the DSH web app the adapter adds a **Design Studio** tab to the right sidebar. Open it from the sidebar's start page. It shows the canvas for the session's working directory, reading `.design/` there, and says so when that folder has no drafts yet.

You do not start the canvas yourself for this tab. The adapter runs `design-studio canvas` for the session when the tab asks for it, and stops it five minutes after the last tab closes. It needs `bun` on the `PATH` of the DSH host process.

The canvas still listens on `127.0.0.1` only. DSH forwards `/design-studio/<session id>/` to it, behind the same login as the rest of the app, so the tab also works when you use DSH from another machine. Drafts keep their script sandbox on that path.

## Changing the adapter

`dsh/canvas.js` is the host side of the tab (the route and the canvas process) and `dsh/client.js` is the browser side. `client.js` is written by hand in the bundle form DSH loads, so there is still no build step. DSH reads it through `dsh.client` and `exports["./client"]` in `dsh/package.json`.

The adapter imports `claude-plugin-dsh` directly. When changing that dependency, update `dsh/package.json` and run `bun install --cwd dsh` to refresh `dsh/bun.lock`. Do not use the runtime's `sync` or `scaffold` commands here: version 0.2.0 generates a vendored runtime.
