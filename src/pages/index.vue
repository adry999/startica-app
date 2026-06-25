<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { t } = useI18n()
const { user } = useAuth()
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold text-neutral-800">
      {{ t('auth.welcomeBack', { name: user?.fullName }) }}
    </h1>
    <p class="mt-1 text-sm text-neutral-500">
      {{ user ? t(`auth.role.${user.role}`) : '' }}
    </p>
  </div>
</template>
