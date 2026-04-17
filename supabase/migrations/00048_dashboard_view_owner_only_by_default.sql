-- Par défaut seul l'owner a dashboard.view ; les autres rôles ne l'ont pas (l'owner peut l'accorder à qui il veut).
-- Retire dashboard.view des rôles manager, store_manager, accountant, viewer pour les bases ayant déjà exécuté 00047.
DELETE FROM public.role_permissions
WHERE permission_id = (SELECT id FROM public.permissions WHERE key = 'dashboard.view' LIMIT 1)
  AND role_id IN (SELECT id FROM public.roles WHERE slug IN ('manager', 'store_manager', 'accountant', 'viewer'));
