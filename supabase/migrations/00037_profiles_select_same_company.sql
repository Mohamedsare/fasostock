-- Permettre de lire le profil (full_name) des utilisateurs de la même entreprise,
-- pour afficher "Vente par X" dans le détail d'une vente.
CREATE POLICY "profiles_select_same_company" ON public.profiles FOR SELECT USING (
  id IN (
    SELECT ucr.user_id FROM public.user_company_roles ucr
    WHERE ucr.company_id IN (SELECT * FROM current_user_company_ids())
      AND ucr.is_active = true
  )
);
