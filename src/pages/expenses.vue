<script setup lang="ts">
import ExpensesListPage from '~/modules/expenses/pages/ExpensesListPage.vue'
definePageMeta({ layout: 'admin', middleware: ['role'], roles: ['super_admin', 'admin'] })
</script>

<template>
  <ExpensesListPage />
</template>
