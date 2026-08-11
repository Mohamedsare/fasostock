# Security Hardening Checklist (Production)

This project already uses Supabase RLS and admin checks, but keep this checklist for continuous hardening.

## 1) Secrets and Environment
- Ensure these secrets are set in production only:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `WEB_PUSH_WEBHOOK_SECRET`
  - `NEWSLETTER_RATE_LIMIT_PEPPER`
  - `TURNSTILE_SECRET_KEY` (if anti-bot challenge is enabled)
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public site key for the widget)
- Never expose server secrets through `NEXT_PUBLIC_*`.
- Rotate secrets every 90 days or immediately after suspected leak.

## 2) Database Security
- Keep RLS enabled on all business tables.
- Validate policies after each migration (`anon`, `authenticated`, `service_role` behaviors).
- Audit super-admin RPC/functions for least privilege.
- **Migration `00114_security_hardening_core.sql`** (apply on every environment):
  - Trigger `profiles` : blocage auto-promotion `is_super_admin`
  - `user_company_roles` : UPDATE réservé aux owners ; INSERT direct limité au premier membre
  - `companies` : plus d’INSERT client libre (RPC `create_company_with_owner` uniquement)
  - `log_app_error` : `company_id` / `store_id` validés pour l’appelant

## 2 bis) Sessions — « rester connecté »

Règle produit : **une session ne se termine que si l'utilisateur appuie sur « Se déconnecter »**.
Un commerçant en caisse ne doit jamais être éjecté par une expiration ou une coupure réseau.

À vérifier dans le tableau de bord Supabase (*Authentication → Sessions*), et reflété dans
`supabase/config.toml` :

| Réglage | Valeur attendue | Pourquoi |
|---|---|---|
| Time-box user sessions | **None** (vide) | Sinon déconnexion forcée au bout du délai. |
| Inactivity timeout | **None** (vide) | Sinon déconnexion après une pause. |
| Refresh token reuse interval | **60 s** (défaut 10 s) | Rendu serveur : proxy, onglets et PWA peuvent prolonger la session en même temps. En dessous, Supabase y voit une réutilisation de jeton volé et révoque **toute** la session. |
| Detect and revoke potentially compromised refresh tokens (rotation) | **activé** | Protection conservée ; c'est l'intervalle ci-dessus qui absorbe les prolongations concurrentes. |
| JWT expiry | 3600 s | Le jeton d'accès reste court ; c'est le rafraîchissement qui assure la continuité. |

Côté application (ne pas régresser) :
- `lib/supabase/auth-cookies.ts` — cookies d'auth forcés à 400 jours (jamais de cookie de session).
- `lib/auth/server-session.ts` — les layouts ne renvoient au login que sur une **certitude** de
  déconnexion ; une panne réseau laisse l'utilisateur dans l'app.
- `lib/supabase/update-session.ts` — seul endroit qui peut enregistrer un jeton de
  rafraîchissement renouvelé : ne jamais y sauter l'étape quand un cookie de session existe.
- `components/auth/session-keeper.tsx` — prolongation au réveil de l'app / retour du réseau.

## 3) API Protection
- Routes `/api/*` (sauf liste publique) : session obligatoire via `proxy.ts` / `update-session.ts`
- Push : `notify-company-owners` réservé aux owners ; webhook `dispatch` exige `companyId` + membre actif
- IA : contexte reconstruit côté serveur (`/api/ai/predictions`) — le client n’envoie plus `contextText`
- PDF facture (`/api/pdf/invoice`) : `saleId`, `warehouseDispatchId` ou `previewOnly` + vérification en base
- PDF reçu crédit (`/api/pdf/credit-repayment-receipt`) : `paymentId` obligatoire, montants/ids validés en base
- QZ (`/api/qz/sign`) : owner, `store_manager` ou permission `settings.manage` uniquement
- Routes app : garde serveur (`ServerRouteGuard` + `x-pathname`) en complément de la garde client
- Emails plateforme : `PLATFORM_ADMIN_EMAIL` + cron `/api/cron/platform-digest` (22h UTC) + alerte nouvelle entreprise à l'inscription
- Newsletter endpoint now has:
  - email validation
  - honeypot anti-bot
  - minimum human submit time
  - per-IP rate limit window
  - optional Turnstile verification
- Add equivalent rate limiting to other public endpoints if exposed.

## 4) Security Headers
- Global headers configured in `next.config.ts`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`
  - `Cross-Origin-Opener-Policy`
  - `Cross-Origin-Resource-Policy`
  - `Strict-Transport-Security` (production)

## 5) Monitoring and Incident Response
- Monitor:
  - auth failures and lockouts
  - spike in newsletter attempts / 429
  - admin actions and audit trails
- Define response procedure:
  - revoke compromised keys
  - block abusive IP ranges at edge/WAF
  - notify affected users if required

## 6) Deployment Guardrails
- Enforce HTTPS only in production.
- Keep dependencies updated (monthly).
- Run lint + typecheck + migration review before release.

