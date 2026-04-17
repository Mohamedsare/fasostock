-- Extension pour gen_random_bytes et digest (sha256).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- RPC : créer une clé API (owner uniquement). Retourne la clé en clair une seule fois.
CREATE OR REPLACE FUNCTION public.create_api_key(p_company_id UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner boolean;
  v_key_raw text;
  v_key_prefix text;
  v_key_hash text;
  v_id uuid;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Le nom est requis';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.user_id = auth.uid() AND ucr.company_id = p_company_id AND ucr.is_active = true AND r.slug = 'owner'
  ) INTO v_owner;
  IF NOT v_owner AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  -- Générer une clé (32 octets en hex = 64 caractères)
  v_key_raw := 'fs_' || encode(gen_random_bytes(32), 'hex');
  v_key_prefix := left(v_key_raw, 12);
  v_key_hash := encode(digest(v_key_raw, 'sha256'), 'hex');
  INSERT INTO public.api_keys (company_id, name, key_prefix, key_hash, created_by)
  VALUES (p_company_id, trim(p_name), v_key_prefix, v_key_hash, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'key_raw', v_key_raw, 'key_prefix', v_key_prefix);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_api_key(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.create_api_key(uuid, text) IS 'Crée une clé API pour l''entreprise (owner). La clé en clair n''est retournée qu''une fois.';
