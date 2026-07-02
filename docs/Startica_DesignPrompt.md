> **SUPERSEDED (2026-07-02):** For palette, radii, and type scale, the source of truth is now `design/mockups/startica_core/DESIGN.md` (see `docs/superpowers/specs/2026-07-02-ui-design-alignment-design.md`). This document remains valid for UX copy: screen inventory, component states, and accessibility notes.

# Startica — Design Prompt (Admin Panel)

Design a web-based admin panel for **Startica**, a kindergarten management SaaS. The panel is used by kindergarten administrators and educators to manage multiple kindergartens, groups, children, and staff. It handles sensitive data about children, so it must feel **professional, calm, and trustworthy** — modern SaaS, not playful or childish.

**Reference aesthetic:** Linear / Notion / Vercel dashboards — minimal, spacious, confident. Avoid cartoonish kindergarten clichés (no bright primary rainbows, no comic fonts).

**Platform:** Desktop-first responsive web app. Left sidebar navigation + top bar layout.

---

## Color Palette

The palette is grounded in the Startica logo (slate wordmark + warm yellow chat bubble + gold) and extended into a full UI system. The yellow is an **accent only** — never a primary button color (yellow + white text = poor contrast). The interactive/primary color is a **teal** that bridges the logo's slate and sage.

### Brand colors (from logo)
| Color | Hex | Role |
|---|---|---|
| Slate | `#434E53` | Wordmark → neutral family base |
| Yellow | `#FAD25B` | Chat bubble → brand accent (highlights, notifications) |
| Gold | `#D89B3F` | Warning / medical sections |
| Peach | `#F2CAA7` | Soft highlights, empty states |
| Sage | `#AFC1BE` | Educator badge, calm accents |
| Cream | `#E8EAE0` | Secondary background, sidebar tint |

### Primary — Teal (interactive)
| Token | Hex | Usage |
|---|---|---|
| Teal 50 | `#EAF3F2` | Subtle hover bg, light badge bg |
| Teal 100 | `#D0E5E3` | Soft backgrounds, chips |
| Teal 200 | `#A3CCC8` | Accent borders, disabled states |
| Teal 300 | `#6FB0AB` | Hover on light elements |
| Teal 400 | `#429089` | Primary button hover |
| **Teal 500 (PRIMARY)** | `#1F706A` | Primary button, link, active nav, focus ring |
| Teal 600 | `#1A5F5A` | Primary button pressed/active |
| Teal 700 | `#154D49` | Dark accents, headings on light bg |

### Neutrals — Slate family
| Token | Hex | Usage |
|---|---|---|
| Neutral 50 | `#F6F7F7` | App background |
| Neutral 100 | `#E8EAEA` | Alternate rows, dividers |
| Neutral 200 | `#D1D6D6` | Borders, input borders |
| Neutral 300 | `#AEB6B7` | Placeholder, inactive icons |
| Neutral 400 | `#7E898C` | Secondary text |
| Neutral 500 | `#5C686C` | Body secondary text, labels |
| Neutral 600 | `#434E53` | Primary text, sidebar bg |
| Neutral 800 | `#282F32` | Headings, high-emphasis text |

### Semantic
| Token | Hex | Usage |
|---|---|---|
| Success | `#3E8E7E` | Confirmations, present status, save success |
| Warning | `#D89B3F` | Allergies/medical, cautions (brand gold) |
| Error | `#C0492F` | Errors, delete, failed validation |
| Info | `#3B7A9E` | Informational notices, tooltips |

### Role badges
| Role | Background | Text |
|---|---|---|
| Super Admin | `#1F706A` | `#FFFFFF` |
| Admin | `#FAD25B` | `#6B4E16` |
| Educator | `#AFC1BE` | `#2A3B38` |

### Surfaces
| Token | Hex | Usage |
|---|---|---|
| Surface / Card | `#FFFFFF` | Cards, modals, inputs |
| App background | `#F6F7F7` | General app background |
| Sidebar tint | `#E8EAE0` | Sidebar background (brand cream) |
| Border | `#D1D6D6` | Standard borders, dividers |

---

## Typography
- **Font:** Inter (or similar clean sans-serif).
- **Scale:** Display 32px / H1 24px / H2 20px / H3 16px / Body 14px / Small 12px.
- **Weights:** 600 for headings, 500 for labels/buttons, 400 for body.
- **Line-height:** 1.5 body, 1.25 headings.

## Spacing & Layout
- Spacing scale: 4, 8, 12, 16, 24, 32, 48px.
- Sidebar width: 240px (collapsible to 64px icon-only).
- Top bar height: 64px.
- Card radius: 12px. Button/input radius: 8px.
- Shadows: subtle — `0 1px 3px rgba(0,0,0,0.08)` for cards; slightly stronger on modals.

## Component states (all interactive elements)
- **Buttons:** default / hover (Teal 400) / pressed (Teal 600) / disabled (Teal 200, reduced opacity) / focus (Teal 500 ring).
- **Inputs:** default (Neutral 200 border) / focus (Teal 500 border + ring) / error (Error border + helper text) / disabled (Neutral 100 bg).
- **Rows/cards:** default / hover (Neutral 50 bg) / selected (Teal 50 bg, Teal 500 left border).

---

## Top bar — Kindergarten selector (important)
Top-right corner: a **kindergarten switcher** dropdown. Lists the kindergartens the user has access to, plus an **"All"** option (visible only to Admin / Super Admin) for an aggregated view across their kindergartens. Next to it: language switcher (RO/EN) and user avatar with menu.

---

## Screens to design

1. **Login** — centered card on Neutral 50 bg. Startica logo, email + password, "forgot password" link, language switcher (RO/EN). Primary button in Teal 500.

2. **Dashboard** — stat cards on top (total children, total groups, total staff) reflecting the selected kindergarten or "All". Recent activity area below. Admin sees global stats; educator sees their group(s).

3. **Groups list** — grid of group cards: group name, age range, assigned educator (avatar), children count. "Create group" primary button top-right.

4. **Group detail** — group info header + data table of children in that group.

5. **Children list** — searchable/filterable data table: name, group, age, parent contact. Pagination. Sensitive data (e.g. CNP) masked in list view.

6. **Child profile** — personal details panel; **medical notes section visually highlighted in Warning/gold style** (the place allergies live — must stand out); parent contacts list with relationship labels.

7. **Staff list** — table of employees with **role badges** (color-coded as above) and the groups they manage. "Invite user" primary button.

8. **Settings / Profile** — change password, language selector (RO default, EN toggle), profile info.

---

## Standardized components
Sidebar nav with icons + active state (Teal 500). Top bar with kindergarten switcher + language + avatar. Reusable data tables with pagination, sort, empty states. Cards. Color-coded role badges. Modals for create/edit forms. Toasts for feedback. Empty states with soft peach illustration accents.

## Accessibility & localization
- WCAG AA contrast throughout. Visible focus rings (Teal 500).
- RO is the default language, EN available via toggle. All labels bilingual-ready.
- Microcopy calm and professional in both languages.

## Guardrails
- No cartoon clichés, no rainbow primaries, no comic fonts.
- Yellow stays an accent — never a primary button.
- Calm, spacious, trustworthy — this is a tool people use daily to care for children.
