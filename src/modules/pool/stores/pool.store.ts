import { defineStore } from 'pinia'
import { useSupabaseClient } from '~/core/supabase/client'
import { useAuthStore } from '~/modules/auth/stores/auth.store'
import * as poolService from '../services/pool.service'
import type { TrainerAvailability, SchedulePattern, PoolSession, SessionParticipant } from '../types/pool.types'

export const usePoolStore = defineStore('pool', {
  state: () => ({
    availability: [] as TrainerAvailability[],
    patterns: [] as SchedulePattern[],
    sessions: [] as PoolSession[],
    participants: {} as Record<string, SessionParticipant[]>,
    loading: false,
    error: null as string | null,
  }),
  actions: {
    async fetchAvailability(kindergartenId: string, trainerUserId: string) {
      this.loading = true
      this.error = null
      const result = await poolService.listAvailability(useSupabaseClient(), kindergartenId, trainerUserId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.availability = result.data
    },
    async addAvailability(input: Parameters<typeof poolService.addAvailability>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.addAvailability(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.availability.push(result.data)
      return true
    },
    async removeAvailability(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.removeAvailability(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.availability = this.availability.filter(a => a.id !== id)
      return true
    },
    async fetchPatterns(kindergartenId: string, trainerUserId?: string) {
      this.loading = true
      this.error = null
      const result = await poolService.listPatterns(useSupabaseClient(), kindergartenId, trainerUserId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.patterns = result.data
    },
    async createPattern(input: Parameters<typeof poolService.createPattern>[1]) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.createPattern(useSupabaseClient(), input, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.patterns.push(result.data)
      return true
    },
    async deletePattern(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.deletePattern(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.patterns = this.patterns.filter(p => p.id !== id)
      return true
    },
    async fetchSessions(kindergartenId: string) {
      this.loading = true
      this.error = null
      const result = await poolService.listSessions(useSupabaseClient(), kindergartenId)
      this.loading = false
      if (!result.success) { this.error = result.error; return }
      this.sessions = result.data
    },
    async cancelSession(id: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.cancelSession(useSupabaseClient(), id, actorId)
      if (!result.success) { this.error = result.error; return false }
      const idx = this.sessions.findIndex(s => s.id === id)
      if (idx !== -1) this.sessions[idx]!.status = 'cancelled'
      return true
    },
    async fetchParticipants(sessionId: string) {
      const result = await poolService.listParticipants(useSupabaseClient(), sessionId)
      if (!result.success) { this.error = result.error; return }
      this.participants[sessionId] = result.data
    },
    async addParticipant(sessionId: string, childId: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.addParticipant(useSupabaseClient(), sessionId, childId, actorId)
      if (!result.success) { this.error = result.error; return false }
      if (!this.participants[sessionId]) this.participants[sessionId] = []
      this.participants[sessionId]!.push(result.data)
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) session.participantCount += 1
      return true
    },
    async removeParticipant(sessionId: string, participantId: string) {
      const actorId = useAuthStore().user?.id ?? ''
      const result = await poolService.removeParticipant(useSupabaseClient(), participantId, actorId)
      if (!result.success) { this.error = result.error; return false }
      this.participants[sessionId] = (this.participants[sessionId] ?? []).filter(p => p.id !== participantId)
      const session = this.sessions.find(s => s.id === sessionId)
      if (session) session.participantCount -= 1
      return true
    },
  },
})
