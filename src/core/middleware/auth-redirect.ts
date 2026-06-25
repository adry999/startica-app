export interface AuthRedirectInput {
  isAuthenticated: boolean
  isPublic: boolean
  isGuestOnly: boolean
  fullPath: string
}

export function resolveAuthRedirect(input: AuthRedirectInput): string | null {
  if (input.isGuestOnly && input.isAuthenticated) {
    return '/'
  }
  if (!input.isPublic && !input.isAuthenticated) {
    return `/login?redirect=${encodeURIComponent(input.fullPath)}`
  }
  return null
}
