-- Correct first_name / last_name for children imported with the wrong order.
--
-- The roster CSV column "Nume/prenume copil" is not consistently ordered. Cross-
-- checking each child against the parent surname in the corrected workbook
-- (Evidenta_Achitari_corectata v5.xlsx, sheet "Copii") gives:
--
--     67 rows  "Surname Firstname"   -- what the import assumed, already correct
--      8 rows  "Firstname Surname"   -- imported backwards, fixed below
--     30 rows  undetermined          -- the listed parent has a different
--                                       surname, so the order cannot be derived
--                                       from the data. Left as imported
--                                       (surname-first, the dominant pattern)
--                                       and reported for human review.
--
-- Only the 8 rows confirmed by a parent-surname match are changed here; the
-- ambiguous ones are deliberately left alone rather than guessed at.

update public.children set first_name = 'Amedeia',     last_name = 'Hudic',       updated_at = now() where id = 'd4000000-0000-4000-8000-000000000001';
update public.children set first_name = 'Mark',        last_name = 'Panaghiu',    updated_at = now() where id = 'd4000000-0000-4000-8000-000000000002';
update public.children set first_name = 'Alexander',   last_name = 'Cerba',       updated_at = now() where id = 'd4000000-0000-4000-8000-000000000003';
update public.children set first_name = 'Raluca',      last_name = 'Repeah',      updated_at = now() where id = 'd4000000-0000-4000-8000-000000000004';
update public.children set first_name = 'Luca',        last_name = 'Lungu',       updated_at = now() where id = 'd4000000-0000-4000-8000-000000000005';
update public.children set first_name = 'Sophia',      last_name = 'Slivinschi',  updated_at = now() where id = 'd4000000-0000-4000-8000-000000000007';
update public.children set first_name = 'Maximilian',  last_name = 'Ursu',        updated_at = now() where id = 'd4000000-0000-4000-8000-000000000010';
update public.children set first_name = 'Stelian',     last_name = 'Baiesu',      updated_at = now() where id = 'd4000000-0000-4000-8000-000000000031';
