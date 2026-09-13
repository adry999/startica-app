# billing

Invoices of one kindergarten: list, database-side summary, mark as paid. Source of the payable-invoice list that `payments` consumes.

## Public API (`index.ts`)

| Export | Used by |
|---|---|
| `createBillingService(client)` | `src/plugins/module-dependencies.ts` |
| `billingDependenciesKey` | `src/plugins/module-dependencies.ts` |

Routed page: `pages/BillingListPage.vue`, imported only by `src/pages/billing.vue`.

## Ports

- **Provides:** `BillingService.listPayableInvoices`, bound in `src/plugins/module-dependencies.ts` as the `ListPayableInvoices` port of `payments`. It returns live issued, overdue and paid invoices, the same set the `payments_invoice_payable` trigger accepts; `markInvoicePaid` settles only issued and overdue ones.
- **Requires** (`BillingDependencies`): `billingService`, `readCurrentActorId`.

## Dependencies

`@core/errors/app-error`, `@core/async/latest-request`, `@core/supabase/types`, `@shared/types/*`, `@shared/session/tenant.store`, `@shared/composables/useAppErrorMessage`. No other module.

## Events

None published or consumed.

## Known limits

- `listInvoices` is unpaginated; PostgREST returns at most 1000 rows. The summary is a Postgres aggregate (`invoice_summary`) and stays correct.
- `paid_at` is taken from the client clock.
