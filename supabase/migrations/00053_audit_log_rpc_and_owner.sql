-- Journal d'audit : droit owner + RPC pour insérer des entrées.
-- Owner doit pouvoir voir l'audit (accordable aussi aux autres via overrides).
INSERT INTO public.permissions (id, key)
SELECT uuid_generate_v4(), 'audit.view'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = 'audit.view');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner' AND p.key = 'audit.view'
ON CONFLICT DO NOTHING;

-- RPC : insérer une entrée d'audit (appelable par tout membre de l'entreprise pour son company_id).
CREATE OR REPLACE FUNCTION public.log_audit(
  p_company_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_company_id IS NULL OR p_action IS NULL OR p_entity_type IS NULL THEN
    RAISE EXCEPTION 'company_id, action and entity_type are required';
  END IF;
  -- Vérifier que l'utilisateur appartient à l'entreprise
  IF NOT (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id AND ucr.is_active = true
  )) THEN
    RAISE EXCEPTION 'Access denied: not a member of this company';
  END IF;
  INSERT INTO public.audit_logs (company_id, store_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_company_id, p_store_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_old_data, p_new_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) IS 'Enregistre une action dans le journal d''audit (réservé aux membres de l''entreprise).';

GRANT EXECUTE ON FUNCTION public.log_audit(uuid, text, text, uuid, uuid, jsonb, jsonb) TO authenticated;

-- Politique SELECT : seuls les utilisateurs avec audit.view voient les logs de leur entreprise.
DROP POLICY IF EXISTS "audit_logs_select" ON public.audit_logs;
CREATE POLICY "audit_logs_select" ON public.audit_logs FOR SELECT USING (
  is_super_admin()
  OR (
    company_id IS NOT NULL
    AND company_id IN (SELECT * FROM current_user_company_ids())
    AND (
      EXISTS (
        SELECT 1 FROM public.user_company_roles ucr
        JOIN public.roles r ON r.id = ucr.role_id
        WHERE ucr.user_id = auth.uid() AND ucr.company_id = audit_logs.company_id AND ucr.is_active = true
        AND r.slug = 'owner'
      )
      OR 'audit.view' = ANY (public.get_my_permission_keys(company_id))
    )
  )
);
