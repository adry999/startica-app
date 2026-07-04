export type ModuleKey = 'pool' | 'payroll_own' | 'payroll_all'

export interface ModuleGrant {
  kindergartenId: string
  moduleKey: ModuleKey
}
