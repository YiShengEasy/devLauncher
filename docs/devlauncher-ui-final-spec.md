# DevLauncher UI Final Spec

Version: 2026-06-15
Source prototype: `index.html` + `src/styles.css`
Target viewport: desktop launcher shell, reference size `1833 x 862`

## 1. Design Direction

DevLauncher uses a dark glass launcher style. The interface should feel like a refined desktop utility panel, not a marketing page. New pages and features must continue the same visual language:

- Dark translucent shell with subtle grid texture.
- Rounded glass controls with soft inset highlights.
- Keyboard-key layout as the primary spatial metaphor.
- Clear white labels, low-contrast shortcut hints, and colored line icons.
- Restrained ambient light; avoid bright background blooms behind text or icons.
- Motion should add depth on hover, but must not change layout or reduce readability.

## 2. Layout System

### Canvas

- Full viewport stage: `100vw x 100vh`.
- Main launcher shell: `1833px x 862px`, centered and scaled with `--prototype-scale`.
- Shell radius: `28px`.
- Shell border: `3px solid rgba(119, 119, 140, 0.47)` for classic theme.
- Outer padding: stage `7px 5px`.

### Header

- Header height: `108px`.
- Header padding: `22px 34px 20px 30px`.
- Brand group gap: `22px`.
- Top action gap: `20px`.
- Header bottom divider: `1px rgba(255,255,255,0.075)`.

### Tabs

- Tab bar height: `80px`.
- Left padding: `28px`.
- Gap: `40px`.
- Active tab height: `64px`.
- Active underline height: `7px`.
- Add button: `60px x 64px`, radius `18px`, centered with `display: grid; place-items: center`.

### Keyboard

- Keyboard top padding: `17px`.
- Key height: `145px`.
- Key radius: `16px`.
- Number/Q rows use `160px` columns.
- A row uses `158px` columns.
- Z row uses `166px` columns.
- Row gap: `14px`.
- Row vertical gap: `12px`.
- Row offsets:
  - number row: `80px`
  - Q row: `130px`
  - A row: `170px`
  - Z row: `212px`

Do not convert this into a generic card grid. The staggered keyboard rhythm is a core identity.

## 3. Color And Theme Tokens

### Classic Theme

Use as the default theme and regression baseline.

- Page background: `#050917`
- Shell base: `#101622`
- Shell gradient base: `#191d2b -> #080e19 -> #0b121f`
- Right-top red glow: `rgba(160, 70, 70, 0.18)` maximum
- Blue glow: `rgba(43, 55, 131, 0.22)`
- Bottom-left red glow: `rgba(113, 58, 77, 0.47)`
- Active underline: `#3f90ff -> #69b0ff`
- Icon blue: `#5ca9ff`
- Icon purple: `#a77dff`
- Icon green: `#75d997`
- Icon orange: `#ffb94a`
- Terminal green: `#6cde75`

### Warm Theme

Warm theme should be darker and brown-amber, not orange-heavy.

- Page background: `#090806`
- Shell base: `#17130f`
- Shell gradient base: `#1e1a14 -> #11100d -> #0a0a08`
- Right-top glow: `rgba(132, 63, 62, 0.18)` maximum
- Active underline: `#ffad57 -> #ffc46f`
- Control border: `rgba(255, 220, 178, 0.12)`

### Aurora Theme

Aurora theme should be blue-purple with controlled red accent.

- Page background: `#050917`
- Shell base: `#101622`
- Shell gradient base: `#121a2a -> #07111e -> #08101d`
- Right-top red glow: `rgba(205, 89, 84, 0.24)` maximum
- Purple glow: `rgba(94, 73, 178, 0.28)`
- Active underline: `#4b95ff -> #82baff`
- Control border: `rgba(198, 211, 255, 0.13)`

## 4. Glass Surface Standard

Settings button, search box, add button, theme toggle, and keycaps must share one glass-surface model.

Base surface:

```css
border: 2px solid rgba(255,255,255,0.09);
background: linear-gradient(145deg, rgba(255,255,255,0.105), rgba(255,255,255,0.035));
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.08),
  0 14px 28px rgba(0,0,0,0.22);
```

Rules:

- Do not make keycaps much more transparent than the settings button.
- Do not use pure black cards.
- Do not use heavy `backdrop-filter` on keycaps; it caused visual artifacts in screenshot checks.
- Border contrast should stay subtle but visible.
- Hover highlight may brighten the local surface but must not wash out labels or SVG.

