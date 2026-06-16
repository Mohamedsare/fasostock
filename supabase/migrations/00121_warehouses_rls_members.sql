-- 00121_warehouses_rls_members.sql
-- Les membres avec accès magasin (magasinier, stock manager…) doivent
-- pouvoir lire la liste des dépôts pour afficher le sélecteur.
-- Le owner était déjà couvert par warehouses_select_owner (00118).

DROP POLICY IF EXISTS warehouses_select_member ON public.warehouses;

CREATE POLICY warehouses_select_member ON public.warehouses
  FOR SELECT TO authenticated
  USING (
    public.user_is_company_owner(company_id)
    OR public.user_can_manage_company_warehouse(company_id)
  );

-- Remplace l'ancienne politique owner-only (si elle existe encore séparément)
DROP POLICY IF EXISTS warehouses_select_owner ON public.warehouses;
