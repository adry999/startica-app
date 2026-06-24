<script setup lang="ts">
const { t } = useI18n()
const { user, logout } = useAuth()

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-app-bg">
    <UCard class="w-full max-w-sm text-center">
      <p class="text-neutral-800">
        {{ t('auth.welcomeBack', { name: user?.fullName }) }}
      </p>
      <p class="mt-1 text-sm text-neutral-500">
        {{ user ? t(`auth.role.${user.role}`) : '' }}
      </p>
      <UButton class="mt-4" color="primary" variant="soft" @click="onLogout">
        {{ t('auth.logout') }}
      </UButton>
    </UCard>
  </div>
</template>
