-- Realtime sur public.products (Flutter : Drift catalogue mis à jour hors sync périodique).
-- RLS filtre les lignes ; canal privé + JWT côté client (comme store_inventory / sales).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
