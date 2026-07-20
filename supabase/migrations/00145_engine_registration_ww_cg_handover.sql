-- Immatriculation Engins — suivi de la REMISE au client du WW et de la CARTE GRISE.
--
-- Même exigence anti-litige que le récépissé (cf. 00144) : le WW (carte provisoire)
-- et la carte grise définitive sont remis en main propre au client ; il faut tracer
-- qui a remis, quand, et qui a réceptionné (client ou mandataire).
--
-- Carte grise : la DATE de remise réutilise la colonne existante
-- `delivered_to_client_date` ; on ajoute seulement le flag + les personnes.

ALTER TABLE public.engine_registrations
  -- WW (carte provisoire)
  ADD COLUMN IF NOT EXISTS ww_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ww_delivered_date date,
  ADD COLUMN IF NOT EXISTS ww_delivered_by text,
  ADD COLUMN IF NOT EXISTS ww_received_by text,
  -- Carte grise (la date de remise = delivered_to_client_date, déjà présente)
  ADD COLUMN IF NOT EXISTS carte_grise_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carte_grise_delivered_by text,
  ADD COLUMN IF NOT EXISTS carte_grise_received_by text;

COMMENT ON COLUMN public.engine_registrations.ww_delivered IS
  'WW physiquement remis au client (preuve anti-litige). Défaut false.';
COMMENT ON COLUMN public.engine_registrations.ww_delivered_date IS
  'Date de remise du WW au client.';
COMMENT ON COLUMN public.engine_registrations.ww_delivered_by IS
  'Agent (nom) ayant remis le WW.';
COMMENT ON COLUMN public.engine_registrations.ww_received_by IS
  'Nom de la personne ayant réceptionné le WW (client ou mandataire).';
COMMENT ON COLUMN public.engine_registrations.carte_grise_delivered IS
  'Carte grise physiquement remise au client (preuve anti-litige). Date = delivered_to_client_date.';
COMMENT ON COLUMN public.engine_registrations.carte_grise_delivered_by IS
  'Agent (nom) ayant remis la carte grise.';
COMMENT ON COLUMN public.engine_registrations.carte_grise_received_by IS
  'Nom de la personne ayant réceptionné la carte grise (client ou mandataire).';

-- Rétro-cohérence : les dossiers déjà « remis » (delivered_to_client_date renseignée)
-- sont marqués carte_grise_delivered = true.
UPDATE public.engine_registrations
SET carte_grise_delivered = true
WHERE delivered_to_client_date IS NOT NULL
  AND carte_grise_delivered = false;
