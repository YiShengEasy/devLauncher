# Interactive Screenshot Capability Requirements

## Goal

Add `screenshot.capture` as the first interactive workflow capability. The
workflow step must wait for the screenshot overlay to produce a real result.
Opening or focusing the overlay is not completion.

## Functional Requirements

- The capability appears in the schema-driven workflow step editor.
- Starting the capability opens the existing screenshot overlay and marks the
  workflow and step as waiting.
- The current screenshot selection and annotation tools remain unchanged.
- Confirming a screenshot returns:
  - a local artifact path;
  - image width and height;
  - media type;
  - whether the image was copied to the clipboard.
- The PNG is written below DevLauncher's application data directory. Workflows
  cannot provide an arbitrary destination path in this phase.
- Pressing Esc until the overlay closes cancels the interactive step.
- A capture or encoding failure fails the step with a stable error code.
- Only one workflow-owned screenshot request may be active at a time.
- Normal keyboard-triggered screenshots continue to work without creating a
  workflow result.
- Cancelling the workflow releases any active screenshot request and hides the
  overlay owned by that request.

## Data Contract

Capability ID:

```text
screenshot.capture
```

Inputs:

```text
copyToClipboard: boolean, default true
timeoutSeconds: number, default 300
```

Outputs:

```text
path: string
width: number
height: number
mediaType: string
copiedToClipboard: boolean
```

Artifact:

```text
type: file
mediaType: image/png
path: local absolute path
```

## Error Codes

- `SCREENSHOT_BUSY`
- `SCREENSHOT_CANCELLED`
- `SCREENSHOT_TIMEOUT`
- `SCREENSHOT_CAPTURE_FAILED`
- `SCREENSHOT_ARTIFACT_WRITE_FAILED`

## Out Of Scope

- OCR and translation outputs.
- Uploading artifacts to cloud storage.
- User-selected output directories.
- Multiple concurrent screenshot overlays.
- Persisting image bytes inside workflow history or synchronized config.
