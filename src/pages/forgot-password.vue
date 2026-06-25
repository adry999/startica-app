<script setup lang="ts">
import ForgotPasswordPage from '~/modules/auth/pages/ForgotPasswordPage.vue'

definePageMeta({ layout: 'auth', public: true, guestOnly: true })
</script>

<template>
  <ForgotPasswordPage />
</template>
