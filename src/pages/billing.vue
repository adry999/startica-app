<script setup lang="ts">
import BillingListPage from '~/modules/billing/pages/BillingListPage.vue'
definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin', 'admin'] })
</script>

<template>
  <BillingListPage />
</template>
