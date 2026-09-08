<script setup lang="ts">
import AuditLogPage from '~/modules/dashboard/pages/AuditLogPage.vue'

definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin', 'admin'] })
</script>

<template>
  <AuditLogPage />
</template>
