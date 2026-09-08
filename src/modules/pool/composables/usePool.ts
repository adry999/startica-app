import { computed } from 'vue'
import { usePoolStore } from '../stores/pool.store'

export function usePool() {
  const store = usePoolStore()
  return {
    availability:  computed(() => store.availability),
    patterns:      computed(() => store.patterns),
    sessions:      computed(() => store.sessions),
    participants:  computed(() => store.participants),
    loading:       computed(() => store.loading),
    error:         computed(() => store.error),
    fetchAvailability:  (kindergartenId: string, trainerUserId: string) => store.fetchAvailability(kindergartenId, trainerUserId),
    addAvailability:    (input: Parameters<typeof store.addAvailability>[0]) => store.addAvailability(input),
    removeAvailability: (id: string) => store.removeAvailability(id),
    fetchPatterns:      (kindergartenId: string, trainerUserId?: string) => store.fetchPatterns(kindergartenId, trainerUserId),
    createPattern:      (input: Parameters<typeof store.createPattern>[0]) => store.createPattern(input),
    deletePattern:      (id: string) => store.deletePattern(id),
    fetchSessions:      (kindergartenId: string) => store.fetchSessions(kindergartenId),
    cancelSession:      (id: string) => store.cancelSession(id),
    fetchParticipants:  (sessionId: string) => store.fetchParticipants(sessionId),
    addParticipant:     (sessionId: string, childId: string) => store.addParticipant(sessionId, childId),
    removeParticipant:  (sessionId: string, participantId: string) => store.removeParticipant(sessionId, participantId),
  }
}
