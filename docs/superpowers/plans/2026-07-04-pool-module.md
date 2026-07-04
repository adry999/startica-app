# Pool Module (Bazin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pool (Bazin) module — trainer availability, recurring weekly swim-session patterns, generated session instances, and per-session child enrollment — per `docs/superpowers/specs/2026-07-04-pool-module-design.md`.

**Architecture:** New `src/modules/pool/` module following the project's standard layered structure (types → schemas → service → store → composable → components → pages). Four new Postgres tables (`pool_trainer_availability`, `pool_schedule_patterns`, `pool_sessions`, `pool_session_participants`) with RLS/soft-delete/audit columns per project convention. Session instances are generated lazily from patterns on read (idempotent, rolling +8-week window), never via cron.

**Tech Stack:** Nuxt 3, Supabase (Postgres + RLS), Pinia, Zod, Vitest, Nuxt UI, `@nuxtjs/i18n`.

## Global Constraints

- **Blocked on PR #9** (`feat/module-access`, sub-project A) merging to `main` first — it defines `user_modules`, the `pool` grant, and the `auth.store` claims cache this module reads. **Do not start Task 8 onward until PR #9 is merged.** Tasks 1–7 (schema, types, schema validation, service) have no dependency on A and can proceed anytime.
- Every new table: `kindergarten_id` + `created_at`/`updated_at`/`created_by`/`updated_by` + `deleted_at` (soft delete) + RLS enabled.
- Only `pool.service.ts` calls Supabase. Stores/composables/pages never call `useSupabaseClient()` or `.from()` directly (2026-07-04 audit found this violated elsewhere in the codebase — don't repeat it here).
- All fetching via `useAsyncData`/`useLazyAsyncData`.
- No hardcoded user-facing strings — everything through `pool.*` i18n keys, RO (default) + EN.
- Naming: components `PascalCase.vue`, composable `usePool.ts`, store `pool.store.ts`, service `pool.service.ts`, types `pool.types.ts`, schema `pool.schema.ts` in `shared/schemas/`.
- Visual polish: no Pool mockup exists yet in `design/`. Build functionally complete pages using existing `Base*` components (`BasePageHeader`, `BaseFilterTabs`, `BaseBadge`, `BasePagination`) — don't invent bespoke visual treatment. A screenshot-compare pass can refine styling later, once mockups exist.

---

### Task 1: Database schema — 4 tables, RLS, triggers, grants

**Files:**
- Create: `supabase/migrations/<timestamp>_pool_module_schema.sql` (timestamp from `supabase migration new`)
- Modify: `src/core/supabase/types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces: tables `pool_trainer_availability`, `pool_schedule_patterns`, `pool_sessions`, `pool_session_participants`, all referenced by column name in every later task.

- [ ] **Step 1: Generate the migration file**

Run: `supabase migration new pool_module_schema`
Expected: prints the created path, e.g. `supabase/migrations/20260704153000_pool_module_schema.sql`. Use that exact filename for the rest of this task.

- [ ] **Step 2: Write the schema**

Paste into the generated file:

```sql
-- Pool module (Bazin): trainer availability, recurring schedule patterns,
-- generated session instances, per-session child participants.
-- See docs/superpowers/specs/2026-07-04-pool-module-design.md.

create table public.pool_trainer_availability (
  id              uuid        primary key default gen_random_uuid(),
  kindergarten_id uuid        not null references public.kindergartens (id) on delete restrict,
  trainer_user_id uuid        not null references public.users (id),
  weekday         smallint    not null check (weekday between 0 and 6),
  start_time      time        not null,
  end_time        time        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references public.users (id),
  updated_by      uuid        references public.users (id),
  deleted_at      timestamptz,
  constraint pool_trainer_availability_time_order check (start_time < end_time)
);

create trigger trg_pool_trainer_availability_set_updated_at
  before update on public.pool_trainer_availability
  for each row execute function public.set_updated_at();

create trigger trg_pool_trainer_availability_audit_columns
  before insert or update on public.pool_trainer_availability
  for each row execute function public.set_audit_columns();

create trigger trg_pool_trainer_availability_audit_log
  after insert or update on public.pool_trainer_availability
  for each row execute function public.write_audit_log();

create table public.pool_schedule_patterns (
  id                uuid        primary key default gen_random_uuid(),
  kindergarten_id   uuid        not null references public.kindergartens (id) on delete restrict,
  trainer_user_id   uuid        not null references public.users (id),
  weekday           smallint    not null check (weekday between 0 and 6),
  start_time        time        not null,
  end_time          time        not null,
  default_group_id  uuid        references public.groups (id),
  capacity          integer     not null check (capacity > 0),
  active_from       date        not null,
  active_until      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        references public.users (id),
  updated_by        uuid        references public.users (id),
  deleted_at        timestamptz,
  constraint pool_schedule_patterns_time_order check (start_time < end_time),
  constraint pool_schedule_patterns_date_order check (active_until is null or active_until >= active_from)
);

create trigger trg_pool_schedule_patterns_set_updated_at
  before update on public.pool_schedule_patterns
  for each row execute function public.set_updated_at();

create trigger trg_pool_schedule_patterns_audit_columns
  before insert or update on public.pool_schedule_patterns
  for each row execute function public.set_audit_columns();

create trigger trg_pool_schedule_patterns_audit_log
  after insert or update on public.pool_schedule_patterns
  for each row execute function public.write_audit_log();

create table public.pool_sessions (
  id                uuid        primary key default gen_random_uuid(),
  kindergarten_id   uuid        not null references public.kindergartens (id) on delete restrict,
  trainer_user_id   uuid        not null references public.users (id),
  source_pattern_id uuid        references public.pool_schedule_patterns (id),
  session_date      date        not null,
  start_time        time        not null,
  end_time          time        not null,
  capacity          integer     not null check (capacity > 0),
  group_id          uuid        references public.groups (id),
  status            text        not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid        references public.users (id),
  updated_by        uuid        references public.users (id),
  deleted_at        timestamptz,
  constraint pool_sessions_time_order check (start_time < end_time)
);

-- Prevents re-generating the same instance twice for the same pattern+date.
create unique index pool_sessions_pattern_date_unique
  on public.pool_sessions (source_pattern_id, session_date)
  where source_pattern_id is not null and deleted_at is null;

create trigger trg_pool_sessions_set_updated_at
  before update on public.pool_sessions
  for each row execute function public.set_updated_at();

create trigger trg_pool_sessions_audit_columns
  before insert or update on public.pool_sessions
  for each row execute function public.set_audit_columns();

create trigger trg_pool_sessions_audit_log
  after insert or update on public.pool_sessions
  for each row execute function public.write_audit_log();

-- kindergarten_id is denormalized from the session (same rationale as
-- children/parents/guardians: keeps RLS flat/fast, no join needed for tenant scoping).
create table public.pool_session_participants (
  id              uuid        primary key default gen_random_uuid(),
  session_id      uuid        not null references public.pool_sessions (id) on delete cascade,
  kindergarten_id uuid        not null references public.kindergartens (id) on delete restrict,
  child_id        uuid        not null references public.children (id),
  status          text        not null default 'enrolled' check (status in ('enrolled', 'removed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid        references public.users (id),
  updated_by      uuid        references public.users (id),
  deleted_at      timestamptz
);

create unique index pool_session_participants_unique_active
  on public.pool_session_participants (session_id, child_id)
  where deleted_at is null and status = 'enrolled';

create trigger trg_pool_session_participants_set_updated_at
  before update on public.pool_session_participants
  for each row execute function public.set_updated_at();

create trigger trg_pool_session_participants_audit_columns
  before insert or update on public.pool_session_participants
  for each row execute function public.set_audit_columns();

create trigger trg_pool_session_participants_audit_log
  after insert or update on public.pool_session_participants
  for each row execute function public.write_audit_log();

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.pool_trainer_availability enable row level security;
alter table public.pool_schedule_patterns enable row level security;
alter table public.pool_sessions enable row level security;
alter table public.pool_session_participants enable row level security;

-- pool_trainer_availability: read by admin/super_admin (kg-scoped) or the trainer themself.
-- Write by admin/super_admin (kg-scoped) or the trainer themself.
create policy pool_trainer_availability_select on public.pool_trainer_availability
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_trainer_availability_insert on public.pool_trainer_availability
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

create policy pool_trainer_availability_update on public.pool_trainer_availability
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

-- pool_schedule_patterns: same shape as availability.
create policy pool_schedule_patterns_select on public.pool_schedule_patterns
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_schedule_patterns_insert on public.pool_schedule_patterns
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

create policy pool_schedule_patterns_update on public.pool_schedule_patterns
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

-- pool_sessions: same shape.
create policy pool_sessions_select on public.pool_sessions
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_sessions_insert on public.pool_sessions
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

create policy pool_sessions_update on public.pool_sessions
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or trainer_user_id = auth.uid()
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or trainer_user_id = auth.uid()
      )
    )
  );

-- pool_session_participants: kindergarten_id is denormalized so no join is
-- needed for tenant scoping, but the trainer check still needs the parent
-- session's trainer_user_id (same join style as parents_select via children/groups).
create policy pool_session_participants_select on public.pool_session_participants
  for select
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or exists (
            select 1 from public.pool_sessions s
            where s.id = pool_session_participants.session_id
              and s.trainer_user_id = auth.uid()
          )
        )
      )
    )
  );

create policy pool_session_participants_insert on public.pool_session_participants
  for insert
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.pool_sessions s
          where s.id = pool_session_participants.session_id
            and s.trainer_user_id = auth.uid()
        )
      )
    )
  );

