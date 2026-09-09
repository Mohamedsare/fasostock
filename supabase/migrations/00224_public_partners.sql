-- Partenaires affichés sur la page publique (landing).

CREATE TABLE IF NOT EXISTS public.public_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.public_partners IS 'Partenaires vitrine landing publique FasoStock.';

ALTER TABLE public.public_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_partners_select_public ON public.public_partners;
CREATE POLICY public_partners_select_public
ON public.public_partners
FOR SELECT
TO anon, authenticated
USING (is_active = true OR public.is_super_admin());

DROP POLICY IF EXISTS public_partners_insert_super_admin ON public.public_partners;
CREATE POLICY public_partners_insert_super_admin
ON public.public_partners
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS public_partners_update_super_admin ON public.public_partners;
CREATE POLICY public_partners_update_super_admin
ON public.public_partners
FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS public_partners_delete_super_admin ON public.public_partners;
CREATE POLICY public_partners_delete_super_admin
ON public.public_partners
FOR DELETE
TO authenticated
USING (public.is_super_admin());

GRANT SELECT ON public.public_partners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.public_partners TO authenticated;

CREATE INDEX IF NOT EXISTS idx_public_partners_active_sort
  ON public.public_partners(is_active, sort_order, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at_public_partners ON public.public_partners;
CREATE TRIGGER set_updated_at_public_partners
BEFORE UPDATE ON public.public_partners
FOR EACH ROW
EXECUTE PROCEDURE public.set_updated_at();
