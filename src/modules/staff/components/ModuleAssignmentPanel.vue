<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ModuleKey } from '@shared/session/actor.types'
import type { StaffMember } from '../types/staff.types'

const props = defineProps<{ member: StaffMember }>()
const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()
const toast = useToast()
const { error: staffError, fetchAssignedKindergartens, fetchUserModules, saveModuleGrants } = useStaff()

const saving = ref(false)
// desired keys per kindergarten id
const selection = ref<Record<string, ModuleKey[]>>({})

const moduleOptions: Array<{ key: ModuleKey; label: string }> = [
  { key: 'pool',         label: t('staff.modulePool') },
  { key: 'payroll_own',  label: t('staff.modulePayrollOwn') },
  { key: 'payroll_all',  label: t('staff.modulePayrollAll') },
]

async function loadGrants() {
  const assigned = await fetchAssignedKindergartens(props.member.id)
  // fetchAssignedKindergartens/fetchUserModules swallow errors to [] — check
  // staffStore.error (via useStaff().error) so a fetch failure isn't rendered
  // as a legitimate empty list.
  if (staffError.value) {
    return { kindergartens: [] as Array<{ id: string; name: string }>, selection: {} as Record<string, ModuleKey[]> }
  }

  const next: Record<string, ModuleKey[]> = {}
  for (const kg of assigned) {
    next[kg.id] = await fetchUserModules(props.member.id, kg.id)
    if (staffError.value) {
      return { kindergartens: [] as Array<{ id: string; name: string }>, selection: {} as Record<string, ModuleKey[]> }
    }
  }
  return { kindergartens: assigned, selection: next }
}

const { data, pending, refresh } = useLazyAsyncData(
  () => `staff-module-access-${props.member.id}`,
  loadGrants,
  { watch: [() => props.member.id] },
)

watch(data, (value) => {
  selection.value = value?.selection ?? {}
}, { immediate: true })

const kindergartens = computed(() => data.value?.kindergartens ?? [])
const loading = computed(() => pending.value)
const error = computed(() => staffError.value)

function toggle(kgId: string, key: ModuleKey, checked: boolean) {
  const set = new Set(selection.value[kgId] ?? [])
  if (checked) set.add(key)
  else set.delete(key)
  selection.value = { ...selection.value, [kgId]: [...set] }
}

function isChecked(kgId: string, key: ModuleKey): boolean {
  return (selection.value[kgId] ?? []).includes(key)
}

async function save() {
  saving.value = true
  let ok = true
  for (const kg of kindergartens.value) {
    ok = await saveModuleGrants(props.member.id, kg.id, selection.value[kg.id] ?? [])
    if (!ok) break
  }
  saving.value = false

  if (ok) {
    toast.add({ title: t('staff.moduleSaveSuccess'), color: 'success' })
    emit('saved')
    return
  }

  // saveModuleGrants is non-atomic: some grants/revokes may already be applied
  // before the failure. Re-fetch actual persisted state so the checkboxes never
  // show stale intent as if nothing had happened.
  toast.add({ title: staffError.value ?? t('staff.moduleSaveError'), color: 'error' })
  await refresh()
}
</script>

<template>
  <div class="space-y-6">
    <p v-if="loading" class="text-sm text-slate-400">{{ t('common.loading') }}</p>

    <UAlert v-else-if="error" color="error" variant="soft" :description="error" />

    <p v-else-if="kindergartens.length === 0" class="text-sm text-slate-400">
      {{ t('staff.moduleAccessEmpty') }}
    </p>

    <template v-else>
      <section v-for="kg in kindergartens" :key="kg.id" class="space-y-3 rounded-lg border border-border p-4">
        <h3 class="text-sm font-semibold text-slate-700">{{ kg.name }}</h3>
        <UCheckbox
          v-for="opt in moduleOptions"
          :key="opt.key"
          :model-value="isChecked(kg.id, opt.key)"
          :label="opt.label"
          @update:model-value="(v) => toggle(kg.id, opt.key, !!v)"
        />
      </section>

      <div class="flex justify-end">
        <UButton color="primary" :loading="saving" @click="save">{{ t('common.save') }}</UButton>
      </div>
    </template>
  </div>
</template>
