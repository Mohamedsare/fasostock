-- 00120_sync_warehouses_to_quota.sql
-- RPC appelée par le super admin après chaque changement de warehouse_quota.
-- Crée automatiquement les dépôts manquants (jusqu'au quota),
-- réactive ceux qui avaient été désactivés,
-- et désactive (sans supprimer) les dépôts en excès.
-- Le dépôt principal (is_primary = true) n'est jamais désactivé.

CREATE OR REPLACE FUNCTION public.sync_warehouses_to_quota(
  p_company_id uuid,
  p_quota       integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_i     integer;
  v_code  text;
  v_name  text;
BEGIN
  -- Nombre total de dépôts existants (actifs + inactifs)
  SELECT COUNT(*) INTO v_total
  FROM warehouses
  WHERE company_id = p_company_id;

  -- Créer les dépôts manquants
  FOR v_i IN (v_total + 1)..p_quota LOOP
    v_code := 'D' || v_i;
    v_name := CASE v_i WHEN 1 THEN 'Principal' ELSE 'Dépôt ' || v_i END;
    INSERT INTO warehouses (company_id, name, code, is_primary, is_active)
    VALUES (p_company_id, v_name, v_code, v_i = 1, true)
    ON CONFLICT (company_id, code) DO NOTHING;
  END LOOP;

  -- Réactiver les dépôts dans la plage du quota (ordre de création)
  UPDATE warehouses
  SET is_active = true
  WHERE company_id = p_company_id
    AND id IN (
      SELECT id FROM warehouses
      WHERE company_id = p_company_id
      ORDER BY created_at ASC
      LIMIT p_quota
    );

  -- Désactiver les dépôts au-delà du quota (jamais le principal)
  UPDATE warehouses
  SET is_active = false
  WHERE company_id = p_company_id
    AND is_primary = false
    AND id NOT IN (
      SELECT id FROM warehouses
      WHERE company_id = p_company_id
      ORDER BY created_at ASC
      LIMIT p_quota
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_warehouses_to_quota(uuid, integer) TO authenticated;
