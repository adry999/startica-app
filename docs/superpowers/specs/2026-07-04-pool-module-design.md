# Pool Module (Bazin) — Design Spec

**Date:** 2026-07-04
**Status:** Approved (design) — pending spec review before planning
**Part of:** Pool + Payroll initiative, sub-project **B** (per `docs/superpowers/specs/2026-07-02-module-access-design.md`). Depends on sub-project **A** (module-access grants, PR #9 — **open, unmerged** as of this writing).

## Dependency gate

Implementation is **blocked** until PR #9 (`feat/module-access`) merges to `main`. This spec can be written and reviewed now; the implementation plan (next step) should not be executed until the dependency clears. Re-check PR #9 state before starting the plan.

## Purpose

Kindergartens offer swim sessions (înot) taught by a trainer (antrenor). This module lets an Admin/Super Admin grant the `pool` module (already defined in sub-project A's `user_modules` schema) to an Educator, who then manages their own weekly swim schedule. Children are enrolled per session, either as a whole group (default) or individually.

## Scope

**In scope**
- Trainer weekly availability windows.
- Recurring weekly schedule patterns → generated concrete session instances (rolling window).
- Per-session participant list: defaults from the pattern's group, adjustable per child.
- Per-session capacity limit, enforced on enrollment.
- Trainer self-manages own schedule; Admin/Super Admin manage all trainers' schedules in their kindergartens.
- `/pool` route + "Bazin" sidebar entry (already stubbed in sub-project A's nav plan).

**Out of scope (V1)**
- Notifications/reminders (messaging is out of scope V1 project-wide).
- Complex recurrence (bi-weekly, exceptions beyond cancel/edit-single-instance). If a need arises later, extend `pool_schedule_patterns`, don't rebuild.
- Dashboard occupancy tile (can be added later as a `dashboard` module read from `pool_sessions`, doesn't require pool module changes).
- Payroll integration (sub-project C, separate).

## Data model

Four new tables, all with `kindergarten_id`, standard audit columns (`created_at`, `updated_at`, `created_by`, `updated_by`), `deleted_at` soft-delete, and RLS per project convention.

```sql
pool_trainer_availability
  id uuid pk
  kindergarten_id uuid fk
  trainer_user_id uuid fk -> users
  weekday smallint  -- 0=Sunday .. 6=Saturday
  start_time time
  end_time time
  -- audit + deleted_at

pool_schedule_patterns
  id uuid pk
  kindergarten_id uuid fk
  trainer_user_id uuid fk -> users
  weekday smallint
  start_time time
  end_time time
  default_group_id uuid fk -> groups, nullable
  capacity int
  active_from date
  active_until date, nullable
  -- audit + deleted_at
  -- app-level check: (weekday, start_time, end_time) must fall inside
  -- a live pool_trainer_availability row for the same trainer+kindergarten

pool_sessions
  id uuid pk
  kindergarten_id uuid fk
  trainer_user_id uuid fk -> users
  source_pattern_id uuid fk -> pool_schedule_patterns, nullable  -- null = ad-hoc
  session_date date
  start_time time
  end_time time
  capacity int
  group_id uuid fk -> groups, nullable  -- snapshot from pattern at generation time
  status text  -- 'scheduled' | 'cancelled'
  -- audit + deleted_at

pool_session_participants
  id uuid pk
  session_id uuid fk -> pool_sessions
  child_id uuid fk -> children
  status text  -- 'enrolled' | 'removed'
  -- audit + deleted_at
  -- unique (session_id, child_id) where deleted_at is null and status = 'enrolled'
```

### Instance generation

No cron job in V1. `pool.service.listSessions(kindergartenId)` generates missing instances on read:
1. For each live pattern in the kindergarten, compute the next occurrence dates within a rolling **+8 week** window that don't already have a `pool_sessions` row for `(source_pattern_id, session_date)`.
2. Insert missing instances (status `scheduled`, capacity/group copied from the pattern).
3. If the pattern has `default_group_id`, auto-insert `pool_session_participants` rows (status `enrolled`) for all currently-active (`status = 'enrolled'` in children) children in that group.
4. Existing instances (already generated, possibly edited/cancelled since) are left untouched — generation is additive and idempotent, never overwrites.

Editing or cancelling a specific `pool_sessions` row never touches the pattern or other instances.

### Capacity enforcement

`addParticipant(sessionId, childId)` counts live `enrolled` rows for the session; rejects if `count >= capacity`.

## Permissions

Extends `can()` from sub-project A. Sub-project A's `payrollScope`-style helper precedent is followed: add an explicit `manage` action rather than overloading `view`.

- `can('view', 'pool', kgId)` — defined in sub-project A: Admin/Super Admin bypass (scoped to their kindergartens); Educator → live `pool` grant for that `kgId`.
- **New:** `can('manage', 'pool', kgId, trainerUserId?)`:
  - Admin / Super Admin → `true` (scoped to their kindergartens).
  - Educator with `pool` grant on `kgId` → `true` only when `trainerUserId` is themselves (self-service schedule management). Cannot manage another trainer's availability/patterns/sessions in the same kindergarten.
- No grant → module fully hidden (no `view`, no `manage`). Matches the already-decided module-access behavior (no partial/read-only fallback for other educators).

## UI & navigation

- Route `/pool`, sidebar entry "Bazin" — nav wiring already speced in sub-project A (`enabled: can('view', 'pool', currentKgId)`).
- `PoolCalendarPage` — weekly list/calendar of sessions for the selected kindergarten (lightweight, no heavy calendar library). Click a session → drawer with participants, capacity, trainer.
- `PoolTrainerSettingsPage` (or a tab reachable from it) — trainer edits own availability windows; Admin sees all trainers' availability in the kindergarten.
- New components in `src/modules/pool/components/`: session card, participant list/editor, availability editor. Reuse `BasePageHeader`, `BaseFilterTabs` (filter by trainer/week), `BaseBadge` (session status), `BasePagination` if session lists grow long.
- Participants UI: checkbox list of the default group's active children, plus add/remove individual children from other groups.
- All new strings under `pool.*` i18n namespace, RO (default) + EN.

## Testing

**Vitest**
- `pool.service`: instance generation is idempotent (running twice doesn't duplicate), capacity validation blocks over-limit enrollment, availability validation rejects a pattern outside the trainer's windows.
- `usePermissions`: `can('manage', 'pool', kgId, trainerUserId)` across role × grant × trainer-identity combinations (admin bypass, self-trainer true, other-trainer false, no-grant false).
- Zod schemas for pattern/session/participant payloads.

**Playwright**
- Trainer creates an availability window, then a pattern inside it → sessions appear for the next weeks.
- Trainer/Admin adds and removes an individual child from a generated session.
- Enrollment blocked once a session hits capacity.

## Definition of done

- [ ] Migration created for all 4 tables + regenerated types.
- [ ] RLS + soft-delete + audit columns on all 4 tables, `kindergarten_id` scoping enforced.
- [ ] `can('manage', 'pool', kgId, trainerUserId)` implemented and tested; `can('view', 'pool', kgId)` reused from sub-project A.
- [ ] Instance generation is idempotent and additive; verified by test running generation twice.
- [ ] Capacity enforced on participant add.
- [ ] Trainer availability validated against pattern creation (reject out-of-window patterns).
- [ ] All strings via i18n (RO + EN).
- [ ] All queries scoped `kindergarten_id` + `deleted_at IS NULL`; only `pool.service` talks to Supabase (no direct client calls in stores/pages — audit from 2026-07-04 found this violation elsewhere, don't repeat it here).
- [ ] All data fetching via `useAsyncData`/`useLazyAsyncData`.
- [ ] PR #9 (sub-project A) merged before this implementation plan starts.
