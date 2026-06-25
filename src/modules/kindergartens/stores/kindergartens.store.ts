import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as kindergartensService from '../services/kindergartens.service'
import type { KindergartenRow } from '../services/kindergartens.service'
import type { Kindergarten, KindergartenStatus } from '../types/kindergarten.types'

interface DetailsInput {
  name: string
  address?: string
  city?: string
  phone?: string
}

interface SettingsInput {
  timezone: string
  defaultLocale: 'ro' | 'en'
  workingHoursStart: string
  workingHoursEnd: string
}

function toKindergarten(row: KindergartenRow): Kindergarten {
  const settings = row.settings as {
    timezone?: string
    default_locale?: string
    working_hours?: { start?: string; end?: string }
  } | null

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone,
    status: row.status,
    settings: {
      timezone: settings?.timezone ?? 'Europe/Bucharest',
      defaultLocale: settings?.default_locale === 'en' ? 'en' : 'ro',
      workingHours: {
        start: settings?.working_hours?.start ?? '07:30',
        end: settings?.working_hours?.end ?? '18:00',
      },
    },
    createdAt: row.created_at,
  }
}

export const useKindergartensStore = defineStore('kindergartens', {
  state: () => ({
    items: [] as Kindergarten[],
    loading: false,
    error: null as string | null,
  }),

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.listKindergartens(client)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        this.items = []
        return
      }

      this.items = result.data.map(toKindergarten)
    },

    async create(details: DetailsInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.createKindergarten(client, details, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.items.push(toKindergarten(result.data))
      return true
    },

    async updateDetails(id: string, details: DetailsInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.updateKindergartenDetails(client, id, details, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toKindergarten(result.data))
      return true
    },

    async updateSettings(id: string, settings: SettingsInput) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.updateKindergartenSettings(client, id, settings, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toKindergarten(result.data))
      return true
    },

    async setStatus(id: string, status: KindergartenStatus) {
      const authStore = useAuthStore()
      const actorId = authStore.user?.id
      if (!actorId) return false

      this.loading = true
      this.error = null
      const client = useSupabaseClient()

      const result = await kindergartensService.setKindergartenStatus(client, id, status, actorId)
      this.loading = false
      if (!result.success) {
        this.error = result.error
        return false
      }

      this.replaceItem(toKindergarten(result.data))
      return true
    },

    replaceItem(updated: Kindergarten) {
      const index = this.items.findIndex((item) => item.id === updated.id)
      if (index === -1) return
      this.items[index] = updated
    },
  },
})
