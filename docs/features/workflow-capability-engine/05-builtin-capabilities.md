# Built-in Capabilities

## First Implementation Set

### `clipboard.read_text`

- Inputs: none.
- Outputs: `text`.
- Completion: synchronous.
- Empty clipboard text is a valid empty output.

### `clipboard.write_text`

- Inputs: `text`.
- Outputs: `characters`.
- Completion: synchronous after the system clipboard accepts the value.

### `text.replace`

- Inputs: `text`, `find`, `replace`.
- Outputs: `text`, `replacements`.
- Completion: synchronous and deterministic.

### `text.template`

- Inputs: `template`.
- Outputs: `text`.
- Completion: synchronous after workflow references are resolved.

These four capabilities provide a complete, testable data pipeline without
opening windows or depending on a remote service.

## Next Built-ins

- `quickmemory.create`
- `quickmemory.search`
- `screenshot.capture`
- `ocr.recognize`
- `translation.translate`
- `file.read_text`
- `file.write_text`
- `http.request`
- `json.extract`

Screenshot and translation require explicit interactive/native adapter design
and are not simulated by opening their current windows.

## Example Pipeline

```text
Read clipboard
-> Replace draft marker
-> Render summary template
-> Write clipboard
```

This pipeline proves schema-driven inputs, output references, deterministic
execution, and output visibility. The later product demonstration replaces the
first step with screenshot/OCR when its interactive contract is implemented.
