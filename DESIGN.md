# Design System — Time Logger

## Product Context
- **What this is:** A voice-based personal time tracking web app with AI categorization and coaching
- **Who it's for:** Knowledge workers who want honest reflection on where their day went
- **Space/industry:** Productivity / time tracking / personal reflection (peers: Toggl, Clockify, Linear)
- **Project type:** Web app (React + MUI)

## Aesthetic Direction
- **Direction:** Editorial/Journal — warm, literary, personal
- **Decoration level:** Intentional — hairline borders, paper-tone layering, subtle warmth. No shadows or depth effects.
- **Mood:** Quiet and observant. Like opening a personal notebook in a calm room. Speaking your day should feel intimate, not transactional.
- **Visual thesis:** A quiet editorial workspace on warm paper — serif for reflection, sans for utility, vermilion for emphasis.
- **Reference sites:** Linear (composition density), Toggl (personality through color), Arc (warmth)
- **Anti-patterns:** No SaaS blue, no purple gradients, no floating KPI cards, no 3-column icon grids, no centered-everything, no decorative blobs, no glossy AI aesthetic.

## Typography
- **Display/Hero:** DM Serif Display — warm serif that says "journal" not "SaaS." Used for page titles, section headers, date labels, coach letter openings.
- **Body:** DM Sans — clean geometric sans-serif, highly legible at small sizes. Used for body text, navigation, button text, form inputs, metadata.
- **UI/Labels:** DM Sans (same as body, weight 500-600 for emphasis)
- **Data/Tables:** DM Sans with `font-variant-numeric: tabular-nums` — for percentages, time values, counts.
- **Code:** JetBrains Mono (if needed for transcript raw view)
- **Chinese (Display):** Noto Serif SC — matches the serif/reflection role of DM Serif Display
- **Chinese (Body):** Noto Sans SC — matches the sans/utility role of DM Sans
- **Loading:** Google Fonts CDN
  ```html
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=DM+Serif+Display&family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@400;600;700&display=swap" rel="stylesheet">
  ```
- **Scale:**
  | Level | Size | Weight | Font | Usage |
  |-------|------|--------|------|-------|
  | h1 | 2.5rem (40px) | 400 | DM Serif Display | Page title |
  | h2 | 1.75rem (28px) | 400 | DM Serif Display | Section headers |
  | h3 | 1.25rem (20px) | 400 | DM Serif Display | Subsection headers |
  | body1 | 15px | 400 | DM Sans | Primary body text |
  | body2 | 14px | 400 | DM Sans | Secondary text, entry cards |
  | caption | 12px | 400 | DM Sans | Metadata, timestamps |
  | overline | 11px | 600 | DM Sans | Section labels (uppercase, 0.08em tracking) |

## Color
- **Approach:** Restrained — warm paper base, one vermilion accent, earthy category tones
- **Background:** `#F5EDE0` (warm cream paper) — not white
- **Surface:** `#EBE2D3` (card/panel background)
- **Surface 2:** `#E0D5C4` (elevated/hover state)
- **Text Primary:** `#201815` (warm near-black)
- **Text Muted:** `#6F6258` (secondary text, metadata)
- **Accent:** `#B6492D` (vermilion — primary actions, recording state, emphasis)
- **Accent Soft:** `#D9A28D` (hover states, muted accent)
- **Accent Hover:** `#9C3B23` (button hover)
- **Rule:** `#C4B8A8` (borders, dividers, hairlines)
- **Category colors:**
  | Category | Hex | Usage |
  |----------|-----|-------|
  | TODO | `#B6492D` | Deep work, actionable tasks |
  | IDEA | `#8A5A44` | Creative, brainstorming |
  | THOUGHT | `#6F6258` | Reflection, observation |
  | TIME_RECORD | `#3E5A63` | Logged time, tracking |
- **Semantic colors:**
  | Role | Hex | Name |
  |------|-----|------|
  | Success | `#5E6B4A` | Sage green |
  | Warning | `#9C6B2F` | Warm amber |
  | Error | `#A04040` | Muted red |
  | Info | `#3E5A63` | Dusty teal |
