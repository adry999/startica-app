# shared/ — Reusable, NO business logic

- `ui/` — design system: `Base*` components (BaseButton, BaseInput, BaseModal, BaseTable, BaseCard, BaseBadge...). Props in, events out. Know nothing about children/groups.
- `composables/` — useToast, usePagination, useDebounce, useConfirm...
- `utils/` — formatDate, formatPhone, getAge, getZodiac, validateNationalId...
- `types/` — ApiResponse, PaginatedResponse, Role, shared enums.
- `schemas/` — Zod schemas (shared client + server validation).
