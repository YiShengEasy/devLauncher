# URL Favicon Link Discovery Design

## Goal

Show the real website icon for URL actions bound to virtual keyboard keys,
including local development sites such as `http://localhost:3005/` whose icon is
declared in HTML instead of available at `/favicon.ico`.

The user should not need to select an icon manually. After binding a webpage to
a key, the key should automatically show the page icon when DevLauncher can
discover it.

## Selected Approach

Extend the existing backend favicon fetcher.

The current frontend already:

- collects URL action origins from `keyboard.yaml`
- calls `get_cached_favicons`
- calls `refresh_favicons`
- stores returned data URLs in `useKeyboardStore.favicons`
- renders URL icons through `ActionIcon`

The missing piece is discovery. `app/src-tauri/src/utils/favicon.rs` currently
fetches only `{origin}/favicon.ico`. Many Vite, React, and local app pages use
`<link rel="icon" href="...">`, so the fetcher should inspect the page HTML
before falling back to `/favicon.ico`.

## Functional Requirements

When refreshing favicons for a URL action origin:

- request the origin page HTML first
- discover icon candidates from `<link>` tags
- support `rel` values containing `icon`, `shortcut icon`, `apple-touch-icon`,
  or `mask-icon`
- resolve absolute URLs and root-relative or document-relative paths
- fetch the first valid icon candidate
- cache the result in the existing `favicons.json`
- if HTML discovery fails, use the existing `{origin}/favicon.ico` fallback
- if all fetches fail, return no icon for that origin and keep the existing
  generic URL icon fallback in the UI

The discovery should support local development origins allowed by the current
normalization rules:

- `http://localhost:*`
- `http://127.0.0.1:*`
- `http://[::1]:*`
- `https://*`

## Non-Goals

Do not add manual icon upload or icon picker UI.

Do not change the `Action` config shape.

Do not change the virtual keyboard binding modal flow.

Do not fetch favicons for arbitrary insecure remote `http://` origins beyond the
currently allowed localhost patterns.

## Data Flow

1. A user binds Q to `http://localhost:3005/`.
2. `App.tsx` sees a URL action and sends `{ origin: "http://localhost:3005" }`
   to `get_cached_favicons` and `refresh_favicons`.
3. `refresh_favicons` loads any cached icon first.
4. For missing origins, the backend fetches the origin HTML and extracts icon
   link candidates.
5. The backend fetches a candidate icon and converts it to a data URL.
6. The data URL is written to `favicons.json` and returned to the frontend.
7. `ActionIcon` renders the cached data URL in the key cell.

## Parsing Rules

Use a small HTML link extractor inside `favicon.rs`.

The extractor only needs to find `<link ...>` tags and read `rel` and `href`
attributes. It should tolerate:

- attributes in any order
- single quotes, double quotes, or unquoted simple values
- mixed-case tag and attribute names
- multiple tokens in `rel`

Candidate priority:

1. `rel` containing the token `icon` or the tokens `shortcut` and `icon`
2. `rel` containing `apple-touch-icon`
3. `rel` containing `mask-icon`
4. fallback `/favicon.ico`

If several candidates have the same priority, keep document order.

## Error Handling

Network and parsing errors should not surface to users.

For a single origin:

- HTML fetch failure falls back to `/favicon.ico`
- icon candidate fetch failure tries the next candidate
- empty or oversized responses are ignored
- unsupported or missing content type still uses the existing MIME fallback
- total per-request blocking remains bounded by short timeouts

The frontend keeps the current generic URL icon if no favicon is returned.

## Testing

Add focused Rust unit tests for the pure parsing and URL-resolution logic:

- extracts a Vite-style `<link rel="icon" href="/src/assets/logo.png">`
- handles `rel="shortcut icon"`
- handles mixed-case attributes
- resolves relative paths against the origin page URL
- falls back cleanly when no icon links exist

If practical, keep network fetching untested directly and test it through small
pure helpers so the test suite is deterministic.

## Verification

Automated checks:

- run the Rust tests covering favicon discovery helpers
- run frontend typecheck if the frontend surface changes

Manual QA:

- bind Q to `http://localhost:3005/`
- confirm Q shows the page's own icon after refresh
- restart DevLauncher and confirm the cached icon still appears
- bind a site with only `/favicon.ico` and confirm fallback still works
- bind a site with no icon and confirm the generic URL icon still appears
