-- Rattrapage : rattache une fiche client aux ventes d'engins EXISTANTES à SOLDE DÛ,
-- afin qu'elles apparaissent et se gèrent dans la page « Crédit » (comme les nouvelles
-- ventes d'engins à crédit — cf. resolveEngineCustomerId dans lib/features/engine-sales/api.ts).
--
-- Règles (identiques au runtime) :
--   • Uniquement les ventes sale_kind='engine', status='completed', sans client (customer_id IS NULL),
--     et avec un reste dû > 0 (total − encaissements réels, hors lignes 'other').
--   • Dédoublonnage par TÉLÉPHONE EXACT (même entreprise) ; sinon création d'une nouvelle fiche.
--   • Ventes payées comptant → aucun client rattaché.
--
-- Idempotent : ne traite que les ventes encore sans client → ré-exécutable sans effet ni doublon.

DO $$
DECLARE
  r record;
  v_phone text;
  v_customer_id uuid;
BEGIN
  FOR r IN
    SELECT
      s.id             AS sale_id,
      s.company_id     AS company_id,
      d.client_name    AS client_name,
      d.client_phone1  AS client_phone1,
      d.client_email   AS client_email,
      d.client_address AS client_address,
      s.total          AS total,
      COALESCE((
        SELECT SUM(p.amount)
        FROM public.sale_payments p
        WHERE p.sale_id = s.id
          AND p.method IS DISTINCT FROM 'other'::public.payment_method
      ), 0)            AS paid
    FROM public.sales s
    JOIN public.engine_sale_details d ON d.sale_id = s.id
    WHERE s.sale_kind = 'engine'
      AND s.status = 'completed'
      AND s.customer_id IS NULL
  LOOP
    -- Ne traiter que les ventes avec un reste réellement dû.
    IF (r.total - r.paid) <= 0.0001 THEN
      CONTINUE;
    END IF;

    v_phone := NULLIF(btrim(COALESCE(r.client_phone1, '')), '');
    v_customer_id := NULL;

    -- Dédoublonnage par téléphone exact (dans la même entreprise).
    IF v_phone IS NOT NULL THEN
      SELECT c.id INTO v_customer_id
      FROM public.customers c
      WHERE c.company_id = r.company_id
        AND c.phone = v_phone
      ORDER BY c.created_at
      LIMIT 1;
    END IF;

    -- Sinon : création d'une nouvelle fiche client.
    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (company_id, name, type, phone, email, address)
      VALUES (
        r.company_id,
        COALESCE(NULLIF(btrim(COALESCE(r.client_name, '')), ''), 'Client engin'),
        'individual'::public.customer_type,
        v_phone,
        NULLIF(btrim(COALESCE(r.client_email, '')), ''),
        NULLIF(btrim(COALESCE(r.client_address, '')), '')
      )
      RETURNING id INTO v_customer_id;
    END IF;

    UPDATE public.sales
    SET customer_id = v_customer_id,
        updated_at = now()
    WHERE id = r.sale_id
      AND customer_id IS NULL;  -- garde-fou (concurrence / ré-exécution)
  END LOOP;
END $$;
