-- Droits applicatifs des modules Comptabilité et R. Humaine + Paie.
-- Owner par défaut ; accordables aux autres rôles via la gestion des droits.
-- (La visibilité réelle dépend en plus des flags plateforme accounting_module_enabled / hr_module_enabled.)

INSERT INTO public.permissions (id, key) VALUES
  (uuid_generate_v4(), 'accounting.view'),
  (uuid_generate_v4(), 'accounting.manage'),
  (uuid_generate_v4(), 'accounting.settings'),
  (uuid_generate_v4(), 'hr.view'),
  (uuid_generate_v4(), 'hr.manage'),
  (uuid_generate_v4(), 'payroll.view'),
  (uuid_generate_v4(), 'payroll.manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'owner'
  AND p.key IN (
    'accounting.view', 'accounting.manage', 'accounting.settings',
    'hr.view', 'hr.manage', 'payroll.view', 'payroll.manage'
  )
ON CONFLICT DO NOTHING;
