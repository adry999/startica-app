# Startica — Data Import & Provenance, 2026-09-08

What is in the linked Supabase project, where it came from, what was deliberately
left out, and the decisions still needed. Companion: `Startica_Audit_2026-09-08.md`.

---

## 1. Current contents of the linked database

| Table | Rows | Source |
|---|---|---|
| `kindergartens` | 1 | created by migration (**placeholder name**) |
| `users` (educators) | 4 | invented demo staff |
| `groups` | 4 | invented demo groups |
| `children` | 104 | real roster |
| `guardians` | 104 | real, primary contact only |
| `expenses` | 1201 | real ledger |
| `payments` | 0 | **not imported — see §5** |
| `invoices` | 0 | none exist |

---

## 2. Source files

| File | Used for |
|---|---|
| `Downloads/Lista_copiilor_inmatriculati.csv` | the 104 imported children + guardians |
| `Downloads/tabel startica/Lista_copiilor_inmatriculati.xlsx` | cross-check (older, less complete) |
| `Downloads/tabel startica/Fisiere_Excel/Evidenta_Achitari_corectata v5.xlsx` | expenses; name-order verification; payments (not imported) |

The `v5` workbook is the most authoritative and contains seven sheets: `Cheltuieli`,
`Dashboard`, `Copii`, `Achitari`, `Grupe`, `Situatie Plati`, `De verificat`.

---

## 3. Children — how the roster was mapped

- **`birth_date`** parsed from `DD.MM.YYYY`.
- **Group** assigned from age on 2026-09-08 against each demo group's age range
  (2-3 Buburuze, 3-4 Fluturași, 4-5 Albinuțe, 5-6 Steluțe). 79 of 104 fell inside
  2–6; the other 25 (ages 0, 1, 7, 8) were left unassigned rather than forced.
- **Guardians** — only the primary contact was imported. Six source rows list a
  second parent after a `/` which was not split out.
- **`Varsta` from the source is deliberately not stored** — age is derived from
  `birth_date`, per the project rules.

### 3.1 Name order is inconsistent in the source

The CSV column *"Nume/prenume copil"* is **not** consistently ordered. Cross-checking
each child against the parent surname in the `v5` workbook's `Copii` sheet:

| Order in source | Count | Status |
|---|---|---|
| `Surname Firstname` | 67 | what the import assumed — correct |
| `Firstname Surname` | **8** | imported backwards → **fixed** in `20260908000014` |
| undetermined | 30 | mother has a different surname — not derivable |

The 30 undetermined rows are stored **surname-first** (the dominant 67:8 pattern) and
were deliberately not guessed at. Examples needing a human eye: *"Cacean Amelia"*
(parent Bordian Elena), *"Leia Calmis"* (parent Evghenia Tiganova),
*"David Vajnik (cresa)"*, *"Lilly-Celine Cotirau"*.

### 3.2 Rows needing correction at source

- **Contract 80 — Ursachi Voicu — NOT IMPORTED.** Birth date reads **29.10.2026**,
  six months *after* the child started attending (04.05.2026). `public.children`
  enforces `birth_date <= CURRENT_DATE`, so Postgres rejects it. The same bad date
  is present in **all three** source files including `corectata v5`, and Excel's own
  age formula returns `#NUM!` on that row — so it is a genuine source error, not an
  export artifact. **This is the only reason the count is 104 and not 105.**
- **Contract 25** — born 22.03.2018 (age 8, above kindergarten range). Imported, left
  unassigned.

### 3.3 Muradu — resolved

The CSV and the older XLSX disagreed. The `v5` workbook settles it: **two separate
children**, Patricia born 2025-10-20 and Letizia born 2020-09-17 — matching the CSV
that was imported. Nothing to change.

---

## 4. Expenses — imported in full

Sheet `Cheltuieli`, detail columns (date / category / amount).

- **1201 rows**, 2024-11-20 → 2026-08-25, totalling **1,564,059 lei**.
- Verified against source: row count, both category counts (383 General / 818 Bazin)
  and the total all match exactly.
- `General` → `other`; `Bazin` → new `pool` category.
- Inserted as `approved` — these are historical actuals, not pending requests.
- Row ids are derived from source row position, so the migration is idempotent.

This sheet was importable because it is complete: every row has a valid date,
category and amount, none are flagged for verification, and none need a child link.

---

## 5. Deliberately NOT imported

### 5.1 Payments (`Achitari`, 810 rows)

A reconciliation in progress, not a ledger:

| `Status verificare` | Rows |
|---|---|
| `DE VERIFICAT - copil neasociat` | 398 |
| *(blank)* | 319 |
| `POTRIVIRE AUTOMATĂ - verifică` | 77 |
| **`OK`** | **6** |
| other `DE VERIFICAT - …` | 10 |

Only **232 of 810** carry a child id. Amounts span 111 → 133,225 lei (total
10,105,096), which look like daily takings rather than per-child fees.

There is also a **schema blocker**: `payments.invoice_id` is `NOT NULL` and no
invoices exist. Importing would require making it nullable, which is arguably the
right model for cash receipts but is a deliberate design change.

### 5.2 Groups

The `Grupe` sheet lists **10** groups, but children in `Copii` reference **27**
different group numbers (1–30). Per-group counts disagree between the two sheets
(e.g. grupa 10: `Grupe` says 7, `Copii` says 13). The `Grupe` sheet has no real
names ("Grupa 1"…), an educator column that is `34` on every row, and empty
capacity / programme / fee. The workbook's own check column marks assignments
*"grupa N propusă automat — confirmă"*.

The 4 groups currently in the database are **invented placeholders**, not real.

### 5.3 Monthly fee

Column *"Taxa lunară (lei)"* is populated on only **47 of 105** rows and holds
values like 14, 15, 22 — not plausible lei amounts. *"Zi scadență"* is empty on all
105. The workbook flags many rows *"taxa lunară trebuie completată"*. There is also
**no column on `children`** to store a fee or due day yet.

---

## 6. Decisions needed

1. **Contract 80** — what is Ursachi Voicu's real birth year? Day/month `29.10`
   look right. One answer unblocks the 105th child.
2. **Name order** — for the 30 undetermined rows, is surname-first correct, or
   should they be reviewed individually?
3. **Groups** — are the group numbers in `Copii` (1–30) authoritative, and what are
   the real group names, educators and capacities? The `Grupe` sheet cannot answer
   this.
4. **Monthly fee** — what unit is *"Taxa lunară"* in, and should `children` gain
   `monthly_fee` / `due_day` columns?
5. **Payments** — import the 232 child-linked rows and leave the other 578 out, or
   wait until the reconciliation is finished? Either way `payments.invoice_id` needs
   to become nullable.
6. **Kindergarten identity** — real name, address and city (currently the
   placeholder "Gradinita Startica", Chișinău).

---

## 7. Reproducing / extending an import

- Parse XLSX without extra dependencies: unzip the file and read
  `xl/worksheets/sheetN.xml` + `xl/sharedStrings.xml`. **The `v5` workbook uses the
  `x:` namespace prefix** (`<x:row>`, `<x:c>`), so a parser must tolerate both forms.
- Dates are Excel serials: `Date.UTC(1899, 11, 30) + serial * 86400000`.
- Write generated SQL to a migration file rather than executing ad hoc, so the
  import stays in the audit trail and is idempotent (`on conflict do nothing`, ids
  derived from source keys).
