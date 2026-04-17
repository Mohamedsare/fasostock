-- Le super admin peut envoyer des notifications aux utilisateurs (ex. owners).
-- Ces notifications s'affichent dans la partie "Notifications" de chaque utilisateur.

-- Envoyer à un utilisateur précis (super admin uniquement).
CREATE OR REPLACE FUNCTION public.admin_create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'admin_message'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_user_id IS NULL OR p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'user_id et title sont requis';
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (p_user_id, COALESCE(NULLIF(trim(p_type), ''), 'admin_message'), trim(p_title), NULLIF(trim(p_body), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_notification(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_create_notification(uuid, text, text, text) IS 'Super admin : envoie une notification à un utilisateur (visible dans son espace Notifications).';

-- Envoyer à tous les owners (un message par owner).
CREATE OR REPLACE FUNCTION public.admin_create_notification_to_owners(
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'admin_message'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_owner_id UUID;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF p_title IS NULL OR trim(p_title) = '' THEN
    RAISE EXCEPTION 'title est requis';
  END IF;
  FOR v_owner_id IN
    SELECT DISTINCT ucr.user_id
    FROM public.user_company_roles ucr
    JOIN public.roles r ON r.id = ucr.role_id
    WHERE r.slug = 'owner' AND ucr.is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body)
    VALUES (v_owner_id, COALESCE(NULLIF(trim(p_type), ''), 'admin_message'), trim(p_title), NULLIF(trim(p_body), ''));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_notification_to_owners(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.admin_create_notification_to_owners(text, text, text) IS 'Super admin : envoie une notification à tous les owners (chaque owner la voit dans Notifications).';
