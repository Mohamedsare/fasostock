-- Téléphone client OBLIGATOIRE — sans casser l'existant.
--
-- Règle métier (cf. `lib/features/customers/phone.ts`) : une fiche client sans numéro
-- est inexploitable (relance de crédit, commande prête, livraison). L'interface web
-- l'impose déjà ; on verrouille ici côté base pour que les autres clients (Flutter,
-- imports, scripts) ne puissent plus créer de fiche muette.
--
-- ─── Pourquoi un TRIGGER et pas une contrainte CHECK ────────────────────────────
-- Un `CHECK ... NOT VALID` laisserait les lignes existantes tranquilles à la pose,
-- mais bloquerait ensuite TOUTE mise à jour d'une fiche ancienne sans numéro (même
-- pour corriger une simple adresse). Le trigger ci-dessous distingue les deux cas :
--   * INSERT              → numéro exigé, toujours ;
--   * UPDATE du téléphone → le nouveau numéro doit être valide (interdit de le vider) ;
--   * UPDATE autre champ  → aucune exigence : les fiches historiques restent modifiables.
-- Les clients déjà enregistrés sans téléphone ne sont donc JAMAIS bloqués ni modifiés.
--
-- Rollback :
--   DROP TRIGGER IF EXISTS customers_require_phone_trigger ON public.customers;
--   DROP FUNCTION IF EXISTS public.customers_require_phone();

-- Nombre de chiffres minimum (numéro national Burkina : 8). Doit rester aligné sur
-- `CUSTOMER_PHONE_MIN_DIGITS` côté application.
CREATE OR REPLACE FUNCTION public.customers_require_phone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  -- Mise à jour ne touchant pas au téléphone : on laisse passer (fiches historiques).
  IF TG_OP = 'UPDATE' AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
    RETURN NEW;
  END IF;

  digits := regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g');

  IF digits = '' THEN
    RAISE EXCEPTION 'Le numéro de téléphone du client est obligatoire.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF length(digits) < 8 THEN
    RAISE EXCEPTION 'Numéro de téléphone incomplet : 8 chiffres minimum.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.customers_require_phone() IS
  'Exige un téléphone (8 chiffres min) à la création d''un client et à toute '
  'modification du numéro. Les fiches antérieures sans numéro restent modifiables '
  'sur leurs autres champs — aucune donnée existante n''est touchée.';

DROP TRIGGER IF EXISTS customers_require_phone_trigger ON public.customers;
CREATE TRIGGER customers_require_phone_trigger
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE PROCEDURE public.customers_require_phone();
