# DevLauncher Marketplace

Static plugin marketplace for DevLauncher.

## Marketplace URL

Use this URL in DevLauncher Plugin Center:

```text
https://raw.githubusercontent.com/YiShengEasy/devLauncher/main/marketplace/marketplace.json
```

## First Plugin

- `devlauncher.examples.hello`
- Version: `1.0.0`
- Type: static WebView plugin
- Release asset: `hello-webview-1.0.0.zip`

## Release Layout

The plugin zip must contain `plugin.json` at the zip root:

```text
plugin.json
README.md
dist/
  index.html
```

## GitHub Hosting

The first version is hosted directly from the `YiShengEasy/devLauncher` repository through GitHub raw URLs. A separate `devlauncher-marketplace` repository or GitHub Pages site can replace these URLs later without changing the plugin package format.
