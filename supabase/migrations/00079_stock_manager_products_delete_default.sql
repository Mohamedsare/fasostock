-- Magasinier : suppression produits incluse dans le profil par défaut (catalogue complet).
-- Idempotent pour les environnements où 00078 a déjà été appliqué avant l'ajout de products.delete.

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.slug = 'stock_manager' AND p.key = 'products.delete'
ON CONFLICT DO NOTHING;
