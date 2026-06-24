---
name: Startica Core
colors:
  surface: '#f2fbff'
  surface-dim: '#d1dce1'
  surface-bright: '#f2fbff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#ebf5fa'
  surface-container: '#e5f0f5'
  surface-container-high: '#dfeaef'
  surface-container-highest: '#dae4e9'
  on-surface: '#131d21'
  on-surface-variant: '#3f4947'
  inverse-surface: '#283236'
  inverse-on-surface: '#e8f2f7'
  outline: '#6f7977'
  outline-variant: '#bec9c6'
  surface-tint: '#156964'
  primary: '#005752'
  on-primary: '#ffffff'
  primary-container: '#1f706a'
  on-primary-container: '#a5f0e8'
  inverse-primary: '#89d4cc'
  secondary: '#745b00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65f'
  on-secondary-container: '#755c00'
  tertiary: '#763d26'
  on-tertiary: '#ffffff'
  tertiary-container: '#93543b'
  on-tertiary-container: '#ffdbce'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#a5f0e8'
  primary-fixed-dim: '#89d4cc'
  on-primary-fixed: '#00201e'
  on-primary-fixed-variant: '#00504b'
  secondary-fixed: '#ffe08b'
  secondary-fixed-dim: '#e9c24d'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#584400'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#6f3720'
  background: '#f2fbff'
  on-background: '#131d21'
  surface-variant: '#dae4e9'
  ink-700: '#434E53'
  ink-500: '#636C70'
  ink-400: '#889094'
  primary-hover: '#18564F'
  primary-soft: '#E4F0EE'
  accent-deep: '#C98A2B'
  accent-soft: '#FDF6E1'
  success: '#3E8A6E'
  warning: '#D89B3F'
  danger: '#C0553D'
  page-bg: '#F6F7F5'
  card-bg: '#FFFFFF'
  border: '#E3E7E5'
typography:
  display:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  h1:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  h2:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  h3:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-medium:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  small:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  sidebar-width: 256px
  topbar-height: 64px
  page-padding: 32px
  gutter: 24px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style

The design system is built for a professional, high-trust kindergarten management environment. It blends the clinical precision of modern SaaS (like Linear or Notion) with the warmth required for an educational context. 

The aesthetic is **Corporate / Modern** with a focus on high-utility density. It utilizes a restrained "Ink" palette to ground the interface in professionalism, while using "Teal" and "Gold" as functional anchors for primary actions and secondary highlights. The interface prioritizes clarity, calm layouts, and systematic hierarchy to reduce the cognitive load on administrators and educators.

## Colors

The palette is segmented into functional tiers to ensure a professional SaaS aesthetic:

- **Primary (Teal):** Used for the main call-to-action buttons, active navigation states, and progress indicators. Use the "Soft" variant for subtle backgrounds in alerts or selected item rows.
- **Accent (Gold):** Reserved for highlights, special notices, or "star" features. It adds a touch of warmth without compromising the professional tone.
- **Neutrals (Ink/Slate):** A sophisticated range of cool grays. Ink 900 is reserved for primary headings, while Ink 400/500 are used for secondary labels and metadata.
- **Semantic:** Standard success, warning, and danger colors are adjusted to match the saturation levels of the primary brand colors, ensuring they don't feel jarring.
- **Backgrounds:** The "Page" background is a very light off-white (#F6F7F5) to provide enough contrast for "Card" surfaces (#FFFFFF) to pop forward.

## Typography

This design system uses **Inter** exclusively to achieve a systematic, utilitarian feel. 

- **Sentence Case:** Applied to all UI text, including buttons and headers, to maintain an approachable and modern tone.
- **Tabular Numbers:** Must be used for all tables, data grids, and financial figures to ensure vertical alignment and legibility.
- **Scale:** The hierarchy is tight. Body text at 14px allows for high information density, while Display and H1 styles use slight negative letter spacing to feel more "designed" and compact.

## Layout & Spacing

The layout follows a structured **Fixed Sidebar** model typical of sophisticated SaaS products.

- **Sidebar:** A constant 256px anchor on the left, using a slightly darker background (Ink 900 or a very dark variation of Teal) to separate navigation from content.
- **Top Bar:** 64px height, housing breadcrumbs and global actions.
- **Grid:** Content should be housed within a max-width container (typically 1200px-1400px) centered within the remaining viewport, or fluid with a 32px margin on either side.
- **Rhythm:** An 8px base unit drives all spacing. Elements should be grouped with 8px (small), 16px (medium), or 24px (large) gaps.

## Elevation & Depth

This design system avoids heavy shadows, opting for **Tonal Layers** and extremely subtle ambient depth.

- **Surface Tiers:** The page background is at the lowest level. Cards and modals sit one level above.
- **Shadows:** Only used to signify interactivity or temporary overlays (modals, dropdowns). Use a soft, CSS-standard shadow: `0 1px 3px rgba(16, 24, 40, 0.06)`.
- **Borders:** Surfaces are primarily defined by the 1px #E3E7E5 border rather than depth. This keeps the UI feeling flat and fast.

## Shapes

The shape language is intentional and varied to distinguish between structural containers and interactive elements:

- **Structural (Cards/Modals):** 16px radius. This larger radius provides a friendly, modern "frame" for content.
- **Interactive (Buttons/Inputs):** 10px radius. This is a "soft" corner that feels precise but approachable.
- **Status (Pills/Badges):** Full pill radius. Used for tags, status indicators (e.g., "Active", "Absent"), and small chips.

## Components

### Buttons
- **Primary:** Teal background, white text. 10px radius. Hover state uses #18564F.
- **Secondary:** White background, 1px #E3E7E5 border, Ink 900 text.
- **Tertiary/Ghost:** No background or border, Teal or Ink 700 text.

### Input Fields
- **Default:** 1px #E3E7E5 border, 10px radius, 14px text. Focus state uses a 2px Teal ring with 0% offset.
- **Labels:** 13px (Small) weight 500, Ink 700, placed above the field.

### Cards
- White background, 1px border, 16px radius. Minimal padding of 24px for internal content.

### Data Tables
- Header row uses the Page background (#F6F7F5) with 12px Bold Caption text in Ink 500.
- Rows use 1px bottom border only.
- Utilize Tabular Numbers for all numeric columns.

### Chips & Badges
- Used for student status or category tags. Always pill-shaped.
- Use "Soft" colors (Teal Soft, Gold Soft) with darkened text of the same hue for high legibility and low visual noise.