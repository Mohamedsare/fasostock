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
| `/forgot-password` | `resetPasswordForEmail` avec `redirectTo` → `/reset-password` |
| `/reset-password` | `PASSWORD_RECOVERY` / session → `updateUser({ password })` |

Configurer dans **Supabase Dashboard → Authentication → URL** le site en production et les redirections autorisées (`/reset-password`).

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
