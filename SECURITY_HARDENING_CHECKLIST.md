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

## 3) API Protection
- Routes `/api/*` (sauf liste publique) : session obligatoire via `proxy.ts` / `update-session.ts`
- Push : `notify-company-owners` réservé aux owners ; webhook `dispatch` exige `companyId` + membre actif
- IA : contexte reconstruit côté serveur (`/api/ai/predictions`) — le client n’envoie plus `contextText`
- PDF facture (`/api/pdf/invoice`) : `saleId`, `warehouseDispatchId` ou `previewOnly` + vérification en base
- PDF reçu crédit (`/api/pdf/credit-repayment-receipt`) : `paymentId` obligatoire, montants/ids validés en base
- QZ (`/api/qz/sign`) : owner, `store_manager` ou permission `settings.manage` uniquement
- Routes app : garde serveur (`ServerRouteGuard` + `x-pathname`) en complément de la garde client
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

