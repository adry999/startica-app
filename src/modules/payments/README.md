# payments

Payments recorded against a kindergarten's invoices: list, record, confirm a pending payment.

## Public API (`index.ts`)

| Export | Used by |
|---|---|
| `createPaymentsService(client)` | `src/plugins/module-dependencies.ts` |
| `paymentsDependenciesKey` | `src/plugins/module-dependencies.ts` |

Routed page: `pages/PaymentsListPage.vue`, imported only by `src/pages/payments.vue`.

## Ports

**Requires** (`PaymentsDependencies`):

- `paymentsService`
- `listPayableInvoices: ListPayableInvoices` — implemented by `billing`, bound in `src/plugins/module-dependencies.ts`. Payments never imports billing.
- `readCurrentActorId`

## Dependencies

`@core/errors/app-error`, `@core/async/latest-request`, `@core/supabase/types`, `@shared/schemas/payment.schema`, `@shared/types/*`, `@shared/session/tenant.store`, `@shared/composables/useAppErrorMessage`. No other module.

## Events

None. Confirming a payment does not settle its invoice — that business rule does not exist yet. When it is decided, publish `payments.confirmed` (decision D5 in `.claude/skills/project-conventions/SKILL.md`).

## Database rules

- The `payments_invoice_payable` trigger accepts a payment only for a live issued, overdue or paid invoice. `recordPayment` maps its `23514` to the refusal `invoice_not_accepting_payments`.
- KPI cards read the `payment_summary` aggregate, refreshed after every recorded or confirmed payment.

## Known limits

- `listPayments` is unpaginated; PostgREST returns at most 1000 rows. The summary stays correct.
- Amounts are formatted as RON for every kindergarten.
