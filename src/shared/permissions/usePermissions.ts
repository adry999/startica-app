import { useActorStore } from '@shared/session/actor.store'
import {
  canActorManagePoolTrainer,
  isActionAllowed,
  resolvePayrollScope,
  type PermissionAction,
  type PermissionResource,
  type PermissionSubject,
} from './permission-policy'

export function usePermissions() {
  const actorStore = useActorStore()

  // Read on every call so templates and computeds re-evaluate when the actor changes.
  function currentSubject(): PermissionSubject {
    return { actorId: actorStore.actorId, role: actorStore.role, moduleGrants: actorStore.moduleGrants }
  }

  return {
    can: (action: PermissionAction, resource: PermissionResource, target?: unknown) =>
      isActionAllowed(currentSubject(), action, resource, target),
    canManagePoolTrainer: (kindergartenId: string, trainerUserId: string) =>
      canActorManagePoolTrainer(currentSubject(), kindergartenId, trainerUserId),
    payrollScope: (kindergartenId?: string) => resolvePayrollScope(currentSubject(), kindergartenId),
  }
}
