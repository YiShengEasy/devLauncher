# OCR And Translation Workflow Requirements

## Goal

Turn the existing screenshot OCR and macOS translation functions into reusable
workflow capabilities. A workflow must be able to capture an image, recognize
its text, translate that text, and pass the result to later steps without a
shell script or a remote API.

## User Stories

1. As a user, I can pass the `path` output from `screenshot.capture` directly
   into an OCR step.
2. As a user, I can translate OCR text to a BCP-47 target language such as
   `zh-Hans` or `en-US`.
3. As a user, I can reference recognized or translated text in clipboard,
   template, plugin, or later workflow steps.
4. As a user, I can start from an official screenshot-OCR-translation template
   and edit each step independently.
5. As a user, choosing “保存” in the screenshot tool creates one file only; the
   selected path is the workflow artifact instead of creating a second managed
   copy.

## Capability Contracts

### `ocr.recognize`

Input:

- `path` (required string): local PNG or JPEG path.

Outputs:

- `text`: complete recognized text.
- `lineCount`: number of recognized non-empty lines.
- `width`: source image pixel width.
- `height`: source image pixel height.

Platforms:

- macOS: Vision framework.
- Windows: Windows Media OCR.

### `translation.translate`

Inputs:

- `text` (required string): source text.
- `targetLanguage` (string, default `zh-Hans`): BCP-47 language identifier.

Outputs:

- `sourceLanguage`
- `targetLanguage`
- `sourceText`
- `targetText`
- `length`

Platform:

- macOS system Translation framework. The matching language package must be
  installed by the user.

## Completion And Errors

- OCR completes only after the image has been read, decoded, and recognized.
- Translation completes only after the system helper returns non-empty text.
- Empty OCR results fail with `OCR_NO_TEXT`.
- Invalid or unreadable images use stable `OCR_IMAGE_*` errors.
- Translation failures use stable `TRANSLATION_*` errors and retain the native
  reason, including missing language packages.
- Both capabilities obey the workflow output-size limit.

## Security And Privacy

- Image and text data remain local.
- No web translation service, API key, or network upload is introduced.
- OCR accepts files up to 50 MiB and rejects empty, non-file, or undecodable
  paths.
- Workflow history continues to exclude structured outputs and image bytes.

## Acceptance Criteria

- The capability registry exposes both contracts on supported platforms.
- The official template materializes all step output references to generated
  step IDs.
- Screenshot “确认” writes a managed PNG; screenshot “保存” uses the chosen
  destination as the one workflow artifact.
- Rust and frontend tests, production build, Cargo check, MCP smoke test, and
  UTF-8 validation pass.
