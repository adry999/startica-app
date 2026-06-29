<script setup lang="ts">
import GroupDetailPage from '~/modules/groups/pages/GroupDetailPage.vue'
definePageMeta({ layout: 'admin' })
const { id } = useRoute().params as { id: string }
</script>
<template><GroupDetailPage :id="id" /></template>
