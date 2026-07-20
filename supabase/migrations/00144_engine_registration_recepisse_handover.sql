-- Immatriculation Engins — suivi de la REMISE du récépissé au client.
--
-- Contexte métier : une fois le récépissé sorti (après dépôt au ministère), on le
-- remet au client. Les clients reviennent parfois contester la remise. Il faut donc
-- une trace auditable : date de remise + agent qui a remis + nom de la personne qui
-- a réceptionné (client ou mandataire). Distinct du récépissé « reçu » (recepisse_*).

ALTER TABLE public.engine_registrations
  ADD COLUMN IF NOT EXISTS recepisse_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recepisse_delivered_date date,
  ADD COLUMN IF NOT EXISTS recepisse_delivered_by text,
  ADD COLUMN IF NOT EXISTS recepisse_received_by text;

COMMENT ON COLUMN public.engine_registrations.recepisse_delivered IS
  'Récépissé physiquement remis au client (preuve anti-litige). Défaut false.';
COMMENT ON COLUMN public.engine_registrations.recepisse_delivered_date IS
  'Date de remise du récépissé au client.';
COMMENT ON COLUMN public.engine_registrations.recepisse_delivered_by IS
  'Agent (nom) ayant remis le récépissé.';
COMMENT ON COLUMN public.engine_registrations.recepisse_received_by IS
  'Nom de la personne ayant réceptionné le récépissé (client ou mandataire).';