## 5. Typography

Font stack:

```css
"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif
```

Refined Chinese text stack:

```css
"Microsoft YaHei UI Light", "Microsoft YaHei Light", "DengXian Light", "DengXian", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif
```

Text standards:

- Brand title: `27px`, weight `650`, color near white.
- Header tagline: `22px`, weight `500`, color `rgba(222, 227, 238, 0.58)`.
- Search text: `23px`, weight `500`.
- Tab text: `25px`, weight `560`.
- Key label: `21px`, weight `600`, color `rgba(252, 253, 255, 0.98)`.
- Key hint: `19px`, weight `620`, color `rgba(220, 226, 239, 0.48)`.

Chinese labels must not be too thin. If a page looks unclear, raise text opacity or weight before increasing background brightness.

## 6. Icon Standard

Use line icons as the default icon style.

- SVG size inside keycaps: `46px x 46px`.
- Stroke width: `2.15`.
- Stroke cap/join: `round`.
- Opacity: `0.96`.
- Icon container: `47px x 47px`.
- Use theme semantic colors from section 3.
- Add subtle glow via `drop-shadow`, but keep the icon edge sharp.

Icon rules:

- Prefer clean single-line SVGs or a consistent icon library.
- Do not mix filled emoji-like icons with line icons.
- Do not use low-resolution bitmap icons inside keycaps.
- Product marks such as GPT and VS may be approximated, but should follow the same glow/size discipline.
- If exact product assets become available, replace approximations without changing keycap layout.

## 7. Motion Standard

Hover motion should feel full but controlled.

Keycap hover:

- Lift: `-7px`.
- Scale: `1.022`.
- Max tilt: `4.5deg`.
- Glow transition: `180-260ms`.
- Return duration: `360-460ms`.

Toolbar control hover:

- Lift: `-3px`.
- Scale: `1.012`.
- Max tilt: `2.2deg`.

Rules:

- Use transform-only motion where possible.
- Do not animate width, height, grid position, or margins.
- Respect `prefers-reduced-motion`.
- Hover state must not reflow neighboring keys.
- Active press may compress slightly to `scale(0.992)`.

## 8. Component Rules

### Launcher Shell

Use shell as a single framed desktop surface. Avoid nested page cards inside the shell.

### Keycap

Keycap structure:

- Top-left hint.
- Centered icon or mark.
- Centered label under icon.
- Empty keys still keep hint and glass surface.

Keycap content spacing:

- Filled key uses column flex.
- Gap between icon and label: `14px`.
- Hint position: top `12px`, left `17px`.

### Search

Search should remain a glass command field:

- Size: `205px x 66px`.
- Radius: `18px`.
- Icon + label gap: `14px`.

### Settings

Settings is the baseline visual for compact controls:

- Size: `70px x 66px`.
- Radius: `17px`.
- Center icon at `34px`.

### Theme Toggle

Theme toggle is a compact three-swatch segmented control:

- Size: `112px x 66px`.
- Radius: `17px`.
- Swatch size: `22px`.
- Thumb size: `32px`.
- Theme order: classic -> warm -> aurora.

## 9. Accessibility And Readability

- Keep visible text contrast higher than the background glow.
- Do not place red/purple bright glows directly behind white labels.
- Use `aria-label` on icon-only controls.
- Keep button text real text, not baked into images.
- Avoid negative letter spacing.
- Do not scale font size with viewport width.

## 10. Future Page Checklist

Before shipping any new DevLauncher UI page:

- Does it preserve the dark glass launcher identity?
- Are controls using the same glass surface as settings/keycaps?
- Are Chinese labels at least as readable as current key labels?
- Are SVG icons line-based, sharp, and consistently sized?
- Are background glows restrained around text-heavy regions?
- Does hover motion use transform without layout shift?
- Does the page work in classic theme first, then warm and aurora?
- Is the UI dense and utility-focused rather than landing-page-like?

## 11. Do Not Do

- Do not introduce large marketing hero sections.
- Do not use random gradient orbs as decoration.
- Do not turn every section into floating cards.
- Do not use a one-color purple/blue theme only.
- Do not make keycaps translucent enough that labels lose contrast.
- Do not use overly thin Chinese fonts for key labels.
- Do not enlarge icons independently without checking keycap balance.
- Do not change the keyboard row offsets casually.
