<script setup lang="ts">
import PaymentsListPage from '@modules/payments/pages/PaymentsListPage.vue'
definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin', 'admin'] })
</script>

<template>
  <PaymentsListPage />
</template>
