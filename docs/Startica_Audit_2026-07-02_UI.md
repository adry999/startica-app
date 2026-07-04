# Startica — Audit 2026-07-02 (UI focus)

**Context:** Follow-up to the 2026-06-26 audits, requested because "the UI is not the same as in the design."
**Method:** Static comparison — mockup screenshots (`design/mockups/*/screen.png`) + both design specs vs. the current pages/layouts. Docker was not running, so no live screenshot loop was possible (see "Next steps").

**Status update:** UI-0, UI-1, and UI-2 implemented on `fix/security-and-quality` (see `docs/superpowers/plans/2026-07-02-ui-design-alignment.md`). UI-3 (children pagination/kebab/filters) and the live screenshot-compare loop remain open.

---

## Verified fixed since the last audit — good work

- **CR1 / role escalation:** `20260626142704_fix_cr1_superadmin_escalation.sql`, `20260627000000_restore_proxy_escalation_guard.sql`, `20260627200000_role_assignment_hardening.sql` landed, and `staff.schema.ts` now restricts `role` to `['admin', 'educator']`.
- **H2/H3 (lint + CI):** `eslint.config.mjs`, `lint`/`lint:fix` scripts, and `.github/workflows/ci.yml` all exist.
- **H4 (email):** `src/core/email/` exists (`send.ts` + `templates/`).
- **C2 (audit logging):** DB-enforced via `20260626183603_audit_enforcement.sql`; the dashboard activity feed now reads `audit_logs`.
- **H1 (asyncData):** no `onMounted` fetches remain — all pages use `useLazyAsyncData` wrapping store actions.

The security/architecture backlog from June is essentially closed. The remaining debt is UI.

---

## UI-0 (root cause) — Two conflicting design sources of truth

The app can never match the mockups while this stands:

| Token | `docs/Startica_DesignPrompt.md` (CLAUDE.md's declared source) | `design/mockups/startica_core/DESIGN.md` (what the mockups were generated from) |
|---|---|---|
| Primary | Teal 500 `#1F706A` | `#005752` (visibly darker) |
| Card radius | 12px | 16px |
| Button/input radius | 8px | 10px |
| Page bg | Neutral ramp | `#F6F7F5` + Ink neutrals |
| Type scale | not fully specified | display 32 / h1 24 / h2 20 / body 14 |

`main.css` follows the DesignPrompt hexes but pages hardcode `rounded-2xl` (16px — the DESIGN.md value), so the current UI is a hybrid of both. Every "why doesn't it look like the mockup" complaint traces back here.

**Fix:** pick one source (recommend DESIGN.md, since the reference screenshots everyone compares against were generated from it), regenerate the `@theme` block in `main.css` from it, update the DesignPrompt or mark it superseded, and note the decision in CLAUDE.md.

---

## UI-1 — Global shell diverges on every screen (highest visual impact)

`src/layouts/admin.vue` vs. all mockups:

1. **No max-width container.** DESIGN.md: content in a 1200–1400px centered container. Current `<main class="flex-1 overflow-auto p-8">` is fluid full-width — on a wide monitor every table/card stretches and the proportions look nothing like the mockups. One-line fix: wrap slot in `mx-auto w-full max-w-[1400px]`.
2. **Topbar is half-empty.** Mockups: global search (left), notification bell, avatar photo + name + role (right). Current: empty `flex-1` placeholder + kg selector + initials. Global search and bell are missing entirely.
3. **Page titles undersized.** Mockups use the 32px display style ("Children Directory", "Group Management", "Staff & Educators") + 16px subtitle; every page uses `text-xl` (20px). The whole app reads one visual notch smaller than the design.
4. **Sidebar:** missing the prominent "New Registration" primary CTA button and the Support entry above Logout.

---

## UI-2 — Component drift between pages (no shared Base components)

CLAUDE.md mandates `shared/ui` `Base*` components; only `BaseAvatar` exists. Consequences visible today:

- **Stat cards:** the same card markup is copy-pasted ~12× across dashboard/children/groups/staff — and has already drifted: staff uses `rounded-xl` with no shadow, the others `rounded-2xl` + shadow token. Mockup stat cards also have icon bubbles + secondary metadata line ("+2 this mo", "3 vacancies") that only the dashboard has.
- **Tab filter bar:** hand-rolled underline tabs duplicated in children/groups/staff; the staff mockup actually specifies a segmented pill control ("All Staff / Educators / Administration").
- **Page header** (title + subtitle + primary action): duplicated in every page.

**Fix:** extract `BasePageHeader`, `BaseStatCard`, `BaseFilterTabs` and migrate all pages — this fixes UI-1.3 and the staff-page drift in one pass and stops future divergence.

---

## UI-3 — Per-page gaps vs. mockups

### Children directory (biggest per-page delta)
- **No pagination** — mockup: "Showing 1–4 of 128" + numbered pager; app renders every row. DesignPrompt also explicitly requires "data tables with pagination, sort". (Also a perf problem as data grows.)
- **Row actions** are text buttons ("Edit", "Set status") instead of the mockup's kebab menu.
- **Filters:** mockup has Group + Age Range dropdowns; app has only status tabs + name search.
- Stat cards sit on top, plain; mockup places icon-bubble cards (with trend lines) at the bottom.

### Staff
- Old card style (see UI-2), underline tabs instead of segmented control, no pagination, no "Sorted by" control.

### Groups
- Closest match. Missing: icon bubbles + metadata line on stat cards, the dashed "Add New Group" tile in the card grid, kebab menu on cards. Minor.

### Child profile
- Structure matches (left photo/details column, medical alerts, guardian cards). Mockup renders Medical Alerts as a full-width gold banner with pill-shaped alert chips at the top of the right column; app renders it as a plain card. Photo upload is deferred (documented in `docs/design-gaps/settings.md` decision).

### Dashboard / Settings
- Already tracked in `docs/design-gaps/dashboard.md` and `settings.md`; dashboard was rebuilt to the 3-row layout and is in good shape. Remaining dashboard nits: header search/bell (UI-1.2), Facility Reminder card (out of scope V1).

Out of scope V1 (don't chase): attendance columns/percentages, Billing/Reports nav, waitlist table, Staff Training / Time-off cards, notification system.

---

## Non-UI items

- **N-1:** `supabase/seed.sql` has +390/−109 uncommitted lines. Commit or discard — the branch state is illegible for review.
- **N-2:** `children` page reuses `t('staff.selectKindergarten')` — move to a `common.*` key.
- **N-3:** The screenshot-compare-refine loop CLAUDE.md mandates has never run (Docker was down during this audit). Run it after UI-1/UI-2 land.

---

## Suggested order

1. **UI-0** — decide the single design source, align `@theme` tokens (one sitting, unblocks everything).
2. **UI-1** — max-width container + display-size page titles + topbar search/bell ("shell pass": every screen improves at once).
3. **UI-2** — extract `BasePageHeader` / `BaseStatCard` / `BaseFilterTabs`, migrate staff page in the process.
4. **UI-3** — children directory: pagination + kebab actions + group/age filters; then groups/profile nits.
5. **N-1** now (independent); **N-3** after step 3, with Docker running.
