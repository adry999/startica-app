# P1 — Settings Kindergarten Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Settings → Kindergarten section load the stored settings before saving, report logo uploads truthfully, show working selects, and appear only to users allowed to change a kindergarten.

**Architecture:** Extract the kindergarten settings state and orchestration from `SettingsPage.vue` into a module composable that receives a small gateway (plain functions), so the save-guard and logo flow are unit-tested without Nuxt. A pure `visibleSettingsSections` helper decides which sections render. A new service function writes only `logo_url` and reports RLS refusals.

**Tech Stack:** Nuxt 3.21, Vue 3.5, Pinia 3, Supabase JS 2, Nuxt UI 3, Vitest 4, vue-i18n 11.

**Spec:** Audit report https://claude.ai/code/artifact/ed5a70e1-2e16-43e9-b87b-937cc791489c · roadmap `docs/superpowers/plans/2026-09-14-audit-remediation-roadmap.md` · conventions `.claude/skills/project-conventions/SKILL.md`.

## Global Constraints

- Conventional Commits, imperative, scope `settings`; no AI/agent mention; no `Co-Authored-By`.
- Every commit: `npm run lint` 0 errors, `npm run typecheck`, `npx vitest run`, `npm run build` green. Run them one after another, never in parallel (they regenerate `.nuxt`).
- Nuxt UI v3: `USelect` takes `:items` (the v2 prop `options` is ignored).
- RLS: `kindergartens_update` allows only a super admin (`supabase/migrations/20260626210001_rls_perf_wrap_helpers.sql:48`); `usePermissions().can('update', 'kindergarten')` mirrors it.
- No hardcoded user-facing strings; edit locale JSON only with the node script given (preserves formatting and EOL).
- Never show a raw Supabase error message.

## Bugs this plan fixes (verified on `main` b650fb2)

1. `SettingsPage.vue:172-176` loads settings only when `!timezone.value`, but `timezone` starts as `'Europe/Bucharest'`, so opening the tab never loads and **Save overwrites the stored settings with the defaults**.
2. `SettingsPage.vue:135-147` ignores the result of the logo URL update and always toasts success; admins get "Logo updated" while RLS refuses the write.
3. `SettingsPage.vue:367,379` `USelect :options` renders empty selects.
4. `SettingsPage.vue:30-35` shows the section to every role.
5. `SettingsPage.vue:138` sends `''` as `updated_by`; `SettingsPage.vue:160` toasts `result.error`.

## File Structure

- Create `src/modules/settings/utils/settingsSections.ts` — `SettingsSection` type and `visibleSettingsSections(canManageKindergarten)`.
- Create `src/modules/settings/utils/settingsSections.test.ts`.
- Create `src/modules/settings/composables/useKindergartenSettings.ts` — form state, load with latest-request guard, guarded save, truthful logo upload, via `KindergartenSettingsGateway`.
- Create `src/modules/settings/composables/useKindergartenSettings.test.ts`.
- Delete `src/modules/settings/composables/.gitkeep`.
- Modify `src/modules/settings/services/settings.service.ts` — add `updateKindergartenLogo`.
- Create `src/modules/settings/services/settings.service.test.ts`.
- Modify `src/modules/settings/pages/SettingsPage.vue` — wire composable, gateway, section visibility, `:items`, error texts.
- Modify `src/core/i18n/locales/en.json`, `ro.json` — add `settings.resetError`.

## Setup (once)

- [ ] **Create the worktree**

```powershell
$repo = "D:\CODE\startica\app"
git -C $repo fetch origin
git -C $repo worktree add -b fix/settings-kindergarten-section "$repo\.worktrees\settings-kindergarten" origin/main
New-Item -ItemType Junction -Path "$repo\.worktrees\settings-kindergarten\node_modules" -Target "$repo\node_modules" | Out-Null
```

Run every later command from `D:\CODE\startica\app\.worktrees\settings-kindergarten`, then `npx nuxi prepare` once.

---

### Task 1: `updateKindergartenLogo` service function

**Files:**
- Modify: `src/modules/settings/services/settings.service.ts` (append after `updateKindergartenSettings`)
- Test: `src/modules/settings/services/settings.service.test.ts`

