<script setup lang="ts">
import LoginPage from '~/modules/auth/pages/LoginPage.vue'

definePageMeta({ layout: 'auth', public: true, guestOnly: true })
</script>

<template>
  <LoginPage />
</template>
