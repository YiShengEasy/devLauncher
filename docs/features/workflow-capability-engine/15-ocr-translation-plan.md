# OCR And Translation Implementation Plan

## Phase 1: Artifact Handoff

- [x] Let screenshot completion accept an optional user-selected destination.
- [x] Use the selected destination as the returned workflow artifact path.
- [x] Keep managed application-data output for the normal confirm action.
- [x] Never delete a user-selected file during stale-request cleanup.

## Phase 2: OCR Capability

- [x] Add the `ocr.recognize` descriptor and structured output fields.
- [x] Validate path, file type, size, and decodable image data.
- [x] Run the existing native OCR implementation in a blocking worker.
- [x] Return stable errors and enforce the shared output limit.

## Phase 3: Translation Capability

- [x] Add the macOS-only `translation.translate` descriptor.
- [x] Validate text and the BCP-47 target language identifier.
- [x] Run the existing macOS Translation helper in a blocking worker.
- [x] Return source/target metadata, translated text, and character count.

## Phase 4: Product Surface

- [x] Add the official `截图 OCR 并翻译` workflow template.
- [x] Chain screenshot path, OCR text, translated text, and clipboard output
      with normal workflow references.
- [x] Keep all controls descriptor-driven in the existing workflow editor.

## Phase 5: Verification

- [x] Add Rust descriptor, language validation, and invalid-image tests.
- [x] Add frontend template reference and screenshot bridge tests.
- [x] Run the full Rust and frontend suites.
- [x] Run production build and Cargo all-target checks.
- [x] Run automation MCP smoke and strict UTF-8 validation.
- [ ] Manually run the complete template in the installed app with Screen
      Recording and Translation language permissions available.

## Manual Test

1. Create a workflow from `截图 OCR 并翻译`.
2. Run the complete workflow and select an area containing English text.
3. Confirm the screenshot.
4. Verify that OCR reports a non-zero line count.
5. Verify that the translation step returns Chinese text.
6. Verify that the final clipboard contents equal `targetText`.
7. Repeat with the screenshot “保存” action and confirm that only the selected
   PNG exists and its path is the screenshot step output.
