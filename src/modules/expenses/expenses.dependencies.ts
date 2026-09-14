import { inject, type InjectionKey } from 'vue'
import type { ExpensesDependencies } from './types/expenses.types'

export const expensesDependenciesKey: InjectionKey<ExpensesDependencies> = Symbol('expensesDependencies')

export function injectExpensesDependencies(): ExpensesDependencies {
  const dependencies = inject(expensesDependenciesKey)
  if (!dependencies) {
    throw new Error('Expenses dependencies are missing. Provide them in src/plugins/module-dependencies.ts.')
  }
  return dependencies
}
