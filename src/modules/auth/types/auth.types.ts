import type { Actor } from '@shared/session/actor.types'

export type { UserRole, UserStatus } from '@shared/session/actor.types'

export type AuthUser = Actor

export interface LoginCredentials {
  email: string
  password: string
}
