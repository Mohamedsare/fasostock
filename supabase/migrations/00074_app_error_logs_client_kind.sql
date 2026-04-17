-- Distinction super-admin : erreurs app web (Next.js) vs app Flutter (mobile / desktop).

ALTER TABLE public.app_error_logs
  ADD COLUMN IF NOT EXISTS client_kind TEXT;

COMMENT ON COLUMN public.app_error_logs.client_kind IS
  'Origine client : web (FasoStock web), flutter (app Flutter), ou NULL (inconnu / ancien).';

CREATE INDEX IF NOT EXISTS idx_app_error_logs_client_kind
  ON public.app_error_logs(client_kind);

-- Rétro-remplissage (lignes sans client_kind explicite dans context).
UPDATE public.app_error_logs
SET client_kind = context->>'client_kind'
WHERE client_kind IS NULL
  AND context ? 'client_kind'
  AND btrim(context->>'client_kind') <> '';

UPDATE public.app_error_logs
SET client_kind = 'flutter'
WHERE client_kind IS NULL
  AND platform IS NOT NULL
  AND lower(btrim(platform)) <> 'web';

UPDATE public.app_error_logs
SET client_kind = 'web'
WHERE client_kind IS NULL
  AND lower(btrim(COALESCE(platform, ''))) = 'web';

CREATE OR REPLACE FUNCTION public.app_error_logs_sync_client_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.client_kind IS NULL OR btrim(NEW.client_kind) = '' THEN
    IF NEW.context ? 'client_kind' AND btrim(NEW.context->>'client_kind') <> '' THEN
      NEW.client_kind := NEW.context->>'client_kind';
    ELSIF NEW.platform IS NOT NULL AND lower(btrim(NEW.platform)) <> 'web' THEN
      NEW.client_kind := 'flutter';
    ELSIF lower(btrim(COALESCE(NEW.platform, ''))) = 'web' THEN
      NEW.client_kind := 'web';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_error_logs_client_kind ON public.app_error_logs;
CREATE TRIGGER trg_app_error_logs_client_kind
  BEFORE INSERT OR UPDATE ON public.app_error_logs
  FOR EACH ROW
  EXECUTE PROCEDURE public.app_error_logs_sync_client_kind();
