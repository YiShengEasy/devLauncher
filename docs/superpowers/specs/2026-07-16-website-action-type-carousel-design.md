# Website Action Type Carousel Design

## Goal

Restore the missing action-type introduction in the homepage hero while preserving the compact, product-faithful virtual keyboard and its five-step operation animation.

## Placement

Add one full-width type explorer below the keyboard stage and inside the existing virtual-keyboard window. It must not replace the guided inspector, enlarge the keyboard keys, or change the desktop application's frontend.

## Content

The explorer cycles through nine supported binding types:

- Application: launch a local app and optional arguments.
- Folder: open a project folder in Finder or a configured editor.
- File: open a document, configuration file, or local asset.
- URL: open a website, dashboard, or local development service.
- SSH: start a saved remote terminal session.
- Script: run a shell command or automation script.
- System: run a supported system command or desktop action.
- Built-in: open DevLauncher tools such as clipboard, screenshot, JSON, or terminal.
- Plugin: open an installed marketplace WebView tool.

Each type has a short code label, Chinese name, one-sentence description, and distinct accent color. The active type changes automatically without affecting the operation-step state.

## Interaction And Layout

- Desktop: description on the left, all nine compact type labels on the right.
- Mobile: description remains readable and type labels can wrap without horizontal page overflow.
- The active type uses a restrained glow and border consistent with the existing keyboard highlights.
- Reduced-motion users receive state changes without decorative movement.
- The classic script remains compatible with direct `file://` opening.

## Verification

- Confirm all nine type names and descriptions render.
- Confirm the active type advances independently from the five keyboard steps.
- Confirm the five operation steps still select `1`, `W`, `Y`, `C`, and `N`, including the `C` to `N` drag target.
- Run JavaScript syntax checking, UTF-8 validation, static build, and diff checks.
- After push, confirm GitHub Pages serves the new HTML, JavaScript, and CSS asset version.
