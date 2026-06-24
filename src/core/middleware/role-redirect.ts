export function resolveRoleRedirect(userRole: string | null, allowedRoles: string[] | undefined): string | null {
  if (!allowedRoles || allowedRoles.length === 0) return null
  if (!userRole || !allowedRoles.includes(userRole)) return '/'
  return null
}
