<script setup lang="ts">
defineProps<{
  page: number
  pageSize: number
  total: number
}>()

defineEmits<{
  (e: 'update:page', value: number): void
}>()
</script>

<template>
  <div class="flex items-center justify-between px-6 py-4">
    <p class="text-sm text-slate-500">
      <slot
        name="summary"
        :from="total === 0 ? 0 : (page - 1) * pageSize + 1"
        :to="Math.min(page * pageSize, total)"
        :total="total"
      />
    </p>
    <UPagination
      v-if="total > pageSize"
      :page="page"
      :items-per-page="pageSize"
      :total="total"
      @update:page="$emit('update:page', $event)"
    />
  </div>
</template>
