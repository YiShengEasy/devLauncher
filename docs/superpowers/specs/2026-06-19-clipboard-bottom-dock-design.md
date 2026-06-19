# Clipboard Bottom Dock Design

## Goal

Redesign the clipboard history window as a bottom-of-screen dock that makes
recent clipboard entries easy to scan while still showing detailed text or image
data on hover or selection.

The redesign keeps the existing search, favorites, copy, clear-history, and
clear-favorites behavior.

## Selected Approach

Use a dedicated bottom horizontal floating window.

The clipboard appears near the bottom edge of the current screen, similar to a
launcher or input candidate bar. The bottom bar holds the history cards. The
selected card smoothly slides upward and scales slightly, and a detail preview
floats above it.

Copy behavior uses a pin mode:

- unpinned: copying closes the clipboard immediately
- pinned: copying keeps the clipboard open and shows a copied state
- Esc closes the clipboard in both modes
- clicking outside closes only when unpinned

## Current State

The current clipboard UI is centered and compact:

- `app/src/builtins/clipboard/App.tsx` owns data loading, copy actions, clear
  actions, and window hiding.
- `app/src/components/ClipboardPanel.tsx` renders the panel with history and
  favorites tabs, search, list rows, favorite toggles, and footer actions.
- `app/src-tauri/tauri.conf.json` defines the `clipboard` window as
  `520 x 680`, centered, non-resizable, transparent, and hidden by default.
- `app/src-tauri/src/builtins/clipboard.rs` owns clipboard commands and
  `show_clipboard_window`.

The redesign should preserve these data and command boundaries while changing
the presentation and window placement.

## Functional Requirements

The bottom dock supports:

- text and image clipboard entries
- history and favorites views
- search across text entries
- favorite toggle from cards and detail preview
- copy text and copy image
- clear history with confirmation
- clear favorites with confirmation
- close via Esc
- pinned and unpinned copy behavior

The initial default is unpinned.

Pin state is local UI state for the clipboard session unless implementation
planning later decides to reuse the existing window pinning persistence.

## Layout

The clipboard window should be a wide, short dock instead of a tall centered
panel.

Target desktop shape:

- width: approximately 860 to 980 px
- height: approximately 190 to 240 px when idle
- positioned horizontally centered near the bottom of the current display
- transparent window background with a glass dock surface
- no nested cards around the whole page; each clipboard item is the repeated
  card unit

Dock regions:

- left utility area: title, count, history/favorites segmented control
- center area: horizontal scrollable clipboard cards
- right utility area: search, pin button, close controls, clear action menu
- floating preview: appears above the selected card

On narrower screens, the dock should keep the same bottom position, reduce the
number of visible cards, and allow horizontal scrolling.

## Clipboard Cards

Each card represents one clipboard entry.

Text card content:

- title line derived from the first meaningful text line
- two-line compact preview
- metadata such as text length or "text"
- favorite star

Image card content:

- thumbnail
- dimensions
- metadata label such as "image"
- favorite star

Selection behavior:

- hover selects a card
- keyboard focus may also select a card if keyboard navigation is added
- selected card slides up and scales slightly
- neighboring cards should not reflow dramatically
- reduced-motion mode disables scale and slide animations

Clicking a card copies it.

## Floating Detail Preview

The preview floats above the selected card and follows the selected card's
horizontal position where practical.

For text:

- show a larger readable excerpt
- preserve line breaks
- clamp long text with internal scrolling
- include copy and favorite affordances

For images:

- show a larger image preview
- include width and height
- include copy and favorite affordances

The preview should not cover the dock controls. If the selected card is near an
edge, the preview should clamp inside the window.

## Search And Favorites

Search remains available in the dock.

Filtering rules stay consistent with the current component:

- text entries match against their content
- image entries remain visible when searching unless implementation planning
  explicitly narrows this behavior

The history/favorites switch remains visible and compact. Switching tabs clears
the current search, matching current behavior.

Favorite controls appear in both:

- each card
- the floating detail preview

## Pin And Close Behavior

Pinned state controls whether copy closes the clipboard.

Rules:

- default state: unpinned
- unpinned copy: set clipboard data, show brief copied state if visible, then
  hide the window
- pinned copy: set clipboard data, keep the window open, and show copied state
- Esc: hide the window
- close button: hide the window
- outside click: hide only when unpinned

The pin control should be a compact icon button with a tooltip. It should not be
confused with the existing always-on-top window pin button unless both behaviors
are intentionally unified during implementation planning.

## Window Placement

The clipboard show path should place the window near the bottom of the current
screen before showing it.

Expected behavior:

- `show_clipboard_window` opens the bottom dock
- repeated show calls focus the existing clipboard window and refresh data
- the window is centered horizontally on the active or primary display
- the window sits above the bottom screen edge with a small margin

The implementation plan should inspect existing entry-window positioning helpers
before adding new placement code.

## Motion

Motion should use the existing GSAP motion helpers where possible.

Expected feel:

- dock enters with a short upward fade/scale
- card list enters with a light stagger
- selected card slides upward and scales smoothly
- preview fades and slides from the selected card

Reduced motion:

- no scale animation
- no slide animation
- simple opacity or instant state changes are acceptable

## Error Handling

If clipboard history fails to load, show an empty state and keep the dock usable.

If favorites fail to load, show an empty favorites count and keep history usable.

If copy fails, log the error and keep the dock open so the user can retry.

If a preview image fails to render, show the image dimensions and a generic image
label instead of collapsing the card.

## Implementation Notes

Likely files:

- `app/src/builtins/clipboard/App.tsx`
- `app/src/components/ClipboardPanel.tsx`
- `app/src-tauri/src/builtins/clipboard.rs`
- `app/src-tauri/tauri.conf.json`
- focused tests for pure helpers if card formatting or filtering logic is
  extracted

Keep existing command names and data types unless implementation evidence shows
a narrow reason to change them.

## Verification

Automated checks:

- run frontend typecheck
- run relevant component/helper tests if added
- run Rust check if window placement code changes Rust

Manual QA:

- open clipboard with the global shortcut
- confirm it appears near the bottom of the screen
- hover entries and confirm the card scales/slides and detail preview appears
- search text and confirm matching entries remain visible
- switch to favorites and back
- favorite and unfavorite from a card and preview
- copy text while unpinned and confirm the window closes
- pin the dock, copy text, and confirm the window stays open
- copy an image while pinned and unpinned
- press Esc and confirm the window closes
- reopen and confirm history refreshes
