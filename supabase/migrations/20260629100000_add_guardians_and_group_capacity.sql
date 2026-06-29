-- supabase/migrations/20260629100000_add_guardians_and_group_capacity.sql

-- 1. Add capacity column to groups (nullable, set per-group)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS capacity integer;

-- 2. Create guardians table
CREATE TABLE IF NOT EXISTS public.guardians (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  child_id        uuid        NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  kindergarten_id uuid        NOT NULL REFERENCES public.kindergartens(id),
  first_name      text        NOT NULL,
  last_name       text        NOT NULL,
  email           text,
  phone           text,
  relationship    text        NOT NULL DEFAULT 'guardian',
  is_primary      boolean     NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid        REFERENCES public.users(id),
  updated_by      uuid        REFERENCES public.users(id),
  deleted_at      timestamptz
);

-- 3. Enable RLS
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

-- 4. updated_at trigger — reuse the existing set_updated_at() function
CREATE TRIGGER set_updated_at_guardians
  BEFORE UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. audit_logs trigger — reuse the existing write_audit_log() function
CREATE TRIGGER audit_guardians
  AFTER INSERT OR UPDATE OR DELETE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();

-- 6. RLS policies
CREATE POLICY "guardians: read own kindergarten"
  ON public.guardians FOR SELECT TO authenticated
  USING (
    kindergarten_id IN (
      SELECT kindergarten_id FROM public.user_kindergartens WHERE user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );

CREATE POLICY "guardians: insert own kindergarten"
  ON public.guardians FOR INSERT TO authenticated
  WITH CHECK (
    kindergarten_id IN (
      SELECT kindergarten_id FROM public.user_kindergartens WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "guardians: update own kindergarten"
  ON public.guardians FOR UPDATE TO authenticated
  USING (
    kindergarten_id IN (
      SELECT kindergarten_id FROM public.user_kindergartens WHERE user_id = auth.uid()
    )
  );
