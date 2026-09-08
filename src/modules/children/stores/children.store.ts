import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useStoreAction } from '~/shared/composables/useStoreAction'
import * as childrenService from '../services/children.service'
import type { Child } from '../types/children.types'
import type { Database } from '~/core/supabase/types'

type ChildStatus = Database['public']['Enums']['child_status']

export const useChildrenStore = defineStore('children', {
  state: () => ({
    items: [] as Child[],
    groupChildren: [] as Child[],
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchByGroup(groupId: string) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => childrenService.listChildrenByGroup(useSupabaseClient(), groupId),
        (data) => { this.groupChildren = data },
      )
    },
    async fetchAll(kindergartenId: string) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => childrenService.listChildren(useSupabaseClient(), kindergartenId),
        (data) => { this.items = data },
      )
    },
    async fetchById(id: string) {
      this.loading = true
      this.error = null
      try {
        const result = await childrenService.getChild(useSupabaseClient(), id)
        if (!result.success) {
          this.error = result.error
          return null
        }
        const existing = this.items.findIndex(c => c.id === id)
        if (existing !== -1) this.items[existing] = result.data
        return result.data
      } finally {
        this.loading = false
      }
    },
    async create(input: Parameters<typeof childrenService.createChild>[1]) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => childrenService.createChild(useSupabaseClient(), input),
        (data) => { this.items.unshift(data) },
      )
    },
    async update(id: string, input: Parameters<typeof childrenService.updateChild>[2]) {
      const withLoading = useStoreAction(this)
      return withLoading(
        () => childrenService.updateChild(useSupabaseClient(), id, input),
        (data) => {
          const idx = this.items.findIndex(c => c.id === id)
          if (idx !== -1) this.items[idx] = data
        },
      )
    },
    async setStatus(id: string, status: ChildStatus) {
      this.loading = true
      this.error = null
      try {
        const result = await childrenService.setChildStatus(useSupabaseClient(), id, status)
        if (!result.success) {
          this.error = result.error
          return false
        }
        const idx = this.items.findIndex(c => c.id === id)
        if (idx !== -1) this.items[idx]!.status = status
        return true
      } finally {
        this.loading = false
      }
    },
  },
})
