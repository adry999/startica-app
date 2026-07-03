<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ModuleKey } from '~/modules/auth/types/moduleAccess.types'
import type { StaffMember } from '../types/staff.types'

const props = defineProps<{ member: StaffMember }>()
const emit = defineEmits<{ saved: [] }>()

const { t } = useI18n()
const toast = useToast()
const staffStore = useStaffStore()

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const kindergartens = ref<Array<{ id: string; name: string }>>([])
// desired keys per kindergarten id
const selection = ref<Record<string, ModuleKey[]>>({})

const moduleOptions: Array<{ key: ModuleKey; label: string }> = [
  { key: 'pool',         label: t('staff.modulePool') },
  { key: 'payroll_own',  label: t('staff.modulePayrollOwn') },
  { key: 'payroll_all',  label: t('staff.modulePayrollAll') },
]

async function load() {
  loading.value = true
  error.value = null

  kindergartens.value = await staffStore.fetchAssignedKindergartens(props.member.id)
  // fetchAssignedKindergartens/fetchUserModules swallow errors to [] — check
  // staffStore.error so a fetch failure isn't rendered as a legitimate empty list.
  if (staffStore.error) {
    error.value = staffStore.error
    loading.value = false
    return
  }

  const next: Record<string, ModuleKey[]> = {}
  for (const kg of kindergartens.value) {
    next[kg.id] = await staffStore.fetchUserModules(props.member.id, kg.id)
    if (staffStore.error) {
      error.value = staffStore.error
      loading.value = false
      return
    }
  }
  selection.value = next
  loading.value = false
}

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
    ok = await staffStore.saveModuleGrants(props.member.id, kg.id, selection.value[kg.id] ?? [])
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
  toast.add({ title: staffStore.error ?? t('staff.moduleSaveError'), color: 'error' })
  await load()
}

watch(() => props.member.id, load, { immediate: true })
</script>

<template>
  <div class="space-y-6">
    <p v-if="loading" class="text-sm text-slate-400">{{ t('common.loading') }}</p>

    <UAlert v-else-if="error" color="error" variant="soft" :description="error" />

    <p v-else-if="kindergartens.length === 0" class="text-sm text-slate-400">
      {{ t('staff.moduleAccessEmpty') }}
    </p>

    <template v-else>
      <section v-for="kg in kindergartens" :key="kg.id" class="space-y-2">
        <h3 class="text-sm font-semibold text-slate-700">{{ kg.name }}</h3>
        <label
          v-for="opt in moduleOptions"
          :key="opt.key"
          class="flex items-center gap-2 text-sm text-slate-600"
        >
          <input
            type="checkbox"
            :checked="isChecked(kg.id, opt.key)"
            @change="(e) => toggle(kg.id, opt.key, (e.target as HTMLInputElement).checked)"
          >
          {{ opt.label }}
        </label>
      </section>

      <div class="flex justify-end">
        <UButton color="primary" :loading="saving" @click="save">{{ t('common.save') }}</UButton>
      </div>
    </template>
  </div>
</template>