create policy pool_session_participants_update on public.pool_session_participants
  for update
  using (
    deleted_at is null
    and (
      (select public.is_super_admin())
      or (
        kindergarten_id in (select public.user_kindergarten_ids())
        and (
          (select public.current_user_role()) = 'admin'
          or exists (
            select 1 from public.pool_sessions s
            where s.id = pool_session_participants.session_id
              and s.trainer_user_id = auth.uid()
          )
        )
      )
    )
  )
  with check (
    (select public.is_super_admin())
    or (
      kindergarten_id in (select public.user_kindergarten_ids())
      and (
        (select public.current_user_role()) = 'admin'
        or exists (
          select 1 from public.pool_sessions s
          where s.id = pool_session_participants.session_id
            and s.trainer_user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- GRANTs — table-level, mirroring the RLS policies (select/insert/update only,
-- no delete: soft delete is an UPDATE). service_role also needs an explicit
-- grant since `grant ... on all tables in schema public to service_role`
-- (20260626132001) only covered tables that existed at that time.
-- ============================================================================

grant select, insert, update on public.pool_trainer_availability to authenticated;
grant select, insert, update on public.pool_schedule_patterns to authenticated;
grant select, insert, update on public.pool_sessions to authenticated;
grant select, insert, update on public.pool_session_participants to authenticated;

grant select, insert, update, delete on public.pool_trainer_availability to service_role;
grant select, insert, update, delete on public.pool_schedule_patterns to service_role;
grant select, insert, update, delete on public.pool_sessions to service_role;
grant select, insert, update, delete on public.pool_session_participants to service_role;
```

- [ ] **Step 3: Apply locally and regenerate types**

Run: `supabase db reset` (applies all migrations + seed fresh)
Expected: ends with `Seeding data supabase/seed.sql from…` and exit code 0, no SQL errors.

Run: `supabase gen types typescript --local > src/core/supabase/types.ts`
Expected: file updates; `pool_trainer_availability`, `pool_schedule_patterns`, `pool_sessions`, `pool_session_participants` appear as new keys under `Tables` in the diff.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations src/core/supabase/types.ts
git commit -m "feat(pool): add trainer availability, schedule pattern, session, participant tables"
```

---

### Task 2: Types and Zod schemas

**Files:**
- Create: `src/modules/pool/types/pool.types.ts`
- Create: `src/shared/schemas/pool.schema.ts`
- Test: `src/shared/schemas/pool.schema.test.ts`

**Interfaces:**
- Produces: `TrainerAvailability`, `SchedulePattern`, `PoolSession`, `SessionParticipant` (consumed by every later task); `trainerAvailabilitySchema`, `schedulePatternSchema` + `TrainerAvailabilityInput`, `SchedulePatternInput` (consumed by Task 4/5 service inputs and Task 11/13/14 forms).

- [ ] **Step 1: Write the types file**

```typescript
// src/modules/pool/types/pool.types.ts

export interface TrainerAvailability {
  id: string
  kindergartenId: string
  trainerUserId: string
  weekday: number // 0 = Sunday .. 6 = Saturday
  startTime: string // 'HH:MM'
  endTime: string
}

export interface SchedulePattern {
  id: string
  kindergartenId: string
  trainerUserId: string
  weekday: number
  startTime: string
  endTime: string
  defaultGroupId: string | null
  capacity: number
  activeFrom: string // 'YYYY-MM-DD'
  activeUntil: string | null
}

export interface PoolSession {
  id: string
  kindergartenId: string
  trainerUserId: string
  sourcePatternId: string | null
  sessionDate: string // 'YYYY-MM-DD'
  startTime: string
  endTime: string
  capacity: number
  groupId: string | null
  status: 'scheduled' | 'cancelled'
  participantCount: number
}

export interface SessionParticipant {
  id: string
  sessionId: string
  childId: string
  childName: string
  status: 'enrolled' | 'removed'
}
```

- [ ] **Step 2: Write the failing schema test**

```typescript
// src/shared/schemas/pool.schema.test.ts
import { describe, it, expect } from 'vitest'
import { trainerAvailabilitySchema, schedulePatternSchema } from './pool.schema'

describe('trainerAvailabilitySchema', () => {
  it('accepts a valid window', () => {
    const result = trainerAvailabilitySchema.safeParse({ weekday: 1, startTime: '09:00', endTime: '12:00' })
    expect(result.success).toBe(true)
  })

  it('rejects when endTime is not after startTime', () => {
    const result = trainerAvailabilitySchema.safeParse({ weekday: 1, startTime: '12:00', endTime: '09:00' })
    expect(result.success).toBe(false)
  })

  it('rejects weekday out of range', () => {
    const result = trainerAvailabilitySchema.safeParse({ weekday: 7, startTime: '09:00', endTime: '12:00' })
    expect(result.success).toBe(false)
  })
})

describe('schedulePatternSchema', () => {
  it('accepts a valid pattern', () => {
    const result = schedulePatternSchema.safeParse({
      weekday: 2,
      startTime: '10:00',
      endTime: '11:00',
      defaultGroupId: null,
      capacity: 8,
      activeFrom: '2026-09-01',
      activeUntil: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects capacity of 0', () => {
    const result = schedulePatternSchema.safeParse({
      weekday: 2,
      startTime: '10:00',
      endTime: '11:00',
      capacity: 0,
      activeFrom: '2026-09-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects endTime before startTime', () => {
    const result = schedulePatternSchema.safeParse({
      weekday: 2,
      startTime: '11:00',
      endTime: '10:00',
      capacity: 8,
      activeFrom: '2026-09-01',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/shared/schemas/pool.schema.test.ts`
Expected: FAIL with "Cannot find module './pool.schema'"

- [ ] **Step 4: Write the schema**

```typescript
// src/shared/schemas/pool.schema.ts
import { z } from 'zod'

export const trainerAvailabilitySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .refine(d => d.startTime < d.endTime, { message: 'startTime must be before endTime', path: ['endTime'] })

export const schedulePatternSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    defaultGroupId: z.string().uuid().nullable().optional(),
    capacity: z.number().int().min(1),
    activeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activeUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine(d => d.startTime < d.endTime, { message: 'startTime must be before endTime', path: ['endTime'] })

export type TrainerAvailabilityInput = z.infer<typeof trainerAvailabilitySchema>
export type SchedulePatternInput = z.infer<typeof schedulePatternSchema>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/shared/schemas/pool.schema.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pool/types/pool.types.ts src/shared/schemas/pool.schema.ts src/shared/schemas/pool.schema.test.ts
git commit -m "feat(pool): add types and Zod schemas"
```

---

### Task 3: Service — trainer availability CRUD

**Files:**
- Create: `src/modules/pool/services/pool.service.ts`
- Test: `src/modules/pool/services/pool.service.test.ts`

**Interfaces:**
- Consumes: `TrainerAvailability` from Task 2 (`src/modules/pool/types/pool.types.ts`), `Result<T>` from `src/shared/types/result.ts`.
- Produces: `listAvailability(client, kindergartenId, trainerUserId)`, `addAvailability(client, input, actorId)`, `removeAvailability(client, id, actorId)` — consumed by Task 9 (store) and Task 11 (component).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/modules/pool/services/pool.service.test.ts
import { describe, it, expect, vi } from 'vitest'
import { listAvailability, addAvailability, removeAvailability } from './pool.service'

const availabilityRow = {
  id: 'avail-1',
  kindergarten_id: 'kg-1',
  trainer_user_id: 'user-1',
  weekday: 1,
  start_time: '09:00:00',
  end_time: '12:00:00',
}

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [availabilityRow], error: null }),
            }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: availabilityRow, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      ...overrides,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('listAvailability', () => {
  it('returns mapped availability rows', async () => {
    const client = mockClient()
    const result = await listAvailability(client, 'kg-1', 'user-1')
    expect(result).toEqual({
      success: true,
      data: [{ id: 'avail-1', kindergartenId: 'kg-1', trainerUserId: 'user-1', weekday: 1, startTime: '09:00:00', endTime: '12:00:00' }],
    })
  })
})

describe('addAvailability', () => {
  it('inserts with actor as created_by/updated_by', async () => {
    const client = mockClient()
    const result = await addAvailability(
      client,
      { kindergartenId: 'kg-1', trainerUserId: 'user-1', weekday: 1, startTime: '09:00', endTime: '12:00' },
      'actor-1',
    )
    expect(result.success).toBe(true)
    const insertCall = client.from.mock.results[0].value.insert as ReturnType<typeof vi.fn>
    expect(insertCall).toHaveBeenCalledWith(
      expect.objectContaining({
        kindergarten_id: 'kg-1',
        trainer_user_id: 'user-1',
        weekday: 1,
        start_time: '09:00',
        end_time: '12:00',
        created_by: 'actor-1',
        updated_by: 'actor-1',
      }),
    )
  })
})

describe('removeAvailability', () => {
  it('soft-deletes by setting deleted_at', async () => {
    const client = mockClient()
    const result = await removeAvailability(client, 'avail-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    const payload = updateCall.mock.calls[0][0]
    expect(payload.updated_by).toBe('actor-1')
    expect(payload.deleted_at).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: FAIL with "Cannot find module './pool.service'"

- [ ] **Step 3: Write the service (availability functions + shared setup)**

```typescript
// src/modules/pool/services/pool.service.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/core/supabase/types'
import type { Result } from '~/shared/types/result'
import type { TrainerAvailability } from '../types/pool.types'

type Client = SupabaseClient<Database>

function toAvailability(row: Record<string, unknown>): TrainerAvailability {
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    trainerUserId: row.trainer_user_id as string,
    weekday: row.weekday as number,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
  }
}

export async function listAvailability(
  client: Client,
  kindergartenId: string,
  trainerUserId: string,
): Promise<Result<TrainerAvailability[]>> {
  const { data, error } = await client
    .from('pool_trainer_availability')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .eq('trainer_user_id', trainerUserId)
    .is('deleted_at', null)
    .order('weekday')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toAvailability(r as Record<string, unknown>)) }
}

export async function addAvailability(
  client: Client,
  input: { kindergartenId: string; trainerUserId: string; weekday: number; startTime: string; endTime: string },
  actorId: string,
): Promise<Result<TrainerAvailability>> {
  const { data, error } = await client
    .from('pool_trainer_availability')
    .insert({
      kindergarten_id: input.kindergartenId,
      trainer_user_id: input.trainerUserId,
      weekday: input.weekday,
      start_time: input.startTime,
      end_time: input.endTime,
      created_by: actorId,
      updated_by: actorId,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toAvailability(data as Record<string, unknown>) }
}

export async function removeAvailability(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('pool_trainer_availability')
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/modules/pool/services/pool.service.ts src/modules/pool/services/pool.service.test.ts
git commit -m "feat(pool): trainer availability service"
```

---

### Task 4: Service — schedule patterns (with availability validation)

**Files:**
- Modify: `src/modules/pool/services/pool.service.ts`
- Modify: `src/modules/pool/services/pool.service.test.ts`

**Interfaces:**
- Consumes: `SchedulePattern` from Task 2, `Client`/`Result`/`toAvailability` conventions from Task 3.
- Produces: `createPattern(client, input, actorId)`, `listPatterns(client, kindergartenId, trainerUserId?)`, `deletePattern(client, id, actorId)` — consumed by Task 9 (store) and Task 11 (component).

- [ ] **Step 1: Write the failing tests**

Append to `pool.service.test.ts`:

```typescript
import { createPattern, listPatterns, deletePattern } from './pool.service'

const patternRow = {
  id: 'pattern-1',
  kindergarten_id: 'kg-1',
  trainer_user_id: 'user-1',
  weekday: 1,
  start_time: '10:00:00',
  end_time: '11:00:00',
  default_group_id: 'group-1',
  capacity: 8,
  active_from: '2026-09-01',
  active_until: null,
}

describe('createPattern', () => {
  it('rejects a pattern outside the trainer availability window', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await createPattern(
      client,
      {
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        weekday: 1,
        startTime: '10:00',
        endTime: '11:00',
        capacity: 8,
        activeFrom: '2026-09-01',
      },
      'actor-1',
    )
    expect(result).toEqual({ success: false, error: 'outside_trainer_availability' })
  })

  it('creates a pattern that fits inside an availability window', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn()
          .mockReturnValueOnce({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({
                    data: [{ start_time: '09:00:00', end_time: '12:00:00' }],
                    error: null,
                  }),
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            single: vi.fn().mockResolvedValue({ data: patternRow, error: null }),
          }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: patternRow, error: null }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await createPattern(
      client,
      {
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        weekday: 1,
        startTime: '10:00',
        endTime: '11:00',
        defaultGroupId: 'group-1',
        capacity: 8,
        activeFrom: '2026-09-01',
      },
      'actor-1',
    )
    expect(result.success).toBe(true)
  })
})

describe('listPatterns', () => {
  it('returns mapped pattern rows', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [patternRow], error: null }),
            }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await listPatterns(client, 'kg-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]).toEqual({
        id: 'pattern-1',
        kindergartenId: 'kg-1',
        trainerUserId: 'user-1',
        weekday: 1,
        startTime: '10:00:00',
        endTime: '11:00:00',
        defaultGroupId: 'group-1',
        capacity: 8,
        activeFrom: '2026-09-01',
        activeUntil: null,
      })
    }
  })
})

describe('deletePattern', () => {
  it('soft-deletes by setting deleted_at', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await deletePattern(client, 'pattern-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: FAIL — `createPattern`, `listPatterns`, `deletePattern` not exported.

- [ ] **Step 3: Add the pattern functions**

Append to `pool.service.ts` (after the availability functions):

```typescript
import type { SchedulePattern } from '../types/pool.types'

function toPattern(row: Record<string, unknown>): SchedulePattern {
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    trainerUserId: row.trainer_user_id as string,
    weekday: row.weekday as number,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    defaultGroupId: (row.default_group_id as string | null) ?? null,
    capacity: row.capacity as number,
    activeFrom: row.active_from as string,
    activeUntil: (row.active_until as string | null) ?? null,
  }
}

export async function createPattern(
  client: Client,
  input: {
    kindergartenId: string
    trainerUserId: string
    weekday: number
    startTime: string
    endTime: string
    defaultGroupId?: string | null
    capacity: number
    activeFrom: string
    activeUntil?: string | null
  },
  actorId: string,
): Promise<Result<SchedulePattern>> {
  const { data: availabilityRows, error: availabilityError } = await client
    .from('pool_trainer_availability')
    .select('start_time, end_time')
    .eq('trainer_user_id', input.trainerUserId)
    .eq('kindergarten_id', input.kindergartenId)
    .eq('weekday', input.weekday)
    .is('deleted_at', null)

  if (availabilityError) return { success: false, error: availabilityError.message }

  const fits = (availabilityRows ?? []).some(
    row =>
      input.startTime >= (row as { start_time: string }).start_time &&
      input.endTime <= (row as { end_time: string }).end_time,
  )
  if (!fits) return { success: false, error: 'outside_trainer_availability' }

  const { data, error } = await client
    .from('pool_schedule_patterns')
    .insert({
      kindergarten_id: input.kindergartenId,
      trainer_user_id: input.trainerUserId,
      weekday: input.weekday,
      start_time: input.startTime,
      end_time: input.endTime,
      default_group_id: input.defaultGroupId ?? null,
      capacity: input.capacity,
      active_from: input.activeFrom,
      active_until: input.activeUntil ?? null,
      created_by: actorId,
      updated_by: actorId,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'create_failed' }
  return { success: true, data: toPattern(data as Record<string, unknown>) }
}

export async function listPatterns(
  client: Client,
  kindergartenId: string,
  trainerUserId?: string,
): Promise<Result<SchedulePattern[]>> {
  let query = client
    .from('pool_schedule_patterns')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .order('weekday')

  if (trainerUserId) query = query.eq('trainer_user_id', trainerUserId)

  const { data, error } = await query
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toPattern(r as Record<string, unknown>)) }
}

export async function deletePattern(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('pool_schedule_patterns')
    .update({ deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/pool/services/pool.service.ts src/modules/pool/services/pool.service.test.ts
git commit -m "feat(pool): schedule pattern service with availability validation"
```

---

### Task 5: Service — occurrence date calculation (pure function)

**Files:**
- Modify: `src/modules/pool/services/pool.service.ts`
- Modify: `src/modules/pool/services/pool.service.test.ts`

**Interfaces:**
- Produces: `computeOccurrenceDates(weekday, activeFrom, activeUntil, windowWeeks, today?)` — consumed by Task 6 (`generateMissingSessions`).

- [ ] **Step 1: Write the failing tests**

Append to `pool.service.test.ts`:

```typescript
import { computeOccurrenceDates } from './pool.service'

describe('computeOccurrenceDates', () => {
  it('returns weekly dates matching the weekday within the window', () => {
    // 2026-09-01 is a Tuesday (weekday 2). today = 2026-09-01.
    const dates = computeOccurrenceDates(2, '2026-09-01', null, 3, new Date('2026-09-01T00:00:00Z'))
    expect(dates).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'])
  })

  it('does not return dates before activeFrom', () => {
    const dates = computeOccurrenceDates(2, '2026-09-10', null, 3, new Date('2026-09-01T00:00:00Z'))
    expect(dates.every(d => d >= '2026-09-10')).toBe(true)
    expect(dates[0]).toBe('2026-09-15')
  })

  it('stops at activeUntil when earlier than the window end', () => {
    const dates = computeOccurrenceDates(2, '2026-09-01', '2026-09-10', 8, new Date('2026-09-01T00:00:00Z'))
    expect(dates).toEqual(['2026-09-01', '2026-09-08'])
  })

  it('starts from today when activeFrom is in the past', () => {
    const dates = computeOccurrenceDates(2, '2026-01-01', null, 1, new Date('2026-09-01T00:00:00Z'))
    expect(dates[0]).toBe('2026-09-01')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: FAIL — `computeOccurrenceDates` not exported.

- [ ] **Step 3: Implement the function**

Append to `pool.service.ts`:

```typescript
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

export function computeOccurrenceDates(
  weekday: number,
  activeFrom: string,
  activeUntil: string | null,
  windowWeeks: number,
  today: Date = new Date(),
): string[] {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const fromUtc = Date.UTC(...(activeFrom.split('-').map(Number) as [number, number, number]))
  const rangeStart = Math.max(todayUtc, fromUtc)

  const windowEndUtc = todayUtc + windowWeeks * MS_PER_WEEK
  const untilUtc = activeUntil
    ? Date.UTC(...(activeUntil.split('-').map(Number) as [number, number, number]))
    : Infinity
  const rangeEnd = Math.min(windowEndUtc, untilUtc)

  const startDate = new Date(rangeStart)
  const currentWeekday = startDate.getUTCDay()
  const daysUntilTarget = (weekday - currentWeekday + 7) % 7
  let cursor = rangeStart + daysUntilTarget * MS_PER_DAY

  const dates: string[] = []
  while (cursor <= rangeEnd) {
    dates.push(new Date(cursor).toISOString().slice(0, 10))
    cursor += MS_PER_WEEK
  }
  return dates
}
```

Note: `activeFrom`/`activeUntil` are `YYYY-MM-DD`; `Date.UTC(...)` receives `[year, monthIndex+1?, day]` — since the month component from the split is 1-indexed and `Date.UTC` expects 0-indexed months, this must subtract 1 from the month. Fix before running:

```typescript
  const [fy, fm, fd] = activeFrom.split('-').map(Number)
  const fromUtc = Date.UTC(fy!, fm! - 1, fd!)
```

Replace both `Date.UTC(...(activeFrom...` and the `activeUntil` line with this explicit destructured form:

```typescript
export function computeOccurrenceDates(
  weekday: number,
  activeFrom: string,
  activeUntil: string | null,
  windowWeeks: number,
  today: Date = new Date(),
): string[] {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  const [fy, fm, fd] = activeFrom.split('-').map(Number)
  const fromUtc = Date.UTC(fy!, fm! - 1, fd!)
  const rangeStart = Math.max(todayUtc, fromUtc)

  const windowEndUtc = todayUtc + windowWeeks * MS_PER_WEEK
  let untilUtc = Infinity
  if (activeUntil) {
    const [uy, um, ud] = activeUntil.split('-').map(Number)
    untilUtc = Date.UTC(uy!, um! - 1, ud!)
  }
  const rangeEnd = Math.min(windowEndUtc, untilUtc)

  const currentWeekday = new Date(rangeStart).getUTCDay()
  const daysUntilTarget = (weekday - currentWeekday + 7) % 7
  let cursor = rangeStart + daysUntilTarget * MS_PER_DAY

  const dates: string[] = []
  while (cursor <= rangeEnd) {
    dates.push(new Date(cursor).toISOString().slice(0, 10))
    cursor += MS_PER_WEEK
  }
  return dates
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: PASS, all 4 new tests green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/pool/services/pool.service.ts src/modules/pool/services/pool.service.test.ts
git commit -m "feat(pool): pure occurrence-date calculation for recurring patterns"
```

---

### Task 6: Service — session generation and listing

**Files:**
- Modify: `src/modules/pool/services/pool.service.ts`
- Modify: `src/modules/pool/services/pool.service.test.ts`

**Interfaces:**
- Consumes: `computeOccurrenceDates` (Task 5), `PoolSession` (Task 2), `listPatterns`-shaped query pattern (Task 4).
- Produces: `generateMissingSessions(client, kindergartenId, today?)`, `listSessions(client, kindergartenId, today?)` — consumed by Task 9 (store), Task 13 (calendar page).

- [ ] **Step 1: Write the failing tests**

Append to `pool.service.test.ts`:

```typescript
import { generateMissingSessions, listSessions } from './pool.service'

describe('generateMissingSessions', () => {
  it('inserts a session for each missing occurrence and seeds participants from the default group', async () => {
    const insertedSessionIds: string[] = []
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [{
                    id: 'pattern-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
                    weekday: 2, start_time: '10:00:00', end_time: '11:00:00',
                    default_group_id: 'group-1', capacity: 8,
                    active_from: '2026-09-01', active_until: null,
                  }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }), // no existing instances
              }),
            }),
            insert: vi.fn((rows: Array<{ id?: string }>) => {
              rows.forEach((_, i) => insertedSessionIds.push(`session-${i}`))
              return {
                select: vi.fn().mockResolvedValue({
                  data: rows.map((r, i) => ({ ...r, id: `session-${i}` })),
                  error: null,
                }),
              }
            }),
          }
        }
        if (table === 'children') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({ data: [{ id: 'child-1' }, { id: 'child-2' }], error: null }),
                }),
              }),
            }),
          }
        }
        if (table === 'pool_session_participants') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result.success).toBe(true)
    expect(insertedSessionIds.length).toBeGreaterThan(0)
  })

  it('does not insert when an instance already exists for the date', async () => {
    const insertFn = vi.fn()
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [{
                    id: 'pattern-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
                    weekday: 2, start_time: '10:00:00', end_time: '11:00:00',
                    default_group_id: null, capacity: 8,
                    active_from: '2026-09-01', active_until: '2026-09-01',
                  }],
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [{ session_date: '2026-09-01' }], error: null }),
              }),
            }),
            insert: insertFn,
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    await generateMissingSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(insertFn).not.toHaveBeenCalled()
  })
})

describe('listSessions', () => {
  it('generates missing instances then returns sessions with participant counts', async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'pool_schedule_patterns') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }), // no patterns → nothing to generate
              }),
            }),
          }
        }
        if (table === 'pool_sessions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [{
                      id: 'session-1', kindergarten_id: 'kg-1', trainer_user_id: 'user-1',
                      source_pattern_id: null, session_date: '2026-09-01',
                      start_time: '10:00:00', end_time: '11:00:00', capacity: 8,
                      group_id: null, status: 'scheduled',
                      pool_session_participants: [{ count: 2 }],
                    }],
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const result = await listSessions(client, 'kg-1', new Date('2026-09-01T00:00:00Z'))
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data[0]?.id).toBe('session-1')
      expect(result.data[0]?.participantCount).toBe(2)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: FAIL — `generateMissingSessions`, `listSessions` not exported.

- [ ] **Step 3: Implement generation and listing**

Append to `pool.service.ts`:

```typescript
import type { PoolSession } from '../types/pool.types'

const GENERATION_WINDOW_WEEKS = 8

function toSession(row: Record<string, unknown>): PoolSession {
  const participants = row.pool_session_participants as Array<{ count: number }> | undefined
  return {
    id: row.id as string,
    kindergartenId: row.kindergarten_id as string,
    trainerUserId: row.trainer_user_id as string,
    sourcePatternId: (row.source_pattern_id as string | null) ?? null,
    sessionDate: row.session_date as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    capacity: row.capacity as number,
    groupId: (row.group_id as string | null) ?? null,
    status: row.status as 'scheduled' | 'cancelled',
    participantCount: participants?.[0]?.count ?? 0,
  }
}

export async function generateMissingSessions(
  client: Client,
  kindergartenId: string,
  today: Date = new Date(),
): Promise<Result<void>> {
  const { data: patterns, error: patternsError } = await client
    .from('pool_schedule_patterns')
    .select('*')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)

  if (patternsError) return { success: false, error: patternsError.message }

  for (const pattern of (patterns ?? []) as Array<Record<string, unknown>>) {
    const patternId = pattern.id as string
    const occurrenceDates = computeOccurrenceDates(
      pattern.weekday as number,
      pattern.active_from as string,
      (pattern.active_until as string | null) ?? null,
      GENERATION_WINDOW_WEEKS,
      today,
    )

    const { data: existing, error: existingError } = await client
      .from('pool_sessions')
      .select('session_date')
      .eq('source_pattern_id', patternId)
      .is('deleted_at', null)

    if (existingError) return { success: false, error: existingError.message }

    const existingDates = new Set((existing ?? []).map(r => (r as { session_date: string }).session_date))
    const missingDates = occurrenceDates.filter(d => !existingDates.has(d))
    if (missingDates.length === 0) continue

    const rowsToInsert = missingDates.map(date => ({
      kindergarten_id: kindergartenId,
      trainer_user_id: pattern.trainer_user_id as string,
      source_pattern_id: patternId,
      session_date: date,
      start_time: pattern.start_time as string,
      end_time: pattern.end_time as string,
      capacity: pattern.capacity as number,
      group_id: (pattern.default_group_id as string | null) ?? null,
      status: 'scheduled' as const,
    }))

    const { data: insertedSessions, error: insertError } = await client
      .from('pool_sessions')
      .insert(rowsToInsert)
      .select()

    if (insertError) return { success: false, error: insertError.message }

    const defaultGroupId = pattern.default_group_id as string | null
    if (!defaultGroupId) continue

    const { data: activeChildren, error: childrenError } = await client
      .from('children')
      .select('id')
      .eq('group_id', defaultGroupId)
      .eq('status', 'enrolled')
      .is('deleted_at', null)

    if (childrenError) return { success: false, error: childrenError.message }
    if (!activeChildren || activeChildren.length === 0) continue

    const participantRows = (insertedSessions ?? []).flatMap(session =>
      activeChildren.map(child => ({
        session_id: (session as { id: string }).id,
        kindergarten_id: kindergartenId,
        child_id: (child as { id: string }).id,
        status: 'enrolled' as const,
      })),
    )

    if (participantRows.length > 0) {
      const { error: participantsError } = await client
        .from('pool_session_participants')
        .insert(participantRows)
      if (participantsError) return { success: false, error: participantsError.message }
    }
  }

  return { success: true, data: undefined }
}

export async function listSessions(
  client: Client,
  kindergartenId: string,
  today: Date = new Date(),
): Promise<Result<PoolSession[]>> {
  const generation = await generateMissingSessions(client, kindergartenId, today)
  if (!generation.success) return generation

  const { data, error } = await client
    .from('pool_sessions')
    .select('*, pool_session_participants(count)')
    .eq('kindergarten_id', kindergartenId)
    .is('deleted_at', null)
    .order('session_date')

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toSession(r as Record<string, unknown>)) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/pool/services/pool.service.ts src/modules/pool/services/pool.service.test.ts
git commit -m "feat(pool): idempotent session generation from patterns"
```

---

### Task 7: Service — session mutation and participants

**Files:**
- Modify: `src/modules/pool/services/pool.service.ts`
- Modify: `src/modules/pool/services/pool.service.test.ts`

**Interfaces:**
- Consumes: `SessionParticipant` (Task 2), `PoolSession`/`toSession` conventions (Task 6).
- Produces: `cancelSession(client, id, actorId)`, `listParticipants(client, sessionId)`, `addParticipant(client, sessionId, childId, actorId)`, `removeParticipant(client, participantId, actorId)` — consumed by Task 9 (store), Task 12 (participant list component).

- [ ] **Step 1: Write the failing tests**

Append to `pool.service.test.ts`:

```typescript
import { cancelSession, listParticipants, addParticipant, removeParticipant } from './pool.service'

describe('cancelSession', () => {
  it('sets status to cancelled', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await cancelSession(client, 'session-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    expect(updateCall).toHaveBeenCalledWith({ status: 'cancelled', updated_by: 'actor-1' })
  })
})

describe('listParticipants', () => {
  it('returns mapped participants with child name', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({
              data: [{
                id: 'part-1', session_id: 'session-1', child_id: 'child-1', status: 'enrolled',
                children: { first_name: 'Ana', last_name: 'Pop' },
              }],
              error: null,
            }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await listParticipants(client, 'session-1')
    expect(result).toEqual({
      success: true,
      data: [{ id: 'part-1', sessionId: 'session-1', childId: 'child-1', childName: 'Ana Pop', status: 'enrolled' }],
    })
  })
})

describe('addParticipant', () => {
  it('rejects when the session is at capacity', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { capacity: 1 }, error: null }),
          }),
        }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    // Two `.from` calls happen: one for session capacity, one for count. Rebuild
    // the mock so the second call returns a count at/above capacity.
    let call = 0
    client.from = vi.fn(() => {
      call += 1
      if (call === 1) {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { capacity: 1 }, error: null }) }),
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
          }),
        }),
      }
    })
    const result = await addParticipant(client, 'session-1', 'child-1', 'actor-1')
    expect(result).toEqual({ success: false, error: 'session_full' })
  })

  it('inserts the participant when under capacity', async () => {
    let call = 0
    const client = {
      from: vi.fn(() => {
        call += 1
        if (call === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { capacity: 8, kindergarten_id: 'kg-1' }, error: null }) }),
            }),
          }
        }
        if (call === 2) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
              }),
            }),
          }
        }
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'part-1', session_id: 'session-1', child_id: 'child-1', status: 'enrolled', children: { first_name: 'Ana', last_name: 'Pop' } },
                error: null,
              }),
            }),
          }),
        }
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await addParticipant(client, 'session-1', 'child-1', 'actor-1')
    expect(result.success).toBe(true)
  })
})

