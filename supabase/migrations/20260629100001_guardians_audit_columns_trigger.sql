-- Add missing audit-columns trigger to guardians (consistent with all other business tables)
CREATE TRIGGER trg_guardians_audit_columns
  BEFORE INSERT OR UPDATE ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_columns();