- **Dark mode strategy:**
  ```css
  :root[data-theme="dark"] {
    --bg: #1A1614;
    --surface: #252019;
    --surface-2: #30291F;
    --text-primary: #E8DDD0;
    --text-muted: #9A8E82;
    --accent: #D4694E;
    --accent-soft: #6B3D30;
    --accent-hover: #E0805F;
    --rule: #3D3429;
  }
  ```
  Dark mode reduces saturation ~15%, warms the dark backgrounds, and softens the accent.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — generous vertical rhythm between sections, normal density within cards
- **Scale:**
  | Token | Value | Usage |
  |-------|-------|-------|
  | 2xs | 2px | Hairline gaps |
  | xs | 4px | Chip padding, tight gaps |
  | sm | 8px | Inner padding, small gaps |
  | md | 16px | Standard padding, grid gap |
  | lg | 24px | Section padding, card padding |
  | xl | 32px | Section spacing |
  | 2xl | 48px | Major section breaks |
  | 3xl | 64px | Page top/bottom margins |

## Layout
- **Approach:** Two-column workspace (journal + analysis rail)
- **Grid:** Desktop: `1fr 1.4fr` (entries | analysis). Mobile: single column.
- **Max content width:** 960px (`maxWidth="md"` in MUI)
- **Alignment:** Left-aligned content. Avoid heroic centering except for the record button.
- **Border radius:**
  | Token | Value | Usage |
  |-------|-------|-------|
  | sm | 4px | Chips, alerts, small elements |
  | md | 8px | Buttons, cards, inputs |
  | lg | 12px | Mockup containers, large panels |
  | full | 9999px | Record button (circle) |

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:**
  - Enter: `ease-out` (elements appearing)
  - Exit: `ease-in` (elements leaving)
  - Move: `ease-in-out` (position changes)
- **Duration:**
  | Token | Value | Usage |
  |-------|-------|-------|
  | micro | 50-100ms | Button hover, chip state |
  | short | 150-250ms | Fade transitions, input focus |
  | medium | 250-400ms | Audit text replacement, bar animations |
  | long | 400-700ms | Page transitions (use sparingly) |
- **Defined motions:**
  1. **Recording pulse:** Vermilion glow on record button (2s infinite loop)
  2. **Breakdown bar transition:** 600ms ease-out width animation on new data
  3. **Audit text fade:** 250ms fade when regenerating coach letter
- **No motion for:** Page loads, card appearances, navigation. Keep static.

## Component Patterns
- **Cards:** Use `background: var(--surface)` + `border: 1px solid var(--rule)` + `border-radius: var(--radius-md)`. No box-shadow.
- **Section headers:** `<Typography variant="overline">` rendered as semantic `<h2>`/`<h3>` for a11y. Uppercase, 0.08em tracking, muted color.
- **AI Coach letters:** Left border accent (`2px solid var(--accent)`) + surface background + rounded right corners. Coach label in uppercase overline style.
- **Weekly coach:** Visually distinct from daily audit — uses `var(--cat-time)` border color and `var(--surface-2)` background.
- **Category chips:** Outlined style with matching category color. No filled background — just border + text color + faint 6% opacity fill.
- **Buttons:** Primary = vermilion filled. Secondary = vermilion outlined. Ghost = muted border. All 8px border-radius.
- **Record button:** 72px circle, vermilion fill, white mic icon, pulse animation when idle.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-25 | Initial design system created | Created by /design-consultation based on competitive research (Toggl, Clockify, Linear, Arc) + cross-model consensus (Codex + Claude subagent both proposed warm paper + editorial direction) |
| 2026-03-25 | Warm cream background (#F5EDE0) | Every competitor uses white or dark. Cream paper positions the product as a journal/reflection tool, not a SaaS dashboard. |
| 2026-03-25 | Vermilion accent (#B6492D) | Stands out from blue/purple crowd. Warm red-orange pairs beautifully with cream. Used restrainedly for emphasis. |
| 2026-03-25 | Serif headings (DM Serif Display) | "Serif is for reflection, sans is for action." Literary headings differentiate from startup-clean sans-serif competitors. |
| 2026-03-25 | Bilingual typography pairing | Noto Serif SC for Chinese headings, Noto Sans SC for Chinese body. Matches the serif/sans role split across both languages. |
| 2026-03-25 | No box-shadow anywhere | Paper-tone layering via background color, not elevation. Hairline borders for separation. Cleaner, more editorial. |
