-- Créer une boutique avec code automatique (B1, B2, B3...).
-- Le code est généré côté serveur, non saisi par l'utilisateur.

CREATE OR REPLACE FUNCTION public.create_store(
  p_company_id uuid,
  p_name text,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_is_primary boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota int;
  v_count int;
  v_next_num int;
  v_next_code text;
  v_store_id uuid;
  v_store jsonb;
BEGIN
  SELECT store_quota INTO v_quota FROM public.companies WHERE id = p_company_id;
  IF v_quota IS NULL THEN
    RAISE EXCEPTION 'Entreprise introuvable';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.stores WHERE company_id = p_company_id;
  IF v_count >= v_quota THEN
    RAISE EXCEPTION 'Quota de boutiques atteint (% boutique(s)). Demandez une augmentation.', v_quota;
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN code ~ '^B[0-9]+$' THEN CAST(SUBSTRING(code FROM 2) AS INTEGER) ELSE 0 END
  ), 0) + 1 INTO v_next_num
  FROM public.stores WHERE company_id = p_company_id;
  v_next_code := 'B' || v_next_num::text;

  INSERT INTO public.stores (company_id, name, code, address, phone, email, description, is_primary, is_active)
  VALUES (p_company_id, p_name, v_next_code, p_address, p_phone, p_email, p_description, COALESCE(p_is_primary, false), true)
  RETURNING id INTO v_store_id;

  SELECT to_jsonb(s) INTO v_store
  FROM public.stores s WHERE s.id = v_store_id;

  RETURN v_store;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store(uuid, text, text, text, text, text, boolean) TO authenticated;
