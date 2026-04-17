# Créer un super admin facilement

En 3 étapes, sans toucher à la ligne de commande.

---

## Étape 1 : Créer l’utilisateur dans le Dashboard

1. Ouvrez votre projet sur [Supabase](https://supabase.com/dashboard).
2. Menu **Authentication** → **Users**.
3. Cliquez sur **Add user** → **Create new user**.
4. Renseignez :
   - **Email** : l’email du futur super admin (ex. `admin@monapp.com`)
   - **Password** : un mot de passe sûr
5. Cliquez sur **Create user**.

---

## Étape 2 : Lui donner les droits super admin

1. Dans le Dashboard : **SQL Editor** → **New query**.
2. Ouvrez le fichier **`creer_super_admin_facile.sql`** (dans le dossier `supabase/` du projet).
3. À la ligne qui contient `v_email TEXT := '...'`, remplacez l’email entre guillemets par **celui créé à l’étape 1**.
4. Copiez **tout** le contenu du fichier dans la requête SQL.
5. Cliquez sur **Run**.

Vous devez voir un message du type : `Super admin créé avec succès : votre@email.com`.

---

## Étape 3 : Se connecter à l’app

1. Allez sur votre application (page de connexion).
2. Connectez-vous avec **l’email et le mot de passe** de l’étape 1.
3. Après connexion, vous devez voir **« Admin plateforme »** en bas du menu (sidebar).
4. Cliquez dessus pour accéder au tableau de bord super admin (entreprises, boutiques, etc.).

---

## En cas de problème

- **Erreur « Utilisateur non trouvé »** : l’email dans le script ne correspond pas à celui créé à l’étape 1. Vérifiez l’orthographe et les guillemets.
- **Erreur 500 au login** : le script a bien été exécuté ? Il corrige aussi les tokens. Réexécutez-le puis réessayez de vous connecter.
- **Connecté mais pas « Admin plateforme »** : déconnectez-vous, reconnectez-vous (ou rechargez la page) pour que le profil soit rechargé.
