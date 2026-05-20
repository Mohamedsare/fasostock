# Emails Supabase Auth (UI FasoStock)

Les emails d’**authentification** (confirmation d’inscription, mot de passe oublié) sont envoyés par **Supabase Auth**, pas par Resend — sauf si vous configurez le SMTP personnalisé ci-dessous.

Les fichiers HTML de ce dossier reprennent le même style que les emails transactionnels (`lib/email/templates/`).

## 1. Activer la confirmation email

**Supabase Dashboard** → **Authentication** → **Providers** → **Email** :

- Cocher **Confirm email**
- **Site URL** : `https://fasostock.com`
- **Redirect URLs** (toutes obligatoires pour reset + inscription) :
  - `https://fasostock.com/auth/callback`
  - `https://fasostock.com/reset-password`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/reset-password`

## 2. Coller les templates HTML

**Authentication** → **Email Templates** :

| Template Supabase   | Fichier à copier              | Sujet recommandé                          |
|---------------------|-------------------------------|-------------------------------------------|
| **Confirm signup**  | `confirm-signup.html`         | `Confirmez votre compte FasoStock`        |
| **Reset password**  | `reset-password.html`         | `Réinitialisez votre mot de passe FasoStock` |

1. Ouvrir le fichier `.html` dans ce dossier.
2. Copier tout le HTML (sans les commentaires `<!--` en tête si vous préférez).
3. Coller dans le corps du template Supabase (mode **Source** / HTML si disponible).
4. Enregistrer.

Les variables `{{ .ConfirmationURL }}` et `{{ .Email }}` sont **obligatoires** — ne les supprimez pas.

## 3. (Recommandé) Envoyer via Resend (même expéditeur que le reste)

Pour que l’email parte de `noreply@fasostock.com` (meilleure délivrabilité, même domaine que Resend) :

**Authentication** → **SMTP Settings** → activer **Custom SMTP** :

| Champ        | Valeur                              |
|-------------|--------------------------------------|
| Host        | `smtp.resend.com`                    |
| Port        | `465` (SSL) ou `587` (TLS)           |
| Username    | `resend`                             |
| Password    | Votre clé API Resend (`re_…`)        |
| Sender email| `noreply@fasostock.com`              |
| Sender name | `FasoStock`                          |

Le domaine `fasostock.com` doit être **vérifié** dans Resend (comme pour les emails transactionnels).

## 4. Tester

1. Créer un compte test sur `/register`.
2. Vérifier la boîte mail (et **spams**).
3. Le mail doit afficher l’en-tête orange FasoStock + bouton **Confirmer mon email**.
4. Inscription : le lien doit rediriger vers `https://fasostock.com/auth/callback` puis le tableau de bord.
5. Mot de passe oublié : demander un lien sur `/forgot-password`, cliquer l’email → page **Nouveau mot de passe** (`/reset-password`), pas la landing `/`.
   - Si vous arrivez sur `/` avec `?code=…` dans l’URL, le site doit vous renvoyer vers `/reset-password` (code déployé + URLs Supabase ci-dessus).
   - **Demandez un nouvel email** après chaque changement de config ou de déploiement (l’ancien lien garde l’ancienne URL).

## 5. Aperçu local (optionnel)

Les templates Resend transactionnels ont une route de test super-admin : `/api/test-email`.

Les templates Supabase Auth se testent uniquement via une vraie inscription ou le bouton **Send test email** du dashboard Supabase (si disponible sur votre plan).
