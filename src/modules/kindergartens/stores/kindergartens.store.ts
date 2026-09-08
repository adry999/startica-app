import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useStoreAction } from '~/shared/composables/useStoreAction'
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
      const withLoading = useStoreAction(this)
      return withLoading(
        () => kindergartensService.listKindergartens(useSupabaseClient()),
        (data) => { this.items = data.map(toKindergarten) },
      )
    },

    async create(details: DetailsInput) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => kindergartensService.createKindergarten(useSupabaseClient(), details),
        (data) => { this.items.push(toKindergarten(data)) },
      )
    },

    async updateDetails(id: string, details: DetailsInput) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => kindergartensService.updateKindergartenDetails(useSupabaseClient(), id, details),
        (data) => { this.replaceItem(toKindergarten(data)) },
      )
    },

    async updateSettings(id: string, settings: SettingsInput) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => kindergartensService.updateKindergartenSettings(useSupabaseClient(), id, settings),
        (data) => { this.replaceItem(toKindergarten(data)) },
      )
    },

    async setStatus(id: string, status: KindergartenStatus) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => kindergartensService.setKindergartenStatus(useSupabaseClient(), id, status),
        (data) => { this.replaceItem(toKindergarten(data)) },
      )
    },

    replaceItem(updated: Kindergarten) {
      const index = this.items.findIndex((item) => item.id === updated.id)
      if (index === -1) return
      this.items[index] = updated
    },
  },
})
