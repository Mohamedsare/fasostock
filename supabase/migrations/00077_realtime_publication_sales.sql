-- Realtime sur public.sales (Flutter : Drift mis à jour hors sync périodique).
-- RLS existant filtre les lignes ; canal privé + JWT côté client (comme store_inventory).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
