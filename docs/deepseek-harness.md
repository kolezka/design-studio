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

## Changing the adapter

The adapter imports `claude-plugin-dsh` directly. When changing that dependency, update `dsh/package.json` and run `bun install --cwd dsh` to refresh `dsh/bun.lock`. Do not use the runtime's `sync` or `scaffold` commands here: version 0.2.0 generates a vendored runtime.
