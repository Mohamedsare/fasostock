-- Realtime sur public.product_images (Flutter : vignette Drift après fetch léger).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.product_images;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
