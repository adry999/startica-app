<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

// 'all' shows every row. Callers resolve it via `resolvedPageSize` below rather
// than special-casing a sentinel number, so slicing stays readable.
export type PageSize = number | 'all'

const props = withDefaults(defineProps<{
  page: number
  pageSize: PageSize
  total: number
  pageSizeOptions?: number[]
  /** Hide the rows-per-page control (e.g. for short, fixed lists). */
  hidePageSize?: boolean
}>(), {
  pageSizeOptions: () => [10, 25, 50, 100],
  hidePageSize: false,
})

const emit = defineEmits<{
  (e: 'update:page', value: number): void
  (e: 'update:pageSize', value: PageSize): void
}>()

const { t } = useI18n()

// When showing everything, one page holds the whole list.
const resolvedPageSize = computed(() => (props.pageSize === 'all' ? Math.max(props.total, 1) : props.pageSize))

const from = computed(() => (props.total === 0 ? 0 : (props.page - 1) * resolvedPageSize.value + 1))
const to = computed(() => Math.min(props.page * resolvedPageSize.value, props.total))

const options = computed(() => [
  ...props.pageSizeOptions.map(n => ({ label: String(n), value: String(n) })),
  { label: t('common.pagination.all'), value: 'all' },
])

function onPageSizeChange(value: string) {
  emit('update:pageSize', value === 'all' ? 'all' : Number(value))
  // Row 1 moves under the cursor when the window resizes, so restart at page 1.
  emit('update:page', 1)
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
    <div class="flex items-center gap-3">
      <p class="text-sm text-slate-500">
        <slot name="summary" :from="from" :to="to" :total="total" />
      </p>

      <label v-if="!hidePageSize" class="flex items-center gap-1.5 text-sm text-slate-500">
        <span class="whitespace-nowrap">{{ t('common.pagination.perPage') }}</span>
        <select
          class="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700"
          :value="String(pageSize)"
          :aria-label="t('common.pagination.perPage')"
          @change="onPageSizeChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </label>
    </div>

    <UPagination
      v-if="total > resolvedPageSize"
      :page="page"
      :items-per-page="resolvedPageSize"
      :total="total"
      @update:page="emit('update:page', $event)"
    />
  </div>
</template>
