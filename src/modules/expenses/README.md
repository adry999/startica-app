# expenses

Operational costs of one kindergarten: list, database-side summary, record a draft, approve or reject a draft.

## Public API (`index.ts`)

| Export | Used by |
|---|---|
| `createExpensesService(client)` | `src/plugins/module-dependencies.ts` |
| `expensesDependenciesKey` | `src/plugins/module-dependencies.ts` |

Routed page: `pages/ExpensesListPage.vue`, imported only by `src/pages/expenses.vue`.

## Ports

**Requires** (`ExpensesDependencies`): `expensesService`, `readCurrentActorId`.

## Dependencies

`@core/errors/app-error`, `@core/async/latest-request`, `@core/supabase/types`, `@shared/schemas/expense.schema`, `@shared/types/*`, `@shared/session/tenant.store`, `@shared/composables/useAppErrorMessage`, `@shared/composables/useLocaleFormat`. No other module.

## Rules

- Only a live `draft` of the selected kindergarten can be approved or rejected. The update filters kindergarten, status and `deleted_at`; no matching row returns the refusal `expense_not_draft`.
- A rejection needs a trimmed reason of 1–500 characters (`expenseRejectionSchema`).
- Totals come from the `expense_summary` aggregate and refresh after every recorded, approved or rejected expense.

## Events

None published or consumed.

## Known limits

- `listExpenses` is unpaginated; PostgREST returns at most 1000 rows. Money totals and the drafts card both come from the database (`expense_summary` and an exact head count), so neither is capped by the loaded list.
- Amounts are formatted as RON for every kindergarten.
