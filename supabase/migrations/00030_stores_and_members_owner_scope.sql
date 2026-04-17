-- 1) Stores : un utilisateur ne voit que les boutiques auxquelles il est assigné (ou toutes si owner/manager).
--    Avant : tout membre de l'entreprise voyait toutes les boutiques.
DROP POLICY IF EXISTS "stores_select" ON public.stores;
CREATE POLICY "stores_select" ON public.stores FOR SELECT USING (
  is_super_admin() OR id IN (SELECT * FROM public.current_user_store_ids(company_id))
);

-- 2) user_company_roles DELETE : seul le propriétaire (owner) peut retirer un membre, et ne peut pas se retirer lui-même.
DROP POLICY IF EXISTS "user_company_roles_delete" ON public.user_company_roles;
CREATE POLICY "user_company_roles_delete" ON public.user_company_roles FOR DELETE USING (
  user_id <> auth.uid()
  AND company_id IN (
    SELECT ucr.company_id FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = user_company_roles.company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  )
);

-- 3) RPC : retirer un membre de l'entreprise (supprime ses assignations boutique puis son rôle). Réservé au owner.
CREATE OR REPLACE FUNCTION public.remove_company_member(p_ucr_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_is_owner boolean;
BEGIN
  SELECT user_id, company_id INTO v_row
  FROM public.user_company_roles
  WHERE id = p_ucr_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Membre introuvable.';
  END IF;
  IF v_row.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous retirer vous-même.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = v_row.company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut retirer un membre.';
  END IF;
  DELETE FROM public.user_store_assignments
  WHERE user_id = v_row.user_id AND company_id = v_row.company_id;
  DELETE FROM public.user_company_roles WHERE id = p_ucr_id;
END;
$$;

COMMENT ON FUNCTION public.remove_company_member(uuid) IS 'Retire un membre de l''entreprise (owner uniquement). Supprime ses assignations boutique puis son rôle.';
GRANT EXECUTE ON FUNCTION public.remove_company_member(uuid) TO authenticated;
