# FasoStock Web (Next.js)

Parité avec l’app Flutter : **Supabase**, **IndexedDB (Dexie)** pour l’outbox, **TanStack Query**, **PWA** (service worker en prod), **sync manager** pour rejouer la file hors ligne.

## Prérequis

- Node 20+
- Projet Supabase (URL + clé `anon`)

## Configuration

```bash
cd appweb
cp .env.local.example .env.local
# Renseigner NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

Sans `.env.local`, l’app redirige vers `/setup`.

### Authentification (alignée app Flutter)

| Route | Comportement |
|--------|----------------|
| `/login` | `get_login_lock_status` → `signInWithPassword` → `reset_login_attempts` / `record_failed_login` ; écran **compte bloqué** + WhatsApp / téléphone comme le mobile |
| `/register` | `signUp` → `profiles` upsert → RPC `create_company_with_owner` (même payload que `AuthService.registerCompany`) |
| `/forgot-password` | `POST /api/auth/forgot-password` → anti-abus (5 / 24 h) puis `resetPasswordForEmail` |
| `/auth/confirm` | Lien `token_hash` : `verifyOtp` côté serveur, session posée en cookies → `/reset-password` |
| `/auth/callback` | Lien `?code=` (PKCE, inscription). Sans `code`, renvoie vers `/reset-password` en laissant le fragment suivre |
| `/reset-password` | Établit la session depuis le lien (fragment / `token_hash` / `code` / cookie) → `updateUser({ password })` → `signOut` → `/login?password_updated=1` |

#### Récupération de mot de passe — les trois formes de lien

La demande part du **serveur** (`/api/auth/forgot-password`), donc **sans PKCE** : le lien
Supabase par défaut renvoie les jetons dans le **fragment** (`#access_token=…`), que le
serveur ne reçoit jamais. Les trois formes sont prises en charge :

| Lien reçu | Traitement |
|---|---|
| `#access_token=…&type=recovery` (gabarit `{{ .ConfirmationURL }}`, défaut) | `/auth/callback` redirige vers `/reset-password` — la cible n'ayant pas de fragment, le navigateur conserve celui d'origine (RFC 7231 §7.1.2) — puis le formulaire fait `setSession` |
| `?token_hash=…&type=recovery` (gabarit `supabase/email-templates/reset-password.html`, recommandé) | `/auth/confirm` fait `verifyOtp` côté serveur ; aucun jeton dans l'URL |
| `?code=…` (PKCE, demande partie du navigateur) | `exchangeCodeForSession` |

Ne **pas** faire échouer la demande quand le compteur anti-abus est indisponible : c'est
une protection secondaire (Supabase limite déjà `/recover`), et un `503` à cet endroit
supprime purement et simplement la récupération de mot de passe.

Configurer dans **Supabase Dashboard → Authentication → URL** le site en production
(`https://fasostock.com`) et les redirections autorisées (`/auth/confirm`, `/auth/callback`,
`/reset-password`).

## Architecture

| Dossier | Rôle |
|--------|------|
| `lib/supabase/` | Clients browser / server + rafraîchissement session (`proxy.ts` → `update-session.ts`) |
| `lib/config/` | `routes.ts`, `navigation.ts` (menu aligné Flutter), `page-title.ts` |
| `lib/db/` | Dexie — table `outbox` (file d’attente) |
| `lib/sync/` | `processOutbox`, `registerOutboxHandler` — aligner les `kind` avec Flutter |
| `lib/query/` | `QueryProvider`, `query-keys.ts` (TanStack Query) |
| `components/layout/` | `AppShell` : sidebar **≥1024px**, barre du bas **mobile** (3 + « Plus.. » comme Flutter) |
| `components/providers/` | `AppProviders` = Query + Sync |
| `components/pwa/` | Enregistrement SW en **production** uniquement |
| `public/sw.js` | Service worker minimal (extensible Workbox / Serwist) |

### Routes applicatives (`app/(app)/`)

Toutes les entrées du menu Flutter principal ont une page squelette : `dashboard`, `products`, `sales`, `stores`, `inventory`, `stock-c`, `purchases`, `warehouse`, `transfers`, `customers`, `suppliers`, `reports`, `ai`, `users`, `audit`, `settings`, `help`, `notifications`, `integrations`.

## Mobile first

- Thème FasoStock dans `app/globals.css` (`--fs-accent`, etc., cf. `cm.md` à la racine du repo).
- Barre de navigation fixe en bas + `safe-area-inset-bottom`.
- Bandeau **hors ligne** (`OfflineStrip`) quand `navigator.onLine === false`.

## Prochaines étapes

1. Implémenter les handlers dans `lib/sync/register-handlers.ts` (équivalent `sync_service_v2.dart`).
2. Ajouter les routes et écrans listés dans `cm.md` (POS, magasin, admin…).
3. Optionnel : icônes PWA dans `public/icons/` + entrée `icons` dans `app/manifest.ts`.
4. Optionnel : `@serwist/next` ou Workbox pour stratégie de cache précise.

## Notes Next.js 16

La convention **`proxy.ts`** (remplace `middleware.ts`) rafraîchit la session Supabase sur les routes matchées ; voir [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
