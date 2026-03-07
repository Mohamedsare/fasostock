-- Configuration imprimante de tickets (58 mm ou 80 mm)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS receipt_printer_width TEXT DEFAULT '80' CHECK (receipt_printer_width IN ('58', '80'));

COMMENT ON COLUMN settings.receipt_printer_width IS 'Largeur du rouleau thermique en mm: 58 ou 80';

-- Impression automatique du ticket après chaque vente
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS receipt_auto_print BOOLEAN DEFAULT false;

COMMENT ON COLUMN settings.receipt_auto_print IS 'Si true, lance l''impression du ticket automatiquement à l''affichage du reçu';
