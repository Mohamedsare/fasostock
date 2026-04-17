-- Gestion des droits par l'owner : surcharge des permissions par utilisateur (ajout/retrait).
-- Les permissions effectives = rôle de base + overrides (granted=true ajoute, granted=false retire).

CREATE TABLE public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_id, permission_id)
);

COMMENT ON TABLE public.user_permission_overrides IS 'Surcharges de permissions par utilisateur (owner peut ajouter ou retirer des droits).';
COMMENT ON COLUMN public.user_permission_overrides.granted IS 'true = ajouter la permission, false = retirer (par rapport au rôle).';

CREATE INDEX idx_user_permission_overrides_user_company ON public.user_permission_overrides(user_id, company_id);

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Seul l''owner de l''entreprise peut gérer les overrides (via RPC en SECURITY DEFINER ; la table peut rester sans policy SELECT pour les utilisateurs normaux).
CREATE POLICY "user_permission_overrides_owner_only" ON public.user_permission_overrides
FOR ALL USING (
  company_id IN (
    SELECT ucr.company_id FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.is_active = true AND r.slug = 'owner'
  )
)
WITH CHECK (
  company_id IN (
    SELECT ucr.company_id FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.is_active = true AND r.slug = 'owner'
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;

-- RPC : liste des clés de permissions effectives d'un utilisateur (rôle + overrides). Appelable par l'owner uniquement.
CREATE OR REPLACE FUNCTION public.get_user_permission_keys(p_company_id UUID, p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_from_role TEXT[];
  v_grants TEXT[];
  v_revokes TEXT[];
  v_result TEXT[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut consulter les droits d''un utilisateur.';
  END IF;

  -- Permissions issues du rôle
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_from_role
  FROM public.user_company_roles ucr
  JOIN public.role_permissions rp ON rp.role_id = ucr.role_id
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true;

  -- Overrides : ajouts (granted = true)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_grants
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = true;

  -- Overrides : retraits (granted = false)
  SELECT COALESCE(array_agg(DISTINCT p.key), ARRAY[]::TEXT[])
  INTO v_revokes
  FROM public.user_permission_overrides o
  JOIN public.permissions p ON p.id = o.permission_id
  WHERE o.user_id = p_user_id AND o.company_id = p_company_id AND o.granted = false;

  -- Résultat = (rôle + grants) - revokes, sans doublons
  SELECT array_agg(DISTINCT k) INTO v_result
  FROM (
    SELECT unnest(v_from_role || v_grants) AS k
    EXCEPT
    SELECT unnest(v_revokes)
  ) sub;
  RETURN COALESCE(v_result, ARRAY[]::TEXT[]);
END;
$$;

COMMENT ON FUNCTION public.get_user_permission_keys(uuid, uuid) IS 'Retourne les clés de permissions effectives d''un utilisateur (rôle + overrides). Owner uniquement.';

GRANT EXECUTE ON FUNCTION public.get_user_permission_keys(uuid, uuid) TO authenticated;

-- RPC : définir une surcharge (ajouter ou retirer une permission pour un utilisateur). Owner uniquement.
CREATE OR REPLACE FUNCTION public.set_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT,
  p_granted BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_permission_id UUID;
  v_member_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits d''un utilisateur.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits via cette fonction.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'Permission inconnue : %.', p_permission_key;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    WHERE ucr.user_id = p_user_id AND ucr.company_id = p_company_id AND ucr.is_active = true
  ) INTO v_member_exists;
  IF NOT v_member_exists THEN
    RAISE EXCEPTION 'L''utilisateur n''est pas membre de cette entreprise.';
  END IF;

  INSERT INTO public.user_permission_overrides (user_id, company_id, permission_id, granted)
  VALUES (p_user_id, p_company_id, v_permission_id, p_granted)
  ON CONFLICT (user_id, company_id, permission_id)
  DO UPDATE SET granted = EXCLUDED.granted, id = public.user_permission_overrides.id;
END;
$$;

COMMENT ON FUNCTION public.set_user_permission_override(uuid, uuid, text, boolean) IS 'Ajoute (p_granted=true) ou retire (p_granted=false) une permission pour un utilisateur. Owner uniquement.';

GRANT EXECUTE ON FUNCTION public.set_user_permission_override(uuid, uuid, text, boolean) TO authenticated;

-- RPC : supprimer une surcharge (réinitialiser à la valeur du rôle).
CREATE OR REPLACE FUNCTION public.delete_user_permission_override(
  p_company_id UUID,
  p_user_id UUID,
  p_permission_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
  v_permission_id UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id
      AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Seul le propriétaire peut modifier les droits.';
  END IF;

  SELECT id INTO v_permission_id FROM public.permissions WHERE key = p_permission_key;
  IF v_permission_id IS NULL THEN RETURN; END IF;

  DELETE FROM public.user_permission_overrides
  WHERE user_id = p_user_id AND company_id = p_company_id AND permission_id = v_permission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(uuid, uuid, text) TO authenticated;
