-- Notifications in-app pour les propriétaires : ventes, annulations, ruptures de stock, connexion employé.
-- Les push Web sont déclenchés par l’app (route /api/push/notify-company-owners) après ces événements,
-- ou via un Database Webhook Supabase sur public.notifications si vous le configurez.

CREATE OR REPLACE FUNCTION public.owner_events_notify_company_owners(
  p_company_id uuid,
  p_type text,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  v_type text := COALESCE(NULLIF(trim(p_type), ''), 'owner_event');
  v_title text := trim(p_title);
  v_body text := NULLIF(trim(p_body), '');
BEGIN
  IF p_company_id IS NULL OR v_title IS NULL OR v_title = '' THEN
    RETURN;
  END IF;
  FOR oid IN
    SELECT DISTINCT ucr.user_id
    FROM public.user_company_roles ucr
    INNER JOIN public.roles r ON r.id = ucr.role_id
    WHERE ucr.company_id = p_company_id
      AND ucr.is_active = true
      AND r.slug = 'owner'
  LOOP
    INSERT INTO public.notifications (user_id, company_id, type, title, body)
    VALUES (oid, p_company_id, v_type, v_title, v_body);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.owner_events_notify_company_owners(uuid, text, text, text) IS
  'Insère une notification in-app pour chaque propriétaire actif de l’entreprise (SECURITY DEFINER).';

-- Vente enregistrée (statut completed à l’insertion)
CREATE OR REPLACE FUNCTION public.trg_notify_owners_on_sale_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  SELECT s.name INTO v_store FROM public.stores s WHERE s.id = NEW.store_id;
  PERFORM public.owner_events_notify_company_owners(
    NEW.company_id,
    'sale_completed',
    'Nouvelle vente',
    format(
      '%s · %s · total %s FCFA',
      NEW.sale_number,
      COALESCE(v_store, 'Magasin'),
      trim(to_char(COALESCE(NEW.total, 0), '99999999999999999999D99'))
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_owners_on_sale_insert ON public.sales;
CREATE TRIGGER trg_notify_owners_on_sale_insert
  AFTER INSERT ON public.sales
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_notify_owners_on_sale_insert();

-- Annulation d’une vente complétée
CREATE OR REPLACE FUNCTION public.trg_notify_owners_on_sale_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (OLD.status = 'completed' AND NEW.status = 'cancelled') THEN
    RETURN NEW;
  END IF;
  PERFORM public.owner_events_notify_company_owners(
    NEW.company_id,
    'sale_cancelled',
    'Vente annulée',
    format('La vente %s a été annulée.', OLD.sale_number)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_owners_on_sale_cancelled ON public.sales;
CREATE TRIGGER trg_notify_owners_on_sale_cancelled
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_notify_owners_on_sale_cancelled();

-- Rupture : passage d’un stock > 0 à 0
CREATE OR REPLACE FUNCTION public.trg_notify_owners_on_stockout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_store text;
  v_product text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.quantity IS NOT DISTINCT FROM OLD.quantity THEN
    RETURN NEW;
  END IF;
  IF NOT (COALESCE(OLD.quantity, 0) > 0 AND COALESCE(NEW.quantity, 0) <= 0) THEN
    RETURN NEW;
  END IF;

  SELECT s.company_id, s.name INTO v_company_id, v_store
  FROM public.stores s
  WHERE s.id = NEW.store_id;

  SELECT p.name INTO v_product
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.owner_events_notify_company_owners(
    v_company_id,
    'stockout',
    'Rupture de stock',
    format('%s · %s (stock à 0)', COALESCE(v_product, 'Produit'), COALESCE(v_store, 'Magasin'))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_owners_on_stockout ON public.store_inventory;
CREATE TRIGGER trg_notify_owners_on_stockout
  AFTER UPDATE OF quantity ON public.store_inventory
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_notify_owners_on_stockout();

-- Connexion : employés (sans rôle owner sur l’entreprise) — appelée depuis l’app après succès auth.
CREATE OR REPLACE FUNCTION public.staff_login_notify_company_owners()
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  rec record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT NULLIF(trim(full_name), '') INTO v_name FROM public.profiles WHERE id = v_uid;
  IF v_name IS NULL THEN
    v_name := 'Un collaborateur';
  END IF;

  FOR rec IN
    SELECT ucr.company_id
    FROM public.user_company_roles ucr
    WHERE ucr.user_id = v_uid
      AND ucr.is_active = true
    GROUP BY ucr.company_id
    HAVING NOT EXISTS (
      SELECT 1
      FROM public.user_company_roles u2
      INNER JOIN public.roles r2 ON r2.id = u2.role_id
      WHERE u2.user_id = v_uid
        AND u2.company_id = ucr.company_id
        AND u2.is_active = true
        AND r2.slug = 'owner'
    )
  LOOP
    PERFORM public.owner_events_notify_company_owners(
      rec.company_id,
      'staff_sign_in',
      'Connexion équipe',
      format('%s s’est connecté.', v_name)
    );
    RETURN NEXT rec.company_id;
  END LOOP;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_login_notify_company_owners() TO authenticated;

COMMENT ON FUNCTION public.staff_login_notify_company_owners() IS
  'Après connexion : notifie les owners des entreprises où l’utilisateur n’est pas owner. Retourne les company_id concernées (pour push côté app).';

REVOKE ALL ON FUNCTION public.trg_notify_owners_on_sale_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_notify_owners_on_sale_cancelled() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_notify_owners_on_stockout() FROM PUBLIC;
