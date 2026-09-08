-- Add a 'pool' expense category.
--
-- The operational expense ledger (Evidenta_Achitari_corectata v5.xlsx, sheet
-- "Cheltuieli") splits every cost into "General" and "Bazin" (the swimming
-- pool), and Bazin is the larger of the two by row count. The Pool module
-- already exists in the product, so this earns its own category rather than
-- being flattened into 'other'.
--
-- Kept in its own migration: Postgres will not allow a new enum value to be
-- used in the same transaction that adds it, and the next migration inserts
-- rows using it.

alter type expense_category add value if not exists 'pool';
