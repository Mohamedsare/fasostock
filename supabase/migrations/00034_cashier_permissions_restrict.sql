-- Caissier : ne garder que sales.create (Ventes). Retirer reports.view_store et cash.open_close.
-- Il ne voit que : Ventes, Produits, Clients, Stock (lecture seule) — géré côté app (nav + redirect).
DELETE FROM public.role_permissions
WHERE role_id = (SELECT id FROM public.roles WHERE slug = 'cashier')
  AND permission_id IN (SELECT id FROM public.permissions WHERE key IN ('reports.view_store', 'cash.open_close'));
