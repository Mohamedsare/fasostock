-- Align with 00013: explicit SELECT on stores so authenticated users can list stores.
-- Without this, some setups may deny access to stores (empty list after login).
GRANT SELECT ON public.stores TO anon, authenticated;