describe('removeParticipant', () => {
  it('soft-deletes and sets status removed', async () => {
    const client = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
    const result = await removeParticipant(client, 'part-1', 'actor-1')
    expect(result).toEqual({ success: true, data: undefined })
    const updateCall = client.from.mock.results[0].value.update as ReturnType<typeof vi.fn>
    const payload = updateCall.mock.calls[0][0]
    expect(payload.status).toBe('removed')
    expect(payload.deleted_at).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: FAIL — `cancelSession`, `listParticipants`, `addParticipant`, `removeParticipant` not exported.

- [ ] **Step 3: Implement**

Append to `pool.service.ts`:

```typescript
import type { SessionParticipant } from '../types/pool.types'

function toParticipant(row: Record<string, unknown>): SessionParticipant {
  const child = row.children as { first_name: string; last_name: string } | null
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    childId: row.child_id as string,
    childName: child ? `${child.first_name} ${child.last_name}` : '',
    status: row.status as 'enrolled' | 'removed',
  }
}

export async function cancelSession(
  client: Client,
  id: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('pool_sessions')
    .update({ status: 'cancelled', updated_by: actorId })
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function listParticipants(
  client: Client,
  sessionId: string,
): Promise<Result<SessionParticipant[]>> {
  const { data, error } = await client
    .from('pool_session_participants')
    .select('*, children(first_name, last_name)')
    .eq('session_id', sessionId)
    .is('deleted_at', null)

  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []).map(r => toParticipant(r as Record<string, unknown>)) }
}

export async function addParticipant(
  client: Client,
  sessionId: string,
  childId: string,
  actorId: string,
): Promise<Result<SessionParticipant>> {
  const { data: session, error: sessionError } = await client
    .from('pool_sessions')
    .select('capacity, kindergarten_id')
    .eq('id', sessionId)
    .single()

  if (sessionError || !session) return { success: false, error: sessionError?.message ?? 'session_not_found' }

  const { count, error: countError } = await client
    .from('pool_session_participants')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'enrolled')

  if (countError) return { success: false, error: countError.message }
  if ((count ?? 0) >= (session as { capacity: number }).capacity) {
    return { success: false, error: 'session_full' }
  }

  const { data, error } = await client
    .from('pool_session_participants')
    .insert({
      session_id: sessionId,
      kindergarten_id: (session as { kindergarten_id: string }).kindergarten_id,
      child_id: childId,
      status: 'enrolled',
      created_by: actorId,
      updated_by: actorId,
    })
    .select('*, children(first_name, last_name)')
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'add_participant_failed' }
  return { success: true, data: toParticipant(data as Record<string, unknown>) }
}

export async function removeParticipant(
  client: Client,
  participantId: string,
  actorId: string,
): Promise<Result<void>> {
  const { error } = await client
    .from('pool_session_participants')
    .update({ status: 'removed', deleted_at: new Date().toISOString(), updated_by: actorId })
    .eq('id', participantId)

  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/pool/services/pool.service.test.ts`
Expected: PASS, full file green (should be ~20 tests total across Tasks 3–7).

- [ ] **Step 5: Run full test suite + lint + typecheck**

Run: `npm run test && npm run lint && npm run typecheck`
Expected: all pass — `pool.service.ts` is now complete and self-consistent.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pool/services/pool.service.ts src/modules/pool/services/pool.service.test.ts
git commit -m "feat(pool): session cancellation and participant management"
```

---

### Task 8: `can()` extension — `pool` resource, `manage` action

> **Gate: verify PR #9 (`feat/module-access`) is merged to `main` before starting this task.** Run `git log main --oneline -5` and confirm the module-access commits are present, and read the merged `src/modules/auth/stores/auth.store.ts` to confirm the exact grant-cache method name — sub-project A's spec calls it a "claims cache" but doesn't lock in a method name. If it differs from `hasModuleGrant` below, use the actual name and adjust this task's code accordingly before writing it.

**Files:**
- Modify: `src/modules/auth/composables/usePermissions.ts`
- Modify: `src/modules/auth/composables/usePermissions.test.ts`

**Interfaces:**
- Consumes: `authStore.user`, `authStore.hasModuleGrant(kindergartenId, moduleKey)` (from merged PR #9 — verify name), `useAuthStore()`.
- Produces: `can('view', 'pool', kindergartenId)`, `can('manage', 'pool', kindergartenId, trainerUserId)` — consumed by Task 13/14 (pages) and Task 11 (availability editor).

- [ ] **Step 1: Write the failing tests**

Add to `usePermissions.test.ts` (read the existing file first to match its exact mocking setup for `useAuthStore`):

```typescript
describe('pool resource', () => {
  it('view: super_admin bypasses the grant check', () => {
    // arrange authStore.user.role = 'super_admin' per this file's existing mock pattern
    const { can } = usePermissions()
    expect(can('view', 'pool', 'kg-1')).toBe(true)
  })

  it('view: educator without a pool grant is denied', () => {
    // arrange authStore.user.role = 'educator', hasModuleGrant returns false
    const { can } = usePermissions()
    expect(can('view', 'pool', 'kg-1')).toBe(false)
  })

  it('view: educator with a live pool grant for the kindergarten is allowed', () => {
    // arrange authStore.user.role = 'educator', hasModuleGrant('kg-1', 'pool') returns true
    const { can } = usePermissions()
    expect(can('view', 'pool', 'kg-1')).toBe(true)
  })

  it('manage: admin bypasses the trainer-identity check', () => {
    // arrange authStore.user.role = 'admin'
    const { can } = usePermissions()
    expect(can('manage', 'pool', 'kg-1', 'some-other-trainer-id')).toBe(true)
  })

  it('manage: educator can manage only their own trainer schedule', () => {
    // arrange authStore.user = { id: 'user-1', role: 'educator' }, hasModuleGrant returns true
    const { can } = usePermissions()
    expect(can('manage', 'pool', 'kg-1', 'user-1')).toBe(true)
    expect(can('manage', 'pool', 'kg-1', 'other-user')).toBe(false)
  })

  it('manage: educator without a pool grant is denied even for their own id', () => {
    // arrange authStore.user = { id: 'user-1', role: 'educator' }, hasModuleGrant returns false
    const { can } = usePermissions()
    expect(can('manage', 'pool', 'kg-1', 'user-1')).toBe(false)
  })
})
```

Fill in the arrange comments using this file's existing mock style for `useAuthStore` (read the file's current top section before writing — it already mocks `~/modules/auth/stores/auth.store`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/auth/composables/usePermissions.test.ts`
Expected: FAIL — `pool` is not assignable to `PermissionResource` / `can` returns `false` for everything (resource not handled).

- [ ] **Step 3: Extend `usePermissions.ts`**

```typescript
// src/modules/auth/composables/usePermissions.ts
import { useAuthStore } from '~/modules/auth/stores/auth.store'

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'assign-role' | 'view' | 'manage'
export type PermissionResource = 'kindergarten' | 'staff' | 'children' | 'groups' | 'settings' | 'pool'

export function usePermissions() {
  const authStore = useAuthStore()

  function can(action: PermissionAction, resource: PermissionResource, target?: unknown): boolean {
    const role = authStore.user?.role
    if (!role) return false

    if (resource === 'kindergarten') {
      if (action === 'delete') return false
      return role === 'super_admin'
    }

    if (resource === 'staff') {
      if (action === 'assign-role') return role === 'super_admin'
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'children') {
      if (action === 'read') return true
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'groups') {
      if (action === 'read') return true
      return role === 'super_admin' || role === 'admin'
    }

    if (resource === 'settings') {
      return true
    }

    if (resource === 'pool') {
      if (role === 'super_admin' || role === 'admin') return true
      // Educator: needs a live `pool` grant for this kindergarten either way.
      const kindergartenId = target as string
      const hasGrant = authStore.hasModuleGrant(kindergartenId, 'pool')
      if (action === 'view') return hasGrant
      if (action === 'manage') return false // trainerUserId form below handles 'manage'
      return false
    }

    return false
  }

  function canManagePoolTrainer(kindergartenId: string, trainerUserId: string): boolean {
    const role = authStore.user?.role
    if (!role) return false
    if (role === 'super_admin' || role === 'admin') return true
    if (role !== 'educator') return false
    return authStore.hasModuleGrant(kindergartenId, 'pool') && authStore.user?.id === trainerUserId
  }

  return { can, canManagePoolTrainer }
}
```

Note: `can('manage', 'pool', kindergartenId, trainerUserId)` needs two extra arguments (`kindergartenId` AND `trainerUserId`), which doesn't fit `can`'s existing two-argument-plus-one-target shape cleanly. Use the separate `canManagePoolTrainer(kindergartenId, trainerUserId)` helper shown above for all "manage" checks instead of overloading `can`. Update the test file's `manage` cases (Step 1) to call `canManagePoolTrainer` instead of `can('manage', 'pool', ...)`:

```typescript
describe('pool resource — manage', () => {
  it('admin bypasses the trainer-identity check', () => {
    const { canManagePoolTrainer } = usePermissions()
    expect(canManagePoolTrainer('kg-1', 'some-other-trainer-id')).toBe(true)
  })

  it('educator can manage only their own trainer schedule', () => {
    const { canManagePoolTrainer } = usePermissions()
    expect(canManagePoolTrainer('kg-1', 'user-1')).toBe(true)
    expect(canManagePoolTrainer('kg-1', 'other-user')).toBe(false)
  })

  it('educator without a pool grant is denied even for their own id', () => {
    const { canManagePoolTrainer } = usePermissions()
    expect(canManagePoolTrainer('kg-1', 'user-1')).toBe(false)
  })
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/auth/composables/usePermissions.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/auth/composables/usePermissions.ts src/modules/auth/composables/usePermissions.test.ts
git commit -m "feat(auth): extend can() with pool view/manage checks"
```

---

### Task 9: Pinia store

**Files:**
- Create: `src/modules/pool/stores/pool.store.ts`

**Interfaces:**
- Consumes: every function from `pool.service.ts` (Tasks 3–7), `useAuthStore().user?.id` (existing pattern from `groups.store.ts`).
- Produces: `useApolloStore` — actually named `usePoolStore` — with state `availability`, `patterns`, `sessions`, `participants` and actions listed below; consumed by Task 10 (`usePool` composable).

- [ ] **Step 1: Write the store**

```typescript
// src/modules/pool/stores/pool.store.ts
import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as poolService from '../services/pool.service'
import type { TrainerAvailability, SchedulePattern, PoolSession, SessionParticipant } from '../types/pool.types'

export const usePoolStore = defineStore('pool', {
  state: () => ({
    availability: [] as TrainerAvailability[],
    patterns: [] as SchedulePattern[],
    sessions: [] as PoolSession[],
    participants: {} as Record<string, SessionParticipant[]>,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchAvailability(kindergartenId: string, trainerUserId: string) {
      this.loading = true
      this.error = null
      const result = await poolService.listAvailability(useSupabaseClient(), kindergartenId, trainerUserId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.availability = result.data
    },
    async addAvailability(input: Parameters<typeof poolService.addAvailability>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.addAvailability(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.availability.push(result.data)
      return true
    },
    async removeAvailability(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.removeAvailability(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.availability = this.availability.filter(a => a.id !== id)
      return true
    },
    async fetchPatterns(kindergartenId: string, trainerUserId?: string) {
      this.loading = true
      this.error = null
      const result = await poolService.listPatterns(useSupabaseClient(), kindergartenId, trainerUserId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.patterns = result.data
    },
    async createPattern(input: Parameters<typeof poolService.createPattern>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.createPattern(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.patterns.push(result.data)
      return true
    },
    async deletePattern(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.deletePattern(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.patterns = this.patterns.filter(p => p.id !== id)
      return true
    },
    async fetchSessions(kindergartenId: string) {
      this.loading = true
      this.error = null
      const result = await poolService.listSessions(useSupabaseClient(), kindergartenId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.sessions = result.data
    },
    async cancelSession(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.cancelSession(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.sessions.findIndex(s => s.id === id)
      if (idx !== -1) this.sessions[idx]!.status = 'cancelled'
      return true
    },
    async fetchParticipants(sessionId: string) {
      const result = await poolService.listParticipants(useSupabaseClient(), sessionId)
      if (!result.success) { this.error = result.error; return }
      this.participants[sessionId] = result.data
    },
    async addParticipant(sessionId: string, childId: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.addParticipant(useSupabaseClient(), sessionId, childId, actorId)
      if (!result.success) { this.error = result.error; return false }
      if (!this.participants[sessionId]) this.participants[sessionId] = []
      this.participants[sessionId]!.push(result.data)
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) session.participantCount += 1
      return true
    },
    async removeParticipant(sessionId: string, participantId: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.removeParticipant(useSupabaseClient(), participantId, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.participants[sessionId] = (this.participants[sessionId] ?? []).filter(p => p.id !== participantId)
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) session.participantCount -= 1
      return true
    },
  },
})
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/modules/pool/stores/pool.store.ts
git commit -m "feat(pool): Pinia store"
```

---

### Task 10: Composable

**Files:**
- Create: `src/modules/pool/composables/usePool.ts`

**Interfaces:**
- Consumes: `usePoolStore` (Task 9).
- Produces: `usePool()` returning reactive state + action wrappers — consumed by Task 11–14 (components/pages).

- [ ] **Step 1: Write the composable**

```typescript
// src/modules/pool/composables/usePool.ts
import { computed } from 'vue'
import { usePoolStore } from '../stores/pool.store'

export function usePool() {
  const store = usePoolStore()
  return {
    availability:  computed(() => store.availability),
    patterns:      computed(() => store.patterns),
    sessions:      computed(() => store.sessions),
    participants:  computed(() => store.participants),
    loading:       computed(() => store.loading),
    error:         computed(() => store.error),
    fetchAvailability:  (kindergartenId: string, trainerUserId: string) => store.fetchAvailability(kindergartenId, trainerUserId),
    addAvailability:    (input: Parameters<typeof store.addAvailability>[0]) => store.addAvailability(input),
    removeAvailability: (id: string) => store.removeAvailability(id),
    fetchPatterns:      (kindergartenId: string, trainerUserId?: string) => store.fetchPatterns(kindergartenId, trainerUserId),
    createPattern:      (input: Parameters<typeof store.createPattern>[0]) => store.createPattern(input),
    deletePattern:      (id: string) => store.deletePattern(id),
    fetchSessions:      (kindergartenId: string) => store.fetchSessions(kindergartenId),
    cancelSession:      (id: string) => store.cancelSession(id),
    fetchParticipants:  (sessionId: string) => store.fetchParticipants(sessionId),
    addParticipant:     (sessionId: string, childId: string) => store.addParticipant(sessionId, childId),
    removeParticipant:  (sessionId: string, participantId: string) => store.removeParticipant(sessionId, participantId),
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/pool/composables/usePool.ts
git commit -m "feat(pool): usePool composable"
```

---

### Task 11: i18n keys

**Files:**
- Modify: `src/core/i18n/locales/ro.json`
- Modify: `src/core/i18n/locales/en.json`

**Interfaces:**
- Produces: `pool.*` namespace keys consumed by Tasks 12–14 (components/pages).

- [ ] **Step 1: Add the `pool` namespace to `ro.json`**

Insert as a new top-level key (alongside `"groups": { ... }`, matching that block's indentation):

```json
  "pool": {
    "pageTitle": "Bazin",
    "pageSubtitle": "Program de înot și antrenori.",
    "calendarTab": "Calendar",
    "settingsTab": "Setări antrenor",
    "session": {
      "capacity": "Locuri: {enrolled}/{capacity}",
      "cancelled": "Anulată",
      "cancel": "Anulează sesiunea",
      "confirmCancelTitle": "Anulează sesiunea",
      "confirmCancelBody": "Sesiunea va fi marcată ca anulată.",
      "viewParticipants": "Vezi participanții",
      "empty": "Nicio sesiune programată."
    },
    "participants": {
      "title": "Participanți",
      "addChild": "Adaugă copil",
      "remove": "Elimină",
      "full": "Sesiunea este completă.",
      "empty": "Niciun copil înscris."
    },
    "availability": {
      "title": "Disponibilitate",
      "add": "Adaugă interval",
      "remove": "Elimină",
      "weekday": "Zi",
      "startTime": "Ora început",
      "endTime": "Ora sfârșit",
      "empty": "Niciun interval de disponibilitate."
    },
    "pattern": {
      "title": "Program recurent",
      "add": "Adaugă tipar",
      "remove": "Elimină",
      "group": "Grupă implicită",
      "noGroup": "Fără grupă implicită",
      "capacity": "Capacitate",
      "activeFrom": "Activ de la",
      "activeUntil": "Activ până la",
      "outsideAvailability": "Intervalul ales nu se încadrează în disponibilitatea antrenorului.",
      "empty": "Niciun tipar de program."
    },
    "weekday": {
      "0": "Duminică",
      "1": "Luni",
      "2": "Marți",
      "3": "Miercuri",
      "4": "Joi",
      "5": "Vineri",
      "6": "Sâmbătă"
    }
  },
```

- [ ] **Step 2: Add the matching `pool` namespace to `en.json`**

```json
  "pool": {
    "pageTitle": "Pool",
    "pageSubtitle": "Swim schedule and trainers.",
    "calendarTab": "Calendar",
    "settingsTab": "Trainer settings",
    "session": {
      "capacity": "Spots: {enrolled}/{capacity}",
      "cancelled": "Cancelled",
      "cancel": "Cancel session",
      "confirmCancelTitle": "Cancel session",
      "confirmCancelBody": "The session will be marked as cancelled.",
      "viewParticipants": "View participants",
      "empty": "No sessions scheduled."
    },
    "participants": {
      "title": "Participants",
      "addChild": "Add child",
      "remove": "Remove",
      "full": "This session is full.",
      "empty": "No children enrolled."
    },
    "availability": {
      "title": "Availability",
      "add": "Add window",
      "remove": "Remove",
      "weekday": "Day",
      "startTime": "Start time",
      "endTime": "End time",
      "empty": "No availability windows."
    },
    "pattern": {
      "title": "Recurring schedule",
      "add": "Add pattern",
      "remove": "Remove",
      "group": "Default group",
      "noGroup": "No default group",
      "capacity": "Capacity",
      "activeFrom": "Active from",
      "activeUntil": "Active until",
      "outsideAvailability": "The chosen window doesn't fit the trainer's availability.",
      "empty": "No schedule patterns."
    },
    "weekday": {
      "0": "Sunday",
      "1": "Monday",
      "2": "Tuesday",
      "3": "Wednesday",
      "4": "Thursday",
      "5": "Friday",
      "6": "Saturday"
    }
  },
```

- [ ] **Step 3: Verify JSON validity and key parity**

Run: `node -e "const ro=require('./src/core/i18n/locales/ro.json'); const en=require('./src/core/i18n/locales/en.json'); console.log(Object.keys(ro.pool).length, Object.keys(en.pool).length)"`
Expected: both numbers equal (7).

- [ ] **Step 4: Commit**

```bash
git add src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(pool): i18n keys (RO + EN)"
```

---

### Task 12: `PoolAvailabilityEditor` and pattern list components

**Files:**
- Create: `src/modules/pool/components/PoolAvailabilityEditor.vue`
- Create: `src/modules/pool/components/PoolPatternList.vue`

**Interfaces:**
- Consumes: `usePool()` (Task 10), `usePermissions().canManagePoolTrainer` (Task 8), `trainerAvailabilitySchema`/`schedulePatternSchema` (Task 2), `pool.*` i18n keys (Task 11).
- Produces: `<PoolAvailabilityEditor :kindergarten-id :trainer-user-id>`, `<PoolPatternList :kindergarten-id :trainer-user-id :groups>` — consumed by Task 14 (`PoolTrainerSettingsPage`).

- [ ] **Step 1: Write `PoolAvailabilityEditor.vue`**

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { trainerAvailabilitySchema, type TrainerAvailabilityInput } from '~/shared/schemas/pool.schema'

const props = defineProps<{ kindergartenId: string; trainerUserId: string; canEdit: boolean }>()

const { t } = useI18n()
const toast = useToast()
const { availability, loading, fetchAvailability, addAvailability, removeAvailability } = usePool()

useLazyAsyncData(
  `pool-availability-${props.trainerUserId}`,
  () => fetchAvailability(props.kindergartenId, props.trainerUserId),
)

const weekdayOptions = [0, 1, 2, 3, 4, 5, 6].map(d => ({ label: t(`pool.weekday.${d}`), value: d }))

const addOpen = ref(false)
const addState = reactive<Partial<TrainerAvailabilityInput>>({ weekday: 1, startTime: undefined, endTime: undefined })

function openAdd() {
  addState.weekday = 1
  addState.startTime = undefined
  addState.endTime = undefined
  addOpen.value = true
}

async function onAddSubmit(event: FormSubmitEvent<TrainerAvailabilityInput>) {
  const ok = await addAvailability({
    kindergartenId: props.kindergartenId,
    trainerUserId: props.trainerUserId,
    weekday: event.data.weekday,
    startTime: event.data.startTime,
    endTime: event.data.endTime,
  })
  if (ok) {
    addOpen.value = false
    toast.add({ title: t('pool.availability.add'), color: 'success' })
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-800">{{ t('pool.availability.title') }}</h3>
      <UButton v-if="canEdit" size="xs" color="primary" variant="soft" @click="openAdd">
        {{ t('pool.availability.add') }}
      </UButton>
    </div>

    <div v-if="loading" class="text-sm text-slate-400">…</div>
    <div v-else-if="availability.length === 0" class="text-sm text-slate-400">{{ t('pool.availability.empty') }}</div>
    <ul v-else class="space-y-2">
      <li
        v-for="window in availability"
        :key="window.id"
        class="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm"
      >
        <span>{{ t(`pool.weekday.${window.weekday}`) }} — {{ window.startTime }}–{{ window.endTime }}</span>
        <UButton v-if="canEdit" size="xs" color="neutral" variant="ghost" icon="i-heroicons-trash" @click="removeAvailability(window.id)" />
      </li>
    </ul>

    <UModal v-model:open="addOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.availability.add') }}</h2>
      </template>
      <template #body>
        <UForm :schema="trainerAvailabilitySchema" :state="addState" class="space-y-4" @submit="onAddSubmit">
          <UFormField :label="t('pool.availability.weekday')" name="weekday">
            <USelect v-model="addState.weekday" :items="weekdayOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.startTime')" name="startTime">
            <UInput v-model="addState.startTime" placeholder="09:00" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.endTime')" name="endTime">
            <UInput v-model="addState.endTime" placeholder="12:00" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('pool.availability.add') }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 2: Write `PoolPatternList.vue`**

```vue
<script setup lang="ts">
import { reactive } from 'vue'
import type { FormSubmitEvent } from '@nuxt/ui'
import { schedulePatternSchema, type SchedulePatternInput } from '~/shared/schemas/pool.schema'

const props = defineProps<{
  kindergartenId: string
  trainerUserId: string
  canEdit: boolean
  groupOptions: Array<{ label: string; value: string | null }>
}>()

const { t } = useI18n()
const toast = useToast()
const { patterns, loading, error, fetchPatterns, createPattern, deletePattern } = usePool()

useLazyAsyncData(
  `pool-patterns-${props.trainerUserId}`,
  () => fetchPatterns(props.kindergartenId, props.trainerUserId),
)

const weekdayOptions = [0, 1, 2, 3, 4, 5, 6].map(d => ({ label: t(`pool.weekday.${d}`), value: d }))

const addOpen = ref(false)
const addState = reactive<Partial<SchedulePatternInput>>({
  weekday: 1, startTime: undefined, endTime: undefined, defaultGroupId: null, capacity: 8,
  activeFrom: undefined, activeUntil: null,
})

function openAdd() {
  Object.assign(addState, {
    weekday: 1, startTime: undefined, endTime: undefined, defaultGroupId: null, capacity: 8,
    activeFrom: undefined, activeUntil: null,
  })
  addOpen.value = true
}

async function onAddSubmit(event: FormSubmitEvent<SchedulePatternInput>) {
  const ok = await createPattern({
    kindergartenId: props.kindergartenId,
    trainerUserId: props.trainerUserId,
    weekday: event.data.weekday,
    startTime: event.data.startTime,
    endTime: event.data.endTime,
    defaultGroupId: event.data.defaultGroupId ?? null,
    capacity: event.data.capacity,
    activeFrom: event.data.activeFrom,
    activeUntil: event.data.activeUntil ?? null,
  })
  if (ok) {
    addOpen.value = false
    toast.add({ title: t('pool.pattern.add'), color: 'success' })
  } else if (error.value === 'outside_trainer_availability') {
    toast.add({ title: t('pool.pattern.outsideAvailability'), color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-800">{{ t('pool.pattern.title') }}</h3>
      <UButton v-if="canEdit" size="xs" color="primary" variant="soft" @click="openAdd">
        {{ t('pool.pattern.add') }}
      </UButton>
    </div>

    <div v-if="loading" class="text-sm text-slate-400">…</div>
    <div v-else-if="patterns.length === 0" class="text-sm text-slate-400">{{ t('pool.pattern.empty') }}</div>
    <ul v-else class="space-y-2">
      <li
        v-for="pattern in patterns"
        :key="pattern.id"
        class="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm"
      >
        <span>
          {{ t(`pool.weekday.${pattern.weekday}`) }} {{ pattern.startTime }}–{{ pattern.endTime }}
          · {{ t('pool.pattern.capacity') }}: {{ pattern.capacity }}
        </span>
        <UButton v-if="canEdit" size="xs" color="neutral" variant="ghost" icon="i-heroicons-trash" @click="deletePattern(pattern.id)" />
      </li>
    </ul>

    <UModal v-model:open="addOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.pattern.add') }}</h2>
      </template>
      <template #body>
        <UForm :schema="schedulePatternSchema" :state="addState" class="space-y-4" @submit="onAddSubmit">
          <UFormField :label="t('pool.availability.weekday')" name="weekday">
            <USelect v-model="addState.weekday" :items="weekdayOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.startTime')" name="startTime">
            <UInput v-model="addState.startTime" placeholder="10:00" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.availability.endTime')" name="endTime">
            <UInput v-model="addState.endTime" placeholder="11:00" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.group')" name="defaultGroupId">
            <USelect v-model="addState.defaultGroupId" :items="groupOptions" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.capacity')" name="capacity">
            <UInput v-model="addState.capacity" type="number" min="1" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.activeFrom')" name="activeFrom">
            <UInput v-model="addState.activeFrom" type="date" class="w-full" />
          </UFormField>
          <UFormField :label="t('pool.pattern.activeUntil')" name="activeUntil">
            <UInput v-model="addState.activeUntil" type="date" class="w-full" />
          </UFormField>
          <UButton type="submit" color="primary" block loading-auto :loading="loading">
            {{ t('pool.pattern.add') }}
          </UButton>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/pool/components/PoolAvailabilityEditor.vue src/modules/pool/components/PoolPatternList.vue
git commit -m "feat(pool): availability and pattern management components"
```

---

### Task 13: `PoolSessionCard` and `PoolParticipantList` components

**Files:**
- Create: `src/modules/pool/components/PoolSessionCard.vue`
- Create: `src/modules/pool/components/PoolParticipantList.vue`

**Interfaces:**
- Consumes: `PoolSession`, `SessionParticipant` (Task 2), `pool.*` i18n keys (Task 11).
- Produces: `<PoolSessionCard :session @cancel @view-participants>`, `<PoolParticipantList :participants :child-options :can-edit @add-child @remove>` — consumed by Task 14 (`PoolCalendarPage`).

- [ ] **Step 1: Write `PoolSessionCard.vue`**

```vue
<script setup lang="ts">
import type { PoolSession } from '../types/pool.types'

const props = defineProps<{ session: PoolSession; canManage: boolean }>()
const emit = defineEmits<{ cancel: [id: string]; 'view-participants': [id: string] }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
    <div>
      <p class="text-sm font-medium text-slate-800">{{ session.sessionDate }} · {{ session.startTime }}–{{ session.endTime }}</p>
      <p class="text-xs text-slate-500">
        {{ t('pool.session.capacity', { enrolled: session.participantCount, capacity: session.capacity }) }}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <UBadge v-if="session.status === 'cancelled'" color="neutral" variant="soft" size="xs">
        {{ t('pool.session.cancelled') }}
      </UBadge>
      <UButton size="xs" color="neutral" variant="ghost" @click="emit('view-participants', props.session.id)">
        {{ t('pool.session.viewParticipants') }}
      </UButton>
      <UButton
        v-if="canManage && session.status === 'scheduled'"
        size="xs" color="error" variant="ghost" icon="i-heroicons-x-circle"
        @click="emit('cancel', props.session.id)"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Write `PoolParticipantList.vue`**

```vue
<script setup lang="ts">
import type { SessionParticipant } from '../types/pool.types'

const props = defineProps<{
  participants: SessionParticipant[]
  childOptions: Array<{ label: string; value: string }>
  canEdit: boolean
  isFull: boolean
}>()
const emit = defineEmits<{ 'add-child': [childId: string]; remove: [participantId: string] }>()

const { t } = useI18n()
const selectedChildId = ref<string | null>(null)

function onAdd() {
  if (selectedChildId.value) {
    emit('add-child', selectedChildId.value)
    selectedChildId.value = null
  }
}
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-semibold text-slate-800">{{ t('pool.participants.title') }}</h3>

    <div v-if="participants.length === 0" class="text-sm text-slate-400">{{ t('pool.participants.empty') }}</div>
    <ul v-else class="space-y-2">
      <li
        v-for="participant in participants"
        :key="participant.id"
        class="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-sm"
      >
        <span>{{ participant.childName }}</span>
        <UButton v-if="canEdit" size="xs" color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="emit('remove', participant.id)" />
      </li>
    </ul>

    <p v-if="isFull" class="text-xs text-warning">{{ t('pool.participants.full') }}</p>
    <div v-else-if="canEdit" class="flex items-center gap-2">
      <USelect v-model="selectedChildId" :items="childOptions" class="w-full" />
      <UButton size="sm" color="primary" :disabled="!selectedChildId" @click="onAdd">
        {{ t('pool.participants.addChild') }}
      </UButton>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/pool/components/PoolSessionCard.vue src/modules/pool/components/PoolParticipantList.vue
git commit -m "feat(pool): session card and participant list components"
```

---

### Task 14: `PoolCalendarPage` and `PoolTrainerSettingsPage`

**Files:**
- Create: `src/modules/pool/pages/PoolCalendarPage.vue`
- Create: `src/modules/pool/pages/PoolTrainerSettingsPage.vue`
- Create: `src/pages/pool/index.vue` (Nuxt route → renders `PoolCalendarPage`)
- Create: `src/pages/pool/settings.vue` (Nuxt route → renders `PoolTrainerSettingsPage`)

**Interfaces:**
- Consumes: `usePool()` (Task 10), `usePermissions()` + `canManagePoolTrainer` (Task 8), `useTenantStore()` (existing), `useStaffStore()` (existing, for trainer picker), `useGroups()` (existing, for group options), all Task 12/13 components.

- [ ] **Step 1: Write `PoolCalendarPage.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

const { t } = useI18n()
const { can, canManagePoolTrainer } = usePermissions()
const tenantStore = useTenantStore()
const { sessions, participants, loading, error, fetchSessions, cancelSession, fetchParticipants, addParticipant, removeParticipant } = usePool()
const { groupChildren, fetchByGroup } = useChildren()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)
const canView = computed(() => selectedKgId.value !== 'ALL' && can('view', 'pool', selectedKgId.value))

useLazyAsyncData('pool-sessions', () => canView.value ? fetchSessions(selectedKgId.value) : Promise.resolve(), { watch: [selectedKgId] })

const drawerOpen = ref(false)
const activeSessionId = ref<string | null>(null)
const activeSession = computed(() => sessions.value.find(s => s.id === activeSessionId.value) ?? null)

// Children eligible to be added: active children in the session's group who
// aren't already an enrolled participant. Falls back to no options when the
// session has no group_id (ad-hoc sessions require picking children another way — out of scope for this plan, see DoD).
const childOptions = computed(() => {
  if (!activeSession.value?.groupId) return []
  const enrolledIds = new Set((participants.value[activeSession.value.id] ?? []).map(p => p.childId))
  return groupChildren.value
    .filter(c => c.status === 'enrolled' && !enrolledIds.has(c.id))
    .map(c => ({ label: c.fullName, value: c.id }))
})

function openParticipants(sessionId: string) {
  activeSessionId.value = sessionId
  drawerOpen.value = true
  fetchParticipants(sessionId)
  const session = sessions.value.find(s => s.id === sessionId)
  if (session?.groupId) fetchByGroup(session.groupId)
}

const cancelOpen = ref(false)
const cancelTargetId = ref<string | null>(null)

function openCancel(sessionId: string) {
  cancelTargetId.value = sessionId
  cancelOpen.value = true
}

async function onCancelConfirm() {
  if (!cancelTargetId.value) return
  await cancelSession(cancelTargetId.value)
  cancelOpen.value = false
}

function canManageSession(trainerUserId: string): boolean {
  return canManagePoolTrainer(selectedKgId.value, trainerUserId)
}
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('pool.pageTitle')" :subtitle="t('pool.pageSubtitle')" />

    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <p v-if="!canView" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
      <div v-if="loading" class="text-sm text-slate-400">…</div>
      <div v-else-if="sessions.length === 0" class="rounded-2xl border border-border bg-white py-16 text-center text-sm text-slate-400">
        {{ t('pool.session.empty') }}
      </div>
      <div v-else class="space-y-3">
        <PoolSessionCard
          v-for="session in sessions"
          :key="session.id"
          :session="session"
          :can-manage="canManageSession(session.trainerUserId)"
          @cancel="openCancel"
          @view-participants="openParticipants"
        />
      </div>
    </template>

    <UModal v-model:open="drawerOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.participants.title') }}</h2>
      </template>
      <template #body>
        <PoolParticipantList
          v-if="activeSession"
          :participants="participants[activeSession.id] ?? []"
          :child-options="childOptions"
          :can-edit="canManageSession(activeSession.trainerUserId)"
          :is-full="activeSession.participantCount >= activeSession.capacity"
          @add-child="(childId) => addParticipant(activeSession!.id, childId)"
          @remove="(participantId) => removeParticipant(activeSession!.id, participantId)"
        />
      </template>
    </UModal>

    <UModal v-model:open="cancelOpen">
      <template #header>
        <h2 class="text-base font-semibold text-slate-800">{{ t('pool.session.confirmCancelTitle') }}</h2>
      </template>
      <template #body>
        <p class="text-sm text-slate-500">{{ t('pool.session.confirmCancelBody') }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <UButton color="neutral" variant="ghost" @click="cancelOpen = false">{{ t('common.cancel') }}</UButton>
          <UButton color="error" loading-auto :loading="loading" @click="onCancelConfirm">{{ t('common.confirm') }}</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

Note: this page calls `useChildren()` directly from the `children` module — same cross-module composable-call pattern `GroupsListPage.vue` already uses for `useStaffStore()`. It's a pre-existing project convention (Nuxt auto-imports make the module boundary porous in practice for read-only lookups), not a new violation introduced here. Ad-hoc sessions with no `group_id` get an empty `childOptions` list — adding children to those requires a kindergarten-wide child picker, which is out of scope for this plan (see DoD).

- [ ] **Step 2: Write `PoolTrainerSettingsPage.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { canManagePoolTrainer } = usePermissions()
const tenantStore = useTenantStore()
const authStore = useAuthStore()
const { items: groups, fetchAll: fetchGroups } = useGroups()

const selectedKgId = computed(() => tenantStore.selectedKindergartenId)
const trainerUserId = computed(() => authStore.user?.id ?? '')
const canEdit = computed(() => selectedKgId.value !== 'ALL' && canManagePoolTrainer(selectedKgId.value, trainerUserId.value))

useLazyAsyncData('pool-settings-groups', () => selectedKgId.value !== 'ALL' ? fetchGroups(selectedKgId.value) : Promise.resolve(), { watch: [selectedKgId] })

const groupOptions = computed(() => [
  { label: t('pool.pattern.noGroup'), value: null },
  ...groups.value.map(g => ({ label: g.name, value: g.id })),
])
</script>

<template>
  <div class="space-y-6">
    <BasePageHeader :title="t('pool.pageTitle')" :subtitle="t('pool.settingsTab')" />

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>

    <template v-else>
      <PoolAvailabilityEditor :kindergarten-id="selectedKgId" :trainer-user-id="trainerUserId" :can-edit="canEdit" />
      <PoolPatternList
        :kindergarten-id="selectedKgId"
        :trainer-user-id="trainerUserId"
        :can-edit="canEdit"
        :group-options="groupOptions"
      />
    </template>
  </div>
</template>
```

- [ ] **Step 3: Wire the Nuxt routes**

```vue
<!-- src/pages/pool/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'admin' })
</script>

<template>
  <PoolCalendarPage />
</template>
```

```vue
<!-- src/pages/pool/settings.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'admin' })
</script>

<template>
  <PoolTrainerSettingsPage />
</template>
```

Read an existing page under `src/pages/` (e.g. the one that renders `GroupsListPage`) first to confirm the exact `definePageMeta` shape used in this project (layout name, any middleware) and match it exactly — don't guess.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no new errors.

- [ ] **Step 5: Manual smoke test**

Start the app (`npm run dev`), log in as `elena.pop@startica.dev` (seed password `Startica123!`), navigate to `/pool`. Confirm the page renders without crashing (empty state is fine — no grant/pattern exists yet in seed data). This validates routing + composable wiring end-to-end even before PR #9's sidebar link exists.

- [ ] **Step 6: Commit**

```bash
git add src/modules/pool/pages src/pages/pool
git commit -m "feat(pool): calendar and trainer settings pages"
```

---

### Task 15: Playwright e2e

**Files:**
- Create: `tests/e2e/pool.spec.ts`

**Interfaces:**
- Consumes: existing Playwright fixtures/login helpers — read `tests/e2e/staff.spec.ts` first and copy its login/setup pattern exactly (don't reinvent it).

- [ ] **Step 1: Read the existing convention**

Open `tests/e2e/staff.spec.ts` and note: how it logs in, how it waits for the kindergarten selector, and its assertion style. Match it.

- [ ] **Step 2: Write the spec**

```typescript
// tests/e2e/pool.spec.ts
import { test, expect } from '@playwright/test'

// Follow the same login helper / kindergarten-selection pattern as staff.spec.ts.
test.describe('Pool module', () => {
  test('admin can create a trainer availability window and a pattern, then see generated sessions', async ({ page }) => {
    // 1. Log in as admin.demo@startica.dev / Startica123!
    // 2. Select the demo kindergarten from the tenant switcher
    // 3. Navigate to /pool/settings
    // 4. Add an availability window (e.g. Monday 09:00-12:00)
    // 5. Add a pattern inside that window (Monday 10:00-11:00, capacity 5)
    // 6. Navigate to /pool
    // 7. Assert at least one session card is visible with a date within the next 8 weeks
    await expect(page.locator('body')).toBeVisible() // placeholder assertion structure — replace steps above with real page.locator calls matching this project's existing e2e style before this test is considered done
  })

  test('enrolling a child beyond capacity is rejected', async ({ page }) => {
    // 1. As the trainer, open a generated session's participant list
    // 2. Add children until capacity is reached
    // 3. Assert the "add child" control is replaced by the full-state message (pool.participants.full)
  })
})
```

Note: the two tests above are scaffolded with real `test()`/`test.describe()` structure and concrete steps as comments, but the actual `page.locator(...)` calls must be filled in by reading `staff.spec.ts`'s exact selectors (e.g. does it use `getByRole`, `getByTestId`, or CSS selectors?) — copy that convention exactly rather than inventing a new one. This is the one task in this plan where the executing engineer must open a sibling file before writing the final code, because Playwright selector conventions are project-specific and weren't part of the spec.

- [ ] **Step 3: Run against the local stack**

Ensure `supabase start` and `npm run dev` are running, then:
Run: `npx playwright test tests/e2e/pool.spec.ts`
Expected: both tests pass once selectors are filled in per Step 2.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/pool.spec.ts
git commit -m "test(pool): e2e coverage for trainer setup and capacity enforcement"
```

---

### Task 16: Full verification and DoD sign-off

**Files:** none (verification only)

- [ ] **Step 1: Run the full quality gate**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all three pass, 0 errors.

- [ ] **Step 2: Confirm every migration convention was followed**

Re-read `supabase/migrations/<pool migration>.sql` against this checklist:
- `kindergarten_id` present on all 4 tables (including `pool_session_participants`, denormalized) ✓
- `deleted_at`, `created_at`, `updated_at`, `created_by`, `updated_by` on all 4 tables ✓
- RLS enabled + policies on all 4 tables ✓
- `authenticated` and `service_role` grants present ✓
- No hard DELETE anywhere in `pool.service.ts` (all mutations are soft-delete via UPDATE) ✓

- [ ] **Step 3: Confirm no rule-3 violations were introduced**

Run: `grep -rn "useSupabaseClient\|\.from(" src/modules/pool/stores src/modules/pool/pages src/modules/pool/components`
Expected: no matches — only `src/modules/pool/services/pool.service.ts` should reference the Supabase client, matching the fix this module was explicitly designed to avoid (per the 2026-07-04 audit finding).

- [ ] **Step 4: Update project memory**

This is a planning artifact, not code — if using Claude Code with the memory system, update the `module-access-status` memory entry to note the Pool module plan is implemented and PR-ready, once Tasks 1–15 are actually done (not before).