**Interfaces:**
- Produces: `updateKindergartenLogo(client: SupabaseClient<Database>, kindergartenId: string, userId: string, logoUrl: string): Promise<Result<void>>` — `{ success: false, error: 'forbidden' }` when RLS returns no row.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  argumentsOf,
  createSupabaseClientFake,
  networkFailureResponse,
  successResponse,
} from '@test-support/supabase-client-fake'
import { updateKindergartenLogo } from './settings.service'

const kindergartenId = '3f1a9c2e-5b7d-4e8a-9c1f-2a4b6d8e0f13'
const actorId = 'user-1'
const logoUrl = 'https://cdn.example/kindergarten-avatars/logo.png'

describe('updateKindergartenLogo', () => {
  it('writes only the logo url and the actor for the kindergarten', async () => {
    const { client, queries } = createSupabaseClientFake(() => successResponse({ id: kindergartenId }))

    const result = await updateKindergartenLogo(client, kindergartenId, actorId, logoUrl)

    expect(result).toEqual({ success: true, data: undefined })
    const kindergartensQuery = queries.find(query => query.target === 'kindergartens')
    expect(argumentsOf(kindergartensQuery, 'update')).toEqual([[{ logo_url: logoUrl, updated_by: actorId }]])
    expect(argumentsOf(kindergartensQuery, 'eq')).toEqual([['id', kindergartenId]])
  })

  it('reports a refusal when row-level security leaves no row to update', async () => {
    const { client } = createSupabaseClientFake(() => successResponse(null))

    const result = await updateKindergartenLogo(client, kindergartenId, actorId, logoUrl)

    expect(result).toEqual({ success: false, error: 'forbidden' })
  })

  it('reports a failure when the request does not reach the server', async () => {
    const { client } = createSupabaseClientFake(() => networkFailureResponse)

    const result = await updateKindergartenLogo(client, kindergartenId, actorId, logoUrl)

    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/modules/settings/services/settings.service.test.ts`
Expected: FAIL — `updateKindergartenLogo` is not exported.

- [ ] **Step 3: Write minimal implementation** — append to `settings.service.ts`:

```ts
export async function updateKindergartenLogo(
  client: Client,
  kindergartenId: string,
  userId: string,
  logoUrl: string,
): Promise<Result<void>> {
  const { data, error } = await client
    .from('kindergartens')
    .update({ logo_url: logoUrl, updated_by: userId })
    .eq('id', kindergartenId)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  // No row: RLS lets the caller read this kindergarten but not change it.
  if (!data) return { success: false, error: 'forbidden' }
  return { success: true, data: undefined }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/modules/settings/services/settings.service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/settings/services/settings.service.ts src/modules/settings/services/settings.service.test.ts
git commit -m "feat(settings): save a kindergarten logo url and report refused writes"
```

---

### Task 2: Section visibility and kindergarten settings composable

**Files:**
- Create: `src/modules/settings/utils/settingsSections.ts`, `src/modules/settings/utils/settingsSections.test.ts`
- Create: `src/modules/settings/composables/useKindergartenSettings.ts`, `src/modules/settings/composables/useKindergartenSettings.test.ts`
- Delete: `src/modules/settings/composables/.gitkeep`

**Interfaces:**
- Consumes: `createLatestRequestGuard()` from `@core/async/latest-request` (`begin(): { isLatest(): boolean }`); `Result<T, E = string>` from `@shared/types/result`; `KindergartenSettings` type from `../services/settings.service`.
- Produces:
  - `type SettingsSection = 'profile' | 'kindergarten' | 'password' | 'language'`
  - `visibleSettingsSections(canManageKindergarten: boolean): SettingsSection[]`
  - `interface KindergartenSettingsForm { timezone: string; defaultLocale: 'ro' | 'en'; workingHoursStart: string; workingHoursEnd: string }`
  - `interface KindergartenSettingsRecord { settings: KindergartenSettings | null; logoUrl: string | null }`
  - `interface KindergartenSettingsGateway { fetchSettings(kindergartenId: string): Promise<Result<KindergartenSettingsRecord>>; saveSettings(kindergartenId: string, actorId: string, form: KindergartenSettingsForm): Promise<Result<void>>; uploadLogo(kindergartenId: string, file: File): Promise<Result<string>>; saveLogoUrl(kindergartenId: string, actorId: string, logoUrl: string): Promise<Result<void>> }`
  - `useKindergartenSettings(kindergartenId: Ref<string | null>, gateway: KindergartenSettingsGateway)` returning `{ form, logoUrl, isLoading, isSaving, isUploadingLogo, canSave, load(): Promise<boolean>, save(actorId: string | null): Promise<boolean>, uploadLogo(file: File, actorId: string | null): Promise<boolean> }`

- [ ] **Step 1: Write the failing tests**

`src/modules/settings/utils/settingsSections.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { visibleSettingsSections } from './settingsSections'

describe('visibleSettingsSections', () => {
  it('shows the kindergarten section to someone allowed to change the kindergarten', () => {
    expect(visibleSettingsSections(true)).toEqual(['profile', 'kindergarten', 'password', 'language'])
  })

  it('hides the kindergarten section from everyone else', () => {
    expect(visibleSettingsSections(false)).toEqual(['profile', 'password', 'language'])
  })
})
```

`src/modules/settings/composables/useKindergartenSettings.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { Result } from '@shared/types/result'
import {
  useKindergartenSettings,
  type KindergartenSettingsGateway,
  type KindergartenSettingsRecord,
} from './useKindergartenSettings'

const storedRecord: KindergartenSettingsRecord = {
  settings: { timezone: 'Europe/Chisinau', default_locale: 'en', working_hours: { start: '08:00', end: '17:00' } },
  logoUrl: 'https://cdn.example/old-logo.png',
}

function createGateway(overrides: Partial<KindergartenSettingsGateway> = {}): KindergartenSettingsGateway {
  return {
    fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>().mockResolvedValue({ success: true, data: storedRecord }),
    saveSettings: vi.fn<KindergartenSettingsGateway['saveSettings']>().mockResolvedValue({ success: true, data: undefined }),
    uploadLogo: vi.fn<KindergartenSettingsGateway['uploadLogo']>().mockResolvedValue({ success: true, data: 'https://cdn.example/new-logo.png' }),
    saveLogoUrl: vi.fn<KindergartenSettingsGateway['saveLogoUrl']>().mockResolvedValue({ success: true, data: undefined }),
    ...overrides,
  }
}

const logoFile = new File(['logo'], 'logo.png', { type: 'image/png' })

describe('useKindergartenSettings', () => {
  it('loads the stored settings instead of keeping the defaults', async () => {
    const settings = useKindergartenSettings(ref('kg-1'), createGateway())

    await expect(settings.load()).resolves.toBe(true)

    expect(settings.form.value).toEqual({
      timezone: 'Europe/Chisinau',
      defaultLocale: 'en',
      workingHoursStart: '08:00',
      workingHoursEnd: '17:00',
    })
    expect(settings.logoUrl.value).toBe('https://cdn.example/old-logo.png')
    expect(settings.canSave.value).toBe(true)
  })

  it('refuses to save before the stored settings have loaded', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)

    await expect(settings.save('actor-1')).resolves.toBe(false)

    expect(gateway.saveSettings).not.toHaveBeenCalled()
  })

  it('refuses to save when loading the stored settings failed', async () => {
    const gateway = createGateway({
      fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>().mockResolvedValue({ success: false, error: 'network' }),
    })
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.save('actor-1')).resolves.toBe(false)

    expect(gateway.saveSettings).not.toHaveBeenCalled()
  })

  it('saves the loaded form for the kindergarten and actor', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()
    settings.form.value.workingHoursEnd = '18:30'

    await expect(settings.save('actor-1')).resolves.toBe(true)

    expect(gateway.saveSettings).toHaveBeenCalledWith('kg-1', 'actor-1', {
      timezone: 'Europe/Chisinau',
      defaultLocale: 'en',
      workingHoursStart: '08:00',
      workingHoursEnd: '18:30',
    })
  })

  it('refuses to save without a signed-in actor', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.save(null)).resolves.toBe(false)

    expect(gateway.saveSettings).not.toHaveBeenCalled()
  })

  it('reports a logo upload as failed when saving its url is refused, keeping the previous logo', async () => {
    const gateway = createGateway({
      saveLogoUrl: vi.fn<KindergartenSettingsGateway['saveLogoUrl']>().mockResolvedValue({ success: false, error: 'forbidden' }),
    })
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.uploadLogo(logoFile, 'actor-1')).resolves.toBe(false)

    expect(settings.logoUrl.value).toBe('https://cdn.example/old-logo.png')
    expect(settings.isUploadingLogo.value).toBe(false)
  })

  it('shows the new logo only after both the upload and the url save succeed', async () => {
    const gateway = createGateway()
    const settings = useKindergartenSettings(ref('kg-1'), gateway)
    await settings.load()

    await expect(settings.uploadLogo(logoFile, 'actor-1')).resolves.toBe(true)

    expect(gateway.saveLogoUrl).toHaveBeenCalledWith('kg-1', 'actor-1', 'https://cdn.example/new-logo.png')
    expect(settings.logoUrl.value).toBe('https://cdn.example/new-logo.png')
  })

  it('ignores settings that arrive after the kindergarten changed', async () => {
    let resolveFirst: (result: Result<KindergartenSettingsRecord>) => void = () => {}
    const firstLoad = new Promise<Result<KindergartenSettingsRecord>>((resolve) => { resolveFirst = resolve })
    const secondRecord: KindergartenSettingsRecord = { settings: { timezone: 'UTC' }, logoUrl: null }
    const gateway = createGateway({
      fetchSettings: vi.fn<KindergartenSettingsGateway['fetchSettings']>()
        .mockReturnValueOnce(firstLoad)
        .mockResolvedValueOnce({ success: true, data: secondRecord }),
    })
    const kindergartenId = ref<string | null>('kg-1')
    const settings = useKindergartenSettings(kindergartenId, gateway)

    const loadingFirst = settings.load()
    kindergartenId.value = 'kg-2'
    await settings.load()
    resolveFirst({ success: true, data: storedRecord })

    await expect(loadingFirst).resolves.toBe(false)
    expect(settings.form.value.timezone).toBe('UTC')
    expect(settings.canSave.value).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/modules/settings/utils src/modules/settings/composables`
Expected: FAIL — modules `./settingsSections` and `./useKindergartenSettings` not found.

- [ ] **Step 3: Write the implementation**

`src/modules/settings/utils/settingsSections.ts`:

```ts
export type SettingsSection = 'profile' | 'kindergarten' | 'password' | 'language'

const allSections: SettingsSection[] = ['profile', 'kindergarten', 'password', 'language']

// The kindergarten section writes to kindergartens, which RLS lets only a super admin update.
export function visibleSettingsSections(canManageKindergarten: boolean): SettingsSection[] {
  return canManageKindergarten ? allSections : allSections.filter(section => section !== 'kindergarten')
}
```

`src/modules/settings/composables/useKindergartenSettings.ts`:

```ts
import { computed, ref, type Ref } from 'vue'
import { createLatestRequestGuard } from '@core/async/latest-request'
import type { Result } from '@shared/types/result'
import type { KindergartenSettings } from '../services/settings.service'

export interface KindergartenSettingsForm {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHoursStart: string
  workingHoursEnd: string
}

export interface KindergartenSettingsRecord {
  settings: KindergartenSettings | null
  logoUrl: string | null
}

export interface KindergartenSettingsGateway {
  fetchSettings(kindergartenId: string): Promise<Result<KindergartenSettingsRecord>>
  saveSettings(kindergartenId: string, actorId: string, form: KindergartenSettingsForm): Promise<Result<void>>
  uploadLogo(kindergartenId: string, file: File): Promise<Result<string>>
  saveLogoUrl(kindergartenId: string, actorId: string, logoUrl: string): Promise<Result<void>>
}

function toForm(settings: KindergartenSettings | null): KindergartenSettingsForm {
  return {
    timezone: settings?.timezone ?? 'Europe/Bucharest',
    defaultLocale: settings?.default_locale === 'en' ? 'en' : 'ro',
    workingHoursStart: settings?.working_hours?.start ?? '07:30',
    workingHoursEnd: settings?.working_hours?.end ?? '18:00',
  }
}

export function useKindergartenSettings(kindergartenId: Ref<string | null>, gateway: KindergartenSettingsGateway) {
  const settingsRequests = createLatestRequestGuard()

  const form = ref<KindergartenSettingsForm>(toForm(null))
  const logoUrl = ref<string | null>(null)
  const loadedKindergartenId = ref<string | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  const isUploadingLogo = ref(false)

  // Saving before the stored settings arrive would overwrite them with the defaults.
  const canSave = computed(() =>
    kindergartenId.value !== null && loadedKindergartenId.value === kindergartenId.value && !isSaving.value)

  async function load(): Promise<boolean> {
    const requestedId = kindergartenId.value
    if (!requestedId) return false
    const request = settingsRequests.begin()
    loadedKindergartenId.value = null
    isLoading.value = true

    const result = await gateway.fetchSettings(requestedId)
    if (!request.isLatest()) return false
    isLoading.value = false
    if (!result.success) return false

    form.value = toForm(result.data.settings)
    logoUrl.value = result.data.logoUrl
    loadedKindergartenId.value = requestedId
    return true
  }

  async function save(actorId: string | null): Promise<boolean> {
    const targetId = kindergartenId.value
    if (!actorId || !targetId || !canSave.value) return false
    isSaving.value = true
    try {
      const result = await gateway.saveSettings(targetId, actorId, { ...form.value })
      return result.success
    }
    finally {
      isSaving.value = false
    }
  }

  async function uploadLogo(file: File, actorId: string | null): Promise<boolean> {
    const targetId = kindergartenId.value
    if (!actorId || !targetId) return false
    isUploadingLogo.value = true
    try {
      const upload = await gateway.uploadLogo(targetId, file)
      if (!upload.success) return false
      const saved = await gateway.saveLogoUrl(targetId, actorId, upload.data)
      if (!saved.success) return false
      if (kindergartenId.value === targetId) logoUrl.value = upload.data
      return true
    }
    finally {
      isUploadingLogo.value = false
    }
  }

  return { form, logoUrl, isLoading, isSaving, isUploadingLogo, canSave, load, save, uploadLogo }
}
```

Then remove the placeholder: `git rm src/modules/settings/composables/.gitkeep`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/modules/settings`
Expected: PASS (2 + 8 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/settings/utils src/modules/settings/composables
git commit -m "refactor(settings): extract kindergarten settings state with a save guard"
```

---

### Task 3: Wire the page

**Files:**
- Modify: `src/modules/settings/pages/SettingsPage.vue` (script lines 1-177 replaced; template edits listed)
- Modify: `src/core/i18n/locales/en.json`, `src/core/i18n/locales/ro.json`

**Interfaces:**
- Consumes: everything produced by Tasks 1–2; `usePermissions().can(action, resource)` (auto-imported from `shared/permissions`); `useActorStore().actorId`, `useActorStore().actor`, `updateProfile(change)`; `uploadKindergartenAvatar(client, kindergartenId, file): Promise<{ success: boolean; url?: string; error?: string }>`.

- [ ] **Step 1: Add the locale key**

Run from the worktree root:

```bash
node -e "
const fs=require('fs');
const text={ en:'The reset email could not be sent. Try again later.', ro:'Emailul de resetare nu a putut fi trimis. Încearcă din nou mai târziu.' };
for (const [locale,value] of Object.entries(text)) {
  const path='src/core/i18n/locales/'+locale+'.json';
  const raw=fs.readFileSync(path,'utf8');
  const data=JSON.parse(raw);
  if ('resetError' in data.settings) throw new Error('settings.resetError exists in '+locale);
  data.settings.resetError=value;
  const eol=raw.includes('\r\n')?'\r\n':'\n';
  fs.writeFileSync(path, JSON.stringify(data,null,2).replace(/\n/g,eol)+(raw.endsWith('\n')?eol:''));
}"
```

Expected: `git diff --stat src/core/i18n` shows `1 insertion` per file.

- [ ] **Step 2: Replace the `<script setup>` block (lines 1-177) with:**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { uploadKindergartenAvatar } from '~/core/storage/avatar.service'
import { useSupabaseClient } from '~/core/supabase/client'
import {
  useKindergartenSettings,
  type KindergartenSettingsGateway,
} from '../composables/useKindergartenSettings'
import * as settingsService from '../services/settings.service'
import type { KindergartenSettings } from '../services/settings.service'
import { visibleSettingsSections, type SettingsSection } from '../utils/settingsSections'

const { t } = useI18n()
const toast = useToast()
const { can } = usePermissions()
const actorStore = useActorStore()
const tenantStore = useTenantStore()
const client = useSupabaseClient()

const activeSection = ref<SettingsSection>('profile')

const fullName = ref(actorStore.actor?.fullName ?? '')
const saving = ref(false)
const sending = ref(false)

const sectionPresentation: Record<SettingsSection, { icon: string, labelKey: string }> = {
  profile: { icon: 'i-heroicons-user-circle', labelKey: 'settings.profileSection' },
  kindergarten: { icon: 'i-heroicons-building-library', labelKey: 'settings.kindergartenSection' },
  password: { icon: 'i-heroicons-lock-closed', labelKey: 'settings.passwordSection' },
  language: { icon: 'i-heroicons-language', labelKey: 'settings.languageSection' },
}

const navItems = computed(() => visibleSettingsSections(can('update', 'kindergarten'))
  .map(section => ({ key: section, ...sectionPresentation[section] })))

const timezoneOptions = [
  { label: 'Europe/Bucharest', value: 'Europe/Bucharest' },
  { label: 'Europe/Chisinau', value: 'Europe/Chisinau' },
  { label: 'UTC', value: 'UTC' },
]

const localeOptions = [
  { label: 'Română', value: 'ro' },
  { label: 'English', value: 'en' },
]

const userInitials = computed(() => {
  const name = actorStore.actor?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

const selectedKindergartenId = computed(() => tenantStore.selectedKindergartenId)

const kindergartenSettingsGateway: KindergartenSettingsGateway = {
  async fetchSettings(kindergartenId) {
    const result = await settingsService.fetchKindergartenSettings(client, kindergartenId)
    if (!result.success) return result
    // logo_url is a column on kindergartens, not a key inside the settings jsonb.
    return {
      success: true,
      data: { settings: result.data.settings as KindergartenSettings | null, logoUrl: result.data.logo_url },
    }
  },
  async saveSettings(kindergartenId, actorId, form) {
    const result = await settingsService.updateKindergartenSettings(client, kindergartenId, actorId, form)
    return result.success ? { success: true, data: undefined } : result
  },
  async uploadLogo(kindergartenId, file) {
    const result = await uploadKindergartenAvatar(client, kindergartenId, file)
    return result.success && result.url
      ? { success: true, data: result.url }
      : { success: false, error: result.error ?? 'upload_failed' }
  },
  saveLogoUrl: (kindergartenId, actorId, logoUrl) =>
    settingsService.updateKindergartenLogo(client, kindergartenId, actorId, logoUrl),
}

const kindergartenSettings = useKindergartenSettings(selectedKindergartenId, kindergartenSettingsGateway)
const {
  form: kindergartenForm,
  logoUrl: kindergartenLogoUrl,
  isLoading: loadingKindergartenSettings,
  isSaving: savingKindergartenSettings,
  isUploadingLogo: uploadingKindergartenLogo,
  canSave: canSaveKindergartenSettings,
} = kindergartenSettings

watch([activeSection, selectedKindergartenId], ([section]) => {
  if (section === 'kindergarten') kindergartenSettings.load()
})

async function saveProfile() {
  if (!actorStore.actor) return
  saving.value = true
  const result = await settingsService.updateOwnProfile(client, actorStore.actor.id, fullName.value)
  saving.value = false
  if (!result.success) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }
  actorStore.updateProfile({ fullName: fullName.value })
  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.[0] || !actorStore.actor) return

  const file = input.files[0]
  saving.value = true
  const result = await settingsService.updateOwnAvatar(client, actorStore.actor.id, file)
  saving.value = false

  if (!result.success) {
    toast.add({ title: t('settings.avatarUploadError'), color: 'error' })
    return
  }

  actorStore.updateProfile({ avatarUrl: result.data })
  toast.add({ title: t('settings.avatarUploadSuccess'), color: 'success' })
}

async function saveKindergartenSettings() {
  const saved = await kindergartenSettings.save(actorStore.actorId)
  if (!saved) {
    toast.add({ title: t('settings.saveError'), color: 'error' })
    return
  }
  toast.add({ title: t('settings.saveSuccess'), color: 'success' })
}

async function handleKindergartenLogoUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const uploaded = await kindergartenSettings.uploadLogo(file, actorStore.actorId)
  if (!uploaded) {
    toast.add({ title: t('settings.kindergartenAvatarUploadError'), color: 'error' })
    return
  }
  toast.add({ title: t('settings.kindergartenAvatarUploadSuccess'), color: 'success' })
}

async function sendPasswordReset() {
  if (!actorStore.actor?.email) return
  sending.value = true
  const result = await settingsService.requestOwnPasswordReset(
    client,
    actorStore.actor.email,
    `${window.location.origin}/reset-password`,
  )
  sending.value = false
  if (!result.success) {
    toast.add({ title: t('settings.resetError'), color: 'error' })
    return
  }
  toast.add({ title: t('settings.resetSent'), color: 'success' })
}
</script>
```

- [ ] **Step 3: Apply the template edits**

Delete the two banner comment lines:
```html
      <!-- ── Left sub-nav ──────────────────────────────────────────────── -->
```
```html
      <!-- ── Right panel ───────────────────────────────────────────────── -->
```

Replace the kindergarten Save button:
```html
            <UButton color="primary" :loading="savingKg" @click="saveKindergartenSettings">
```
with:
```html
            <UButton
              color="primary"
              :loading="savingKindergartenSettings"
              :disabled="!canSaveKindergartenSettings"
              @click="saveKindergartenSettings"
            >
```

Replace `<div v-if="loadingKg" class="flex justify-center py-8">` with `<div v-if="loadingKindergartenSettings" class="flex justify-center py-8">`.

Replace the logo `<img>` block:
```html
                  <img
                    v-if="kindergartenLogoUrl"
                    :src="kindergartenLogoUrl"
                    alt="Kindergarten logo"
```
with:
```html
                  <img
                    v-if="kindergartenLogoUrl"
                    :src="kindergartenLogoUrl"
                    :alt="t('settings.kindergartenLogo')"
```

Replace the logo file input handlers:
```html
                      @change="handleKindergartenAvatarUpload"
                      :disabled="uploadingKgAvatar"
```
with:
```html
                      :disabled="uploadingKindergartenLogo"
                      @change="handleKindergartenLogoUpload"
```

Replace the timezone select:
```html
                <USelect
                  v-model="timezone"
                  :options="[
                    { label: 'Europe/Bucharest', value: 'Europe/Bucharest' },
                    { label: 'Europe/Chisinau', value: 'Europe/Chisinau' },
                    { label: 'UTC', value: 'UTC' },
                  ]"
                  class="w-full"
                />
```
with:
```html
                <USelect v-model="kindergartenForm.timezone" :items="timezoneOptions" class="w-full" />
```

Replace the locale select:
```html
                <USelect
                  v-model="kgLocale"
                  :options="[
                    { label: 'Română', value: 'ro' },
                    { label: 'English', value: 'en' },
                  ]"
                  class="w-full"
                />
```
with:
```html
                <USelect v-model="kindergartenForm.defaultLocale" :items="localeOptions" class="w-full" />
```

Replace `<UInput v-model="workingHoursStart" type="time" class="w-full" />` with `<UInput v-model="kindergartenForm.workingHoursStart" type="time" class="w-full" />` and `<UInput v-model="workingHoursEnd" type="time" class="w-full" />` with `<UInput v-model="kindergartenForm.workingHoursEnd" type="time" class="w-full" />`.

- [ ] **Step 4: Verify no old identifiers remain**

Run: `grep -nE "loadingKg|savingKg|uploadingKgAvatar|kgLocale|selectedKgId|:options=|handleKindergartenAvatarUpload|\|\| ''" src/modules/settings/pages/SettingsPage.vue`
Expected: no output.

- [ ] **Step 5: Run the gates in order**

```bash
npx vitest run
npm run lint
npm run typecheck
npm run build
```
Expected: all tests pass; lint 0 errors; typecheck exit 0; build "Build complete".

- [ ] **Step 6: Manual check (dev server, real data)**

1. Log in as super admin → Settings → Kindergarten: the stored timezone, language and hours appear (not the defaults); both selects list their choices; change closing time → Save → reload page → value persisted.
2. Upload a logo as super admin → success toast; reload → logo shown.
3. Log in as admin → Settings: no Kindergarten entry in the side navigation.

- [ ] **Step 7: Commit**

```bash
git add src/modules/settings/pages/SettingsPage.vue src/core/i18n/locales/en.json src/core/i18n/locales/ro.json
git commit -m "fix(settings): load kindergarten settings before saving and report logo failures" -m "Opening the kindergarten tab never loaded the stored settings, so saving overwrote them with the defaults. The logo upload toasted success even when row-level security refused the write, and both selects used the Nuxt UI v2 options prop. The section is now shown only to users who can update a kindergarten."
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin fix/settings-kindergarten-section
gh pr create --base main --head fix/settings-kindergarten-section --title "fix(settings): load kindergarten settings before saving and report logo failures" --body "Fixes audit findings: settings overwritten with defaults, false logo success, empty selects, section visible to every role, raw reset error. Manual checks in docs/superpowers/plans/2026-09-14-p1-settings-kindergarten-section.md Task 3 Step 6."
```
