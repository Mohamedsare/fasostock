# Déployer les Edge Functions (création d'utilisateurs)

Si la création d'utilisateurs affiche **"Failed to send a request to the Edge Function"**, c'est que les fonctions Supabase n'ont pas été déployées sur votre projet.

## Prérequis

- Projet Supabase hébergé (supabase.com), pas seulement en local
- [Supabase CLI](https://supabase.com/docs/guides/cli) installée
- Connexion à votre projet : `supabase link --project-ref <votre-project-ref>`

## Si vous avez une erreur 401 (Unauthorized)

Le projet utilise `verify_jwt = false` pour ces fonctions dans `config.toml` : la passerelle Supabase ne vérifie plus le JWT, et c’est la fonction qui valide le token (Bearer) elle-même. **Il faut redéployer** après toute modification de `config.toml` pour que ce réglage soit pris en compte.

## Déployer la fonction de création d'utilisateur

```bash
# À la racine du projet (c:\SOFCOM)
supabase functions deploy create-company-user
supabase functions deploy reset-user-password
```

Pour réinitialiser le mot de passe des membres :

```bash
supabase functions deploy reset-user-password
```

## Variables d'environnement (Supabase Dashboard)

Les Edge Functions utilisent automatiquement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` (définis par Supabase). Vérifiez dans **Dashboard → Project Settings → Edge Functions** que les secrets éventuels sont bien configurés.

## Tester en local

Si vous utilisez Supabase en local (`supabase start`) :

```bash
supabase functions serve create-company-user
```

Puis assurez-vous que votre app pointe vers l’URL locale (ex. `http://127.0.0.1:54321` pour l’API).
