# Données absentes (entreprise / boutiques vides)

Si après connexion vous ne voyez aucune entreprise ou aucune boutique, vérifier les points suivants.

## 1. Mauvaise URL ou clé

- Fichier **`.env`** (ou variables d’environnement en production) :
  - `VITE_SUPABASE_URL` doit être l’URL de votre projet, ex. `https://xxxxx.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` doit être la **clé anon** du même projet (Dashboard → Project Settings → API).
- En production (ex. Vercel), définir les mêmes variables dans les paramètres du projet puis redéployer.
- Si l’URL ou la clé est incorrecte, les requêtes échouent ou renvoient vide ; ouvrir la **console du navigateur** (F12) et regarder les erreurs `[CompanyContext]` (user_company_roles, companies, stores).

## 2. Mauvais projet

- L’URL contient le **project ref** (ex. `ryuejsjdtayireovhbuq` dans `https://ryuejsjdtayireovhbuq.supabase.co`).
- Vérifier dans **Supabase Dashboard** que vous êtes bien dans ce projet (nom du projet en haut à gauche).
- Vérifier dans **Table Editor** que les tables `companies` et `stores` existent et contiennent des lignes pour votre compte (création d’entreprise / boutiques).

## 3. RLS (Row Level Security)

Les politiques RLS limitent ce que chaque utilisateur peut voir :

- **Entreprises** : visibles seulement si l’utilisateur a une ligne dans `user_company_roles` pour cette entreprise, avec `is_active = true`.
- **Boutiques** : visibles seulement pour les entreprises auxquelles l’utilisateur a accès (même logique).

À vérifier :

- Vous êtes connecté avec le **compte owner** (créateur de l’entreprise), pas avec un autre compte (ex. un utilisateur créé via la page Utilisateurs qui n’a pas encore de rôle actif).
- Dans **Table Editor** → `user_company_roles` : une ligne avec votre `user_id`, le bon `company_id`, et `is_active = true`.
- Si vous venez de déployer des migrations, exécuter **toutes** les migrations sur ce projet (y compris `00025_grants_stores.sql` qui donne SELECT sur `stores`). Puis dans le SQL Editor : `NOTIFY pgrst, 'reload schema';`

## 4. Requête frontend cassée

- Le chargement des entreprises et boutiques se fait dans **`src/context/CompanyContext.tsx`** :
  - d’abord `user_company_roles` (user_id + is_active = true),
  - puis `companies` (id dans la liste des company_id),
  - puis `stores` (company_id + is_active = true).
- En cas d’erreur Supabase, le message est loggé dans la **console** avec le préfixe `[CompanyContext]` (user_company_roles / companies / stores). Vérifier le message et le code d’erreur (ex. PGRST301, 403).
- Utiliser le bouton **Rafraîchir** (icône à côté de « Entreprise » dans la barre latérale) pour recharger les données.

## Résumé

| Cause probable | Où vérifier |
|----------------|-------------|
| URL/clé | `.env` et Dashboard → Project Settings → API |
| Mauvais projet | URL du navigateur vs projet dans le Dashboard |
| RLS / pas de rôle | `user_company_roles` : votre user_id, company_id, is_active = true |
| GRANT manquant | Migrations appliquées (ex. 00025) puis `NOTIFY pgrst, 'reload schema'` |

Si le problème continue, noter le message exact dans la console (F12) pour les requêtes `[CompanyContext]` et le partager pour un diagnostic ciblé.
