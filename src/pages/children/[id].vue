<script setup lang="ts">
import ChildProfilePage from '~/modules/children/pages/ChildProfilePage.vue'
definePageMeta({ layout: 'admin' })
const { id } = useRoute().params as { id: string }
</script>
<template><ChildProfilePage :id="id" /></template>
