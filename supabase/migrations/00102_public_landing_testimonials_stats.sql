-- Réglages publics de la section "Témoignages" (stats pilotables depuis GPublique).

INSERT INTO public.public_landing_settings (key, value) VALUES
  ('testimonials_stat_1_value', '500+'),
  ('testimonials_stat_1_label', 'Commerçants utilisent déjà FasoStock'),
  ('testimonials_stat_2_value', '30+'),
  ('testimonials_stat_2_label', 'Types de commerces accompagnés'),
  ('testimonials_stat_3_value', '98%'),
  ('testimonials_stat_3_label', 'De clients satisfaits selon nos retours'),
  ('testimonials_stat_4_value', '+25%'),
  ('testimonials_stat_4_label', 'D''augmentation moyenne de performance')
ON CONFLICT (key) DO NOTHING;

